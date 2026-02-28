#!/usr/bin/env python3
"""
manim_publisher.py

Renders step-by-step vector field equation explanations and streams RGBA
frames to ws-relay for display on the ExplanatoryPanel in Lens Studio.

Supports two renderers:
  1. ManimGL (3b1b's version) - beautiful LaTeX + animations
  2. PIL fallback - works everywhere, static equation cards

Pipeline:
  [This script] --binary RGBA frames--> [ws-relay] --ws--> [ExplanatoryPanel.ts]
  [ExplanatoryPanel.ts] --field_state--> [ws-relay] --ws--> [This script]

Usage:
  python manim_publisher.py                          # stream to relay
  python manim_publisher.py --relay ws://localhost:8766
  python manim_publisher.py --test                   # render PNGs, no relay
  python manim_publisher.py --renderer pil           # force PIL fallback

Dependencies:
  pip install websocket-client numpy Pillow           # minimum (PIL renderer)
  pip install manimgl websocket-client numpy Pillow   # full (ManimGL renderer)

Coordinate Conventions:
  ManimGL:  right-handed, Y-up, camera looks along -Z, FOV 45° vertical
  LS:       left-handed, Y-up, texture origin bottom-left (GL convention)

  Frame orientation: we send top-down RGBA. ExplanatoryPanel.applyPixels()
  flips vertically for LS ProceduralTexture. Result: correct on-screen.

  The explanatory content is 2D (equations on a flat panel). Camera state
  from ExplanatoryPanel is logged but not used to transform the view.
"""

import sys
import os
import json
import time
import struct
import threading
import argparse
import numpy as np
from pathlib import Path
from typing import Optional, Dict, Any

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

WIDTH = 512
HEIGHT = 512
FPS = 10

# ---------------------------------------------------------------------------
# Parse args FIRST (before manimgl import, which hijacks argparse)
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(description="Stream field equation explanations to ws-relay")
    parser.add_argument("--relay", default="ws://localhost:8766", help="ws-relay URL")
    parser.add_argument("--channel", default="vector-field", help="Relay channel")
    parser.add_argument("--renderer", choices=["manim", "pil", "auto"], default="auto")
    parser.add_argument("--test", action="store_true", help="Render PNGs locally, no relay")
    parser.add_argument("--width", type=int, default=WIDTH)
    parser.add_argument("--height", type=int, default=HEIGHT)
    parser.add_argument("--fps", type=int, default=FPS)
    return parser.parse_args()

# Parse before any heavy imports
_ARGS = parse_args() if __name__ == "__main__" else None

# ---------------------------------------------------------------------------
# Renderer availability (lazy imports to avoid manimgl argparse conflict)
# ---------------------------------------------------------------------------

HAS_MANIMGL = False
HAS_PIL = False
HAS_WS = False

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    pass

# Only probe manimgl if we might use it (don't import at top level)
if _ARGS is None or _ARGS.renderer != "pil":
    try:
        os.environ['MANIMGL_SHOW_WINDOW'] = '0'
        # Clear sys.argv to prevent manimgl from parsing our args
        _saved_argv = sys.argv
        sys.argv = [sys.argv[0]]
        import manimlib
        HAS_MANIMGL = True
        sys.argv = _saved_argv
    except ImportError:
        if _ARGS:
            sys.argv = _saved_argv
    except Exception:
        if _ARGS:
            sys.argv = _saved_argv

try:
    import websocket
    HAS_WS = True
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


FIELD_PRESETS = {
    # (mode, preset) -> display info
    # "equation": Unicode summary for PIL renderer
    # "latex": LaTeX for ManimGL renderer
    # "components": list of (name, latex, unicode_display)
    (0, 0): {
        "name": "Expansion",
        "category": "Vector Field",
        "equation": "F(p) = r\u0302 \u00b7 sin(|r|\u00b7s\u00b72) + perp(p)",
        "latex": r"\vec{F}(\vec{p}) = \hat{r} \cdot \sin(|\vec{r}| \cdot s \cdot 2) \cdot \frac{1}{2} + \frac{1}{2} + \vec{P}_{\perp}",
        "components": [
            ("Radial",
             r"\hat{r} = \frac{\vec{p} - \vec{T}}{|\vec{p} - \vec{T}|}",
             "r\u0302 = (p \u2212 T) / |p \u2212 T|"),
            ("Wave",
             r"w = \sin(|\vec{r}| \cdot s \cdot 2) \cdot 0.5 + 0.5",
             "w = sin(|r|\u00b7s\u00b72) \u00b7 0.5 + 0.5"),
            ("Perpendicular",
             r"\vec{P}_\perp = \begin{pmatrix} \sin(r_y s)\cos(r_z s) \\ \sin(r_z s)\cos(r_x s) \\ \sin(r_x s)\cos(r_y s) \end{pmatrix}",
             "P\u27c2 = [sin(ry\u00b7s)cos(rz\u00b7s),\n            sin(rz\u00b7s)cos(rx\u00b7s),\n            sin(rx\u00b7s)cos(ry\u00b7s)]"),
        ],
        "description": "Radial waves expanding from target\nwith sinusoidal modulation and\nperpendicular oscillation for 3D depth.",
        "color": (96, 165, 250),  # #60a5fa
    },
    (0, 1): {
        "name": "Contraction",
        "category": "Vector Field",
        "equation": "F(p) = \u2212r\u0302 \u00b7 w(|r|) + twist(p)",
        "latex": r"\vec{F}(\vec{p}) = -\hat{r} \cdot w(|\vec{r}|) + \vec{T}_{twist}",
        "components": [
            ("Inward",
             r"-\hat{r} = -\frac{\vec{p} - \vec{T}}{|\vec{p} - \vec{T}|}",
             "\u2212r\u0302 = \u2212(p \u2212 T) / |p \u2212 T|"),
            ("Wave",
             r"w = \sin(|\vec{r}| \cdot s \cdot 2) \cdot 0.3 + 0.7",
             "w = sin(|r|\u00b7s\u00b72) \u00b7 0.3 + 0.7"),
            ("Twist",
             r"\vec{T} = \begin{pmatrix} \sin(r_z s + r_y s/2) \\ \cos(r_x s + r_z s/2) \\ \sin(r_y s + r_x s/2) \end{pmatrix}",
             "T = [sin(rz\u00b7s + ry\u00b7s/2),\n       cos(rx\u00b7s + rz\u00b7s/2),\n       sin(ry\u00b7s + rx\u00b7s/2)]"),
        ],
        "description": "Spiraling inward toward target\nwith wave modulation and\nrotational twist components.",
        "color": (147, 197, 253),  # #93c5fd
    },
    (0, 2): {
        "name": "Circulation",
        "category": "Vector Field",
        "equation": "F(p) = mix(\u03c4xz, \u03c4xy, \u03b1) \u00b7 w",
        "latex": r"\vec{F} = \text{mix}(\vec{\tau}_{xz}, \vec{\tau}_{xy}, \alpha) \cdot w",
        "components": [
            ("XZ tangent",
             r"\vec{\tau}_{xz} = \frac{(-r_z, 0, r_x)}{|r_{xz}|}",
             "\u03c4xz = (\u2212rz, 0, rx) / |rxz|"),
            ("XY tangent",
             r"\vec{\tau}_{xy} = \frac{(-r_y, r_x, 0)}{|r_{xy}|}",
             "\u03c4xy = (\u2212ry, rx, 0) / |rxy|"),
            ("Blend",
             r"\alpha = \sin(r_y \cdot s) \cdot 0.5 + 0.5",
             "\u03b1 = sin(ry\u00b7s) \u00b7 0.5 + 0.5"),
        ],
        "description": "3D vortex blending XZ and XY\nrotations with vertical oscillation\nand distance-based wave modulation.",
        "color": (96, 165, 250),  # #60a5fa
    },
    (0, 3): {
        "name": "Waves",
        "category": "Vector Field",
        "equation": "F = 0.35 \u00b7 (sin\u00b7cos, sin\u00b7cos, sin\u00b7cos)",
        "latex": r"\vec{F} = 0.35 \begin{pmatrix} \sin(r_y s)\cos(r_z s/2) \\ \sin(r_z s)\cos(r_x s/2) \\ \sin(r_x s)\cos(r_y s/2) \end{pmatrix}",
        "components": [
            ("X",
             r"F_x = \sin(r_y \cdot s) \cdot \cos(r_z \cdot s/2)",
             "Fx = sin(ry\u00b7s) \u00b7 cos(rz\u00b7s/2)"),
            ("Y",
             r"F_y = \sin(r_z \cdot s) \cdot \cos(r_x \cdot s/2)",
             "Fy = sin(rz\u00b7s) \u00b7 cos(rx\u00b7s/2)"),
            ("Z",
             r"F_z = \sin(r_x \cdot s) \cdot \cos(r_y \cdot s/2)",
             "Fz = sin(rx\u00b7s) \u00b7 cos(ry\u00b7s/2)"),
        ],
        "description": "Sinusoidal interference pattern\nwhere each axis modulates the others.\nPure trigonometric field.",
        "color": (52, 211, 153),  # emerald
    },
    (0, 4): {
        "name": "Vortex",
        "category": "Vector Field",
        "equation": "F(p) = cells(p) + spin(\u03b8)",
        "latex": r"\vec{F} = \vec{C}(\vec{p}) + \vec{S}(\theta)",
        "components": [
            ("Cells",
             r"\vec{C} = \begin{pmatrix} \sin(r_z s')\cos(r_y s'/2) \\ \sin(r_x s')\cos(r_z s'/2) \\ \sin(r_y s')\cos(r_x s'/2) \end{pmatrix}",
             "C = [sin(rz\u00b7s')cos(ry\u00b7s'/2),\n       sin(rx\u00b7s')cos(rz\u00b7s'/2),\n       sin(ry\u00b7s')cos(rx\u00b7s'/2)]"),
            ("Angle",
             r"\theta = \text{atan2}(r_z, r_x)",
             "\u03b8 = atan2(rz, rx)"),
            ("Spin",
             r"\vec{S} = 0.3 \cdot (-\sin\theta,\; 0,\; \cos\theta)",
             "S = 0.3 \u00b7 (\u2212sin\u03b8, 0, cos\u03b8)"),
        ],
        "description": "Rotating cellular pattern with\nangular spin component.\ns' = 0.7s reduces cell frequency.",
        "color": (251, 191, 36),  # amber
    },
    (1, 0): {
        "name": "Magnetic Dipole",
        "category": "Magnetic Field",
        "equation": "B = \u03a3 (3(m\u00b7r\u0302)r\u0302 \u2212 m) / r\u00b3",
        "latex": r"\vec{B} = \sum_{i=1}^{2} \frac{3(\vec{m}_i \cdot \hat{r}_i)\hat{r}_i - \vec{m}_i}{|\vec{r}_i|^3} \cdot k",
        "components": [
            ("Dipole",
             r"\vec{B}_i = \frac{3(\vec{m}_i \cdot \hat{r}_i)\hat{r}_i - \vec{m}_i}{r_i^3}",
             "Bi = (3(mi\u00b7r\u0302i)r\u0302i \u2212 mi) / ri\u00b3"),
            ("Superposition",
             r"\vec{B}_{total} = \vec{B}_1 + \vec{B}_2",
             "Btotal = B1 + B2"),
            ("Tone mapping",
             r"|\vec{B}_{out}| = \frac{|\vec{B}|}{1 + |\vec{B}| \cdot 0.5}",
             "|Bout| = |B| / (1 + |B|\u00b70.5)"),
        ],
        "description": "Two magnetic dipoles with classical\ninverse-cube field. Superposition\nwith soft tone mapping for display.",
        "color": (248, 113, 113),  # red-400
    },
}


# ---------------------------------------------------------------------------
# Binary frame protocol (matches cube-publisher-canvas.ts)
# ---------------------------------------------------------------------------

def encode_frame(pixels: np.ndarray, width: int, height: int) -> bytes:
    """
    Encode RGBA pixels into the binary frame protocol.

    Header: type(1) + width(2 LE) + height(2 LE) + timestamp(4 LE)
            + format(1) + idLen(1) + id(idLen)
    Body:   RGBA pixels

    pixels: numpy array (H, W, 4) uint8, top-down row order
    """
    tile_id = b"panel"
    header = struct.pack(
        "<BHHIB",
        0x01,                           # type: full frame
        width,                          # width
        height,                         # height
        int(time.time()) & 0xFFFFFFFF,  # timestamp
        1,                              # format: 1 = RGBA
    )
    header += struct.pack("B", len(tile_id)) + tile_id
    return header + pixels.tobytes()


# ---------------------------------------------------------------------------
# WebSocket relay client (threaded)
# ---------------------------------------------------------------------------

class RelayClient:
    """Connects to ws-relay, receives field/camera state, sends frames."""

    def __init__(self, url: str, channel: str):
        self.url = f"{url}?channel={channel}"
        self.ws: Optional[Any] = None
        self.connected = False
        self.lock = threading.Lock()

        # Shared state (written by WS thread, read by main thread)
        self.field_mode = 0      # 0 = vector field, 1 = magnetic
        self.field_preset = 0    # preset index within current mode
        self.camera_pos = [0, 0, 0]
        self.camera_quat = [0, 0, 0, 1]
        self.state_changed = threading.Event()

    def connect(self):
        if not HAS_WS:
            print("websocket-client not installed, running offline")
            return

        def _on_open(ws):
            # Identify as publisher immediately (relay uses role detection)
            ws.send(json.dumps({"event": "scene", "ops": []}))
            self.connected = True
            print(f"Connected to relay: {self.url}")

        def _on_message(ws, data):
            try:
                msg = json.loads(data)
                if msg.get("event") == "interact" and msg.get("payload"):
                    self._handle_interact(msg["payload"])
                elif msg.get("event") == "relay_status":
                    print(f"Relay: pubs={msg.get('pubs')} subs={msg.get('subs')}")
            except (json.JSONDecodeError, TypeError):
                pass

        def _on_close(ws, code, reason):
            self.connected = False
            print(f"Relay disconnected ({code}), reconnecting in 2s...")
            time.sleep(2)
            self._start_ws()

        def _on_error(ws, error):
            print(f"Relay error: {error}")

        self._on_open = _on_open
        self._on_message = _on_message
        self._on_close = _on_close
        self._on_error = _on_error
        self._start_ws()

    def _start_ws(self):
        self.ws = websocket.WebSocketApp(
            self.url,
            on_open=self._on_open,
            on_message=self._on_message,
            on_close=self._on_close,
            on_error=self._on_error,
        )
        thread = threading.Thread(target=self.ws.run_forever, daemon=True)
        thread.start()

    def _handle_interact(self, payload: dict):
        ptype = payload.get("type")
        if ptype == "field_state":
            with self.lock:
                new_mode = payload.get("mode", self.field_mode)
                new_preset = payload.get("preset", self.field_preset)
                if new_mode != self.field_mode or new_preset != self.field_preset:
                    self.field_mode = new_mode
                    self.field_preset = new_preset
                    self.state_changed.set()
                    print(f"Field state: mode={new_mode} preset={new_preset}")
        elif ptype == "camera_state":
            with self.lock:
                self.camera_pos = payload.get("position", self.camera_pos)
                self.camera_quat = payload.get("rotation", self.camera_quat)

    def send_frame(self, pixels: np.ndarray, width: int, height: int):
        if not self.connected or not self.ws:
            return
        try:
            frame = encode_frame(pixels, width, height)
            self.ws.send(frame, opcode=0x2)  # binary
        except Exception:
            pass

    def get_state(self) -> tuple:
        with self.lock:
            return (self.field_mode, self.field_preset)


# ---------------------------------------------------------------------------
# PIL renderer (fallback: works everywhere)
# ---------------------------------------------------------------------------

class PILRenderer:
    """
    Renders equation explanation cards using PIL.
    Each preset gets a dark card with:
      - Field name + category header
      - Core equation (Unicode math)
      - Component breakdown
      - Plain-text description
    """

    def __init__(self, width: int, height: int):
        self.w = width
        self.h = height
        self.bg_color = (13, 17, 23, 255)       # #0d1117
        self.text_color = (201, 209, 217)        # #c9d1d9
        self.dim_color = (139, 148, 158)         # #8b949e
        self.accent_color = (96, 165, 250)       # #60a5fa

        # Try to load a monospace font
        self.font_sm = ImageFont.load_default()
        self.font_md = ImageFont.load_default()
        self.font_lg = ImageFont.load_default()

        # Try better fonts if available
        for font_path in [
            "/System/Library/Fonts/Menlo.ttc",
            "/System/Library/Fonts/SFMono-Regular.otf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        ]:
            if Path(font_path).exists():
                try:
                    self.font_sm = ImageFont.truetype(font_path, 14)
                    self.font_md = ImageFont.truetype(font_path, 18)
                    self.font_lg = ImageFont.truetype(font_path, 28)
                    break
                except Exception:
                    continue

        # Pre-render all preset cards
        self._cache: Dict[tuple, np.ndarray] = {}

    def render(self, mode: int, preset: int) -> np.ndarray:
        """Returns (H, W, 4) uint8 RGBA array, top-down."""
        key = (mode, preset)
        if key in self._cache:
            return self._cache[key]

        info = FIELD_PRESETS.get(key)
        if info is None:
            info = FIELD_PRESETS.get((0, 0))

        img = Image.new("RGBA", (self.w, self.h), self.bg_color)
        draw = ImageDraw.Draw(img)

        y = 24
        accent = info["color"]

        # Category label
        draw.text((24, y), info["category"].upper(), fill=self.dim_color, font=self.font_sm)
        y += 22

        # Field name (large, accented)
        draw.text((24, y), info["name"], fill=accent, font=self.font_lg)
        y += 42

        # Separator line
        draw.line([(24, y), (self.w - 24, y)], fill=(*accent, 80), width=1)
        y += 16

        # Core equation
        draw.text((24, y), info["equation"], fill=self.text_color, font=self.font_md)
        y += 32

        # Component breakdown
        for comp_tuple in info["components"]:
            comp_name = comp_tuple[0]
            # Use Unicode display string (index 2) if available, else skip
            eq_display = comp_tuple[2] if len(comp_tuple) > 2 else comp_tuple[1]

            draw.text((24, y), f"  {comp_name}:", fill=accent, font=self.font_sm)
            y += 20
            for eq_line in eq_display.split("\n"):
                draw.text((40, y), eq_line, fill=self.text_color, font=self.font_sm)
                y += 18

        y += 12

        # Description
        draw.text((24, y), "─" * 30, fill=(*self.dim_color, 60), font=self.font_sm)
        y += 18
        for line in info["description"].split("\n"):
            draw.text((24, y), line, fill=self.dim_color, font=self.font_sm)
            y += 18

        # Bottom: parameter hint
        y = self.h - 36
        draw.text((24, y), "s = FieldScale  ·  T = TargetPosition", fill=(*self.dim_color, 120), font=self.font_sm)

        result = np.array(img, dtype=np.uint8)
        self._cache[key] = result
        return result


# ---------------------------------------------------------------------------
# ManimGL renderer
# ---------------------------------------------------------------------------

class ManimGLRenderer:
    """
    Renders equation explanations using ManimGL's Scene system.

    Camera setup:
      - 512x512 pixels, square frame (8x8 manim units)
      - Default 2D view (camera at [0, 0, ~9.66] looking at origin along -Z)
      - FOV 45° vertical (ManimGL default)
      - Background: dark (#0d1117)

    Coordinate mapping:
      ManimGL frame coordinates:
        x: [-4, 4] (left to right)
        y: [-4, 4] (bottom to top)
      Origin is center of frame.

    Frame extraction:
      get_pixel_array() returns (H, W, 4) uint8 RGBA, top-down.
      This is what ExplanatoryPanel expects (it flips for LS textures).
    """

    # Preset definitions for ManimGL: (name, category, color, core_latex, components, desc_lines)
    PRESET_CONTENT = {
        (0, 0): ("Expansion", "Vector Field", "#60a5fa",
                 r"\vec{F} = \hat{r} \cdot w(|\vec{r}|) + \vec{P}_\perp",
                 [("Radial", r"\hat{r} = \frac{\vec{p} - \vec{T}}{|\vec{p} - \vec{T}|}"),
                  ("Wave", r"w = \sin(|\vec{r}| \cdot s) \cdot 0.5 + 0.5")],
                 ["Radial waves expanding from target", "with sinusoidal modulation"]),
        (0, 1): ("Contraction", "Vector Field", "#93c5fd",
                 r"\vec{F} = -\hat{r} \cdot w(|\vec{r}|) + \vec{T}_{twist}",
                 [("Inward", r"-\hat{r} = -\frac{\vec{p} - \vec{T}}{|\vec{p} - \vec{T}|}"),
                  ("Twist", r"\vec{T} = (\sin(r_z s), \cos(r_x s), \sin(r_y s))")],
                 ["Spiraling inward toward target", "with twist components"]),
        (0, 2): ("Circulation", "Vector Field", "#60a5fa",
                 r"\vec{F} = \mathrm{mix}(\vec{\tau}_{xz}, \vec{\tau}_{xy}, \alpha) \cdot w",
                 [("XZ tangent", r"\vec{\tau}_{xz} = \frac{(-r_z, 0, r_x)}{|r_{xz}|}"),
                  ("Blend", r"\alpha = \sin(r_y \cdot s) \cdot 0.5 + 0.5")],
                 ["3D vortex blending XZ and XY", "rotations with wave modulation"]),
        (0, 3): ("Waves", "Vector Field", "#34d399",
                 r"\vec{F} = 0.35 \begin{pmatrix} \sin(r_y s)\cos(r_z s/2) \\ \sin(r_z s)\cos(r_x s/2) \\ \sin(r_x s)\cos(r_y s/2) \end{pmatrix}",
                 [("Pattern", r"F_i = \sin(r_j \cdot s) \cdot \cos(r_k \cdot s/2)")],
                 ["Sinusoidal interference pattern", "where each axis modulates the others"]),
        (0, 4): ("Vortex", "Vector Field", "#fbbf24",
                 r"\vec{F} = \vec{C}(\vec{p}) + \vec{S}(\theta)",
                 [("Cells", r"\vec{C} = (\sin(r_z s'), \sin(r_x s'), \sin(r_y s'))"),
                  ("Spin", r"\vec{S} = 0.3(-\sin\theta, 0, \cos\theta)")],
                 ["Rotating cellular pattern with", "angular spin. s' = 0.7s"]),
        (1, 0): ("Magnetic Dipole", "Magnetic Field", "#f87171",
                 r"\vec{B} = \sum_{i} \frac{3(\vec{m}_i \cdot \hat{r}_i)\hat{r}_i - \vec{m}_i}{r_i^3}",
                 [("Superposition", r"\vec{B}_{total} = \vec{B}_1 + \vec{B}_2"),
                  ("Tone map", r"|\vec{B}_{out}| = \frac{|\vec{B}|}{1 + 0.5|\vec{B}|}")],
                 ["Two magnetic dipoles with", "classical inverse-cube field"]),
    }

    def __init__(self, width: int, height: int):
        self.w = width
        self.h = height
        self._cache: Dict[tuple, np.ndarray] = {}
        self._init_scene()

    def _init_scene(self):
        """Initialize ManimGL Scene in headless mode."""
        import os
        os.environ['MANIMGL_SHOW_WINDOW'] = '0'
        from manimlib import Scene

        self.scene = Scene(
            window=None,
            camera_config={
                "resolution": (self.w, self.h),
                "background_color": "#0d1117",
                "background_opacity": 1.0,
            },
        )
        self.scene.camera.frame.set_shape(8, 8)
        print(f"ManimGL scene initialized: {self.w}x{self.h}")

    def render(self, mode: int, preset: int) -> np.ndarray:
        """Returns (H, W, 4) uint8 RGBA array, top-down."""
        key = (mode, preset)
        if key in self._cache:
            return self._cache[key]

        from manimlib import (
            Tex, Text, VGroup, Line,
            UP, DOWN, LEFT, RIGHT, UL,
            WHITE, GREY_D,
        )

        content = self.PRESET_CONTENT.get(key, self.PRESET_CONTENT[(0, 0)])
        name, category, color, core_latex, components, desc_lines = content

        self.scene.clear()
        elements = VGroup()

        # Category (top-left)
        cat = Text(category.upper(), font_size=18, color="#8b949e")
        cat.to_corner(UL, buff=0.4)
        elements.add(cat)

        # Title
        title = Text(name, font_size=48, color=color)
        title.next_to(cat, DOWN, aligned_edge=LEFT, buff=0.1)
        elements.add(title)

        # Separator
        sep = Line(LEFT * 3.4, RIGHT * 3.4, stroke_width=1.5, color=GREY_D)
        sep.next_to(title, DOWN, buff=0.15)
        elements.add(sep)

        # Core equation (left-aligned with margin, scaled to fit)
        MARGIN = 0.4
        left_x = -4.0 + MARGIN
        right_x = 4.0 - MARGIN
        max_w = right_x - left_x

        eq = Tex(core_latex, font_size=38)
        eq.set_color(WHITE)
        eq.next_to(sep, DOWN, buff=0.3)
        if eq.get_width() > max_w:
            eq.set_width(max_w)
        # Clamp: ensure left edge stays within margin
        if eq.get_left()[0] < left_x:
            eq.set_x(left_x, direction=LEFT)
        elements.add(eq)

        last = eq

        # Components
        for i, (label_text, latex_str) in enumerate(components[:3]):
            lbl = Text(f"{label_text}:", font_size=22, color=color)
            lbl.next_to(last, DOWN, buff=0.25 if i == 0 else 0.18)
            lbl.set_x(left_x, direction=LEFT)
            elements.add(lbl)

            try:
                ceq = Tex(latex_str, font_size=28)
                ceq.set_color(WHITE)
                ceq.next_to(lbl, DOWN, buff=0.08)
                ceq.set_x(left_x + 0.2, direction=LEFT)
                if ceq.get_width() > max_w - 0.4:
                    ceq.set_width(max_w - 0.4)
                elements.add(ceq)
                last = ceq
            except Exception as e:
                print(f"  LaTeX failed for {label_text}: {e}")
                last = lbl

        # Description
        for j, dline in enumerate(desc_lines):
            dt = Text(dline, font_size=17, color="#8b949e")
            dt.move_to([0, -3.3 - j * 0.28, 0])
            elements.add(dt)

        self.scene.add(elements)
        self.scene.update_frame(force_draw=True)
        result = self.scene.camera.get_pixel_array()
        self._cache[key] = result
        return result


# ---------------------------------------------------------------------------
# Transition animation (cross-fade between preset cards)
# ---------------------------------------------------------------------------

def crossfade(old_frame: np.ndarray, new_frame: np.ndarray, t: float) -> np.ndarray:
    """Blend two RGBA frames. t=0 → old, t=1 → new."""
    t = max(0.0, min(1.0, t))
    return (old_frame.astype(np.float32) * (1 - t) + new_frame.astype(np.float32) * t).astype(np.uint8)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = _ARGS
    w, h = args.width, args.height

    # Select renderer
    renderer = None
    if args.renderer == "manim" or (args.renderer == "auto" and HAS_MANIMGL):
        if not HAS_MANIMGL:
            print("ManimGL not available. Install: pip install manimgl")
            sys.exit(1)
        try:
            renderer = ManimGLRenderer(w, h)
            print("Using ManimGL renderer")
        except Exception as e:
            print(f"ManimGL init failed: {e}")
            if not HAS_PIL:
                sys.exit(1)

    if renderer is None:
        if not HAS_PIL:
            print("No renderer available. Install: pip install Pillow")
            sys.exit(1)
        renderer = PILRenderer(w, h)
        print("Using PIL renderer")

    # Test mode: render all presets to PNG
    if args.test:
        out_dir = Path(__file__).parent / "manim_output"
        out_dir.mkdir(exist_ok=True)
        for key in FIELD_PRESETS:
            mode, preset = key
            pixels = renderer.render(mode, preset)
            img = Image.fromarray(pixels, "RGBA")
            fname = f"preset_m{mode}_p{preset}_{FIELD_PRESETS[key]['name'].lower()}.png"
            img.save(out_dir / fname)
            print(f"Saved {fname} ({pixels.shape})")
        print(f"\nAll presets rendered to {out_dir}/")
        return

    # Streaming mode
    if not HAS_WS:
        print("websocket-client not installed. Install: pip install websocket-client")
        print("Or use --test mode to render PNGs locally.")
        sys.exit(1)

    relay = RelayClient(args.relay, args.channel)
    relay.connect()

    print(f"Streaming: {w}x{h} @ {args.fps}fps")
    print(f"Relay: {args.relay}, Channel: {args.channel}")
    print("Ctrl+C to stop\n")

    current_mode, current_preset = 0, 0
    current_frame = renderer.render(current_mode, current_preset)
    transition_frame: Optional[np.ndarray] = None
    transition_start = 0.0
    transition_duration = 0.5  # seconds

    frame_interval = 1.0 / args.fps

    try:
        while True:
            t_start = time.monotonic()

            # Check for state changes
            new_mode, new_preset = relay.get_state()
            if (new_mode, new_preset) != (current_mode, current_preset):
                # Start transition to new preset
                transition_frame = current_frame.copy()
                transition_start = time.monotonic()
                current_mode, current_preset = new_mode, new_preset
                current_frame = renderer.render(current_mode, current_preset)
                print(f"Transitioning to: {FIELD_PRESETS.get((current_mode, current_preset), {}).get('name', '?')}")
                relay.state_changed.clear()

            # Compute output frame (with crossfade if transitioning)
            if transition_frame is not None:
                elapsed = time.monotonic() - transition_start
                t = elapsed / transition_duration
                if t >= 1.0:
                    output = current_frame
                    transition_frame = None
                else:
                    output = crossfade(transition_frame, current_frame, t)
            else:
                output = current_frame

            # Send frame
            relay.send_frame(output, w, h)

            # Rate limit
            elapsed = time.monotonic() - t_start
            sleep_time = frame_interval - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

    except KeyboardInterrupt:
        print("\nStopped")


if __name__ == "__main__":
    main()
