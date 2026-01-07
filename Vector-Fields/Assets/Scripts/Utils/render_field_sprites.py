#!/usr/bin/env python3
"""Render vector field presets to sprite sheet PNGs - seamless loop via flow-aligned animation"""

import numpy as np
from PIL import Image
import math
import os
import subprocess

WIDTH = 256
HEIGHT = 256
FPS = 12
DURATION = 6  # seconds - seamless loop
TOTAL_FRAMES = FPS * DURATION

OUTPUT_DIR = "/Users/armand/Documents/specs-samples/Vector-Fields/Assets/Images"


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# ============================================
# AURORA GRADIENT
# ============================================

def gradient_aurora(value):
    """Aurora: green → cyan → blue → purple → pink (no darks)"""
    c0 = np.array([0.4, 1.0, 0.5])    # green
    c1 = np.array([0.3, 0.95, 0.85])  # teal/cyan
    c2 = np.array([0.4, 0.55, 1.0])   # blue
    c3 = np.array([0.65, 0.4, 0.95])  # purple
    c4 = np.array([1.0, 0.5, 0.75])   # pink

    r = np.zeros_like(value)
    g = np.zeros_like(value)
    b = np.zeros_like(value)

    mask0 = value < 0.25
    t0 = value[mask0] * 4.0
    r[mask0] = c0[0] * (1 - t0) + c1[0] * t0
    g[mask0] = c0[1] * (1 - t0) + c1[1] * t0
    b[mask0] = c0[2] * (1 - t0) + c1[2] * t0

    mask1 = (value >= 0.25) & (value < 0.5)
    t1 = (value[mask1] - 0.25) * 4.0
    r[mask1] = c1[0] * (1 - t1) + c2[0] * t1
    g[mask1] = c1[1] * (1 - t1) + c2[1] * t1
    b[mask1] = c1[2] * (1 - t1) + c2[2] * t1

    mask2 = (value >= 0.5) & (value < 0.75)
    t2 = (value[mask2] - 0.5) * 4.0
    r[mask2] = c2[0] * (1 - t2) + c3[0] * t2
    g[mask2] = c2[1] * (1 - t2) + c3[1] * t2
    b[mask2] = c2[2] * (1 - t2) + c3[2] * t2

    mask3 = value >= 0.75
    t3 = np.clip((value[mask3] - 0.75) * 4.0, 0, 1)
    r[mask3] = c3[0] * (1 - t3) + c4[0] * t3
    g[mask3] = c3[1] * (1 - t3) + c4[1] * t3
    b[mask3] = c3[2] * (1 - t3) + c4[2] * t3

    return r, g, b


# ============================================
# VECTOR FIELD DEFINITIONS
# ============================================

def field_expansion(x, y):
    """Radial outward flow"""
    r = np.sqrt(x**2 + y**2) + 1e-6
    fx = x / r
    fy = y / r
    strength = smoothstep(0.0, 0.15, r)
    return fx * strength, fy * strength, r


def field_contraction(x, y):
    """Radial inward flow"""
    r = np.sqrt(x**2 + y**2) + 1e-6
    fx = -x / r
    fy = -y / r
    strength = smoothstep(0.0, 0.15, r)
    return fx * strength, fy * strength, r


def field_circulation(x, y):
    """Pure rotation / vortex"""
    r = np.sqrt(x**2 + y**2) + 1e-6
    fx = -y / r
    fy = x / r
    strength = smoothstep(0.0, 0.15, r)
    return fx * strength, fy * strength, r


def field_waves(x, y):
    """Sinusoidal wave pattern"""
    fx = np.ones_like(x)
    fy = np.sin(x * 1.8) * 0.8
    mag = np.sqrt(fx**2 + fy**2) + 1e-6
    return fx / mag, fy / mag, mag


def field_vortex(x, y):
    """Spiral - rotation + slight outward"""
    r = np.sqrt(x**2 + y**2) + 1e-6
    fx = -y / r + x / r * 0.3
    fy = x / r + y / r * 0.3
    mag = np.sqrt(fx**2 + fy**2) + 1e-6
    strength = smoothstep(0.0, 0.15, r)
    return fx / mag * strength, fy / mag * strength, r


def field_magnetic(x, y):
    """Magnetic dipole field"""
    pole_sep = 0.5

    dx_p = x
    dy_p = y - pole_sep
    r_p = np.sqrt(dx_p**2 + dy_p**2) + 1e-6
    strength_p = 1.0 / (r_p ** 2)
    fx_p = (dx_p / r_p) * strength_p
    fy_p = (dy_p / r_p) * strength_p

    dx_n = x
    dy_n = y + pole_sep
    r_n = np.sqrt(dx_n**2 + dy_n**2) + 1e-6
    strength_n = 1.0 / (r_n ** 2)
    fx_n = -(dx_n / r_n) * strength_n
    fy_n = -(dy_n / r_n) * strength_n

    fx = fx_p + fx_n
    fy = fy_p + fy_n
    mag = np.sqrt(fx**2 + fy**2) + 1e-6

    dist_pos = np.sqrt(x**2 + (y - pole_sep)**2)
    dist_neg = np.sqrt(x**2 + (y + pole_sep)**2)
    pole_fade = smoothstep(0.0, 0.18, dist_pos) * smoothstep(0.0, 0.18, dist_neg)

    return fx / mag * pole_fade, fy / mag * pole_fade, mag * pole_fade


# ============================================
# FLOW COORDINATE FUNCTIONS (for seamless looping)
# ============================================

def flow_coord_expansion(x, y, fx, fy):
    """Radial outward: color flows outward with radius"""
    r = np.sqrt(x**2 + y**2)
    return r * 6.0


def flow_coord_contraction(x, y, fx, fy):
    """Radial inward: color flows inward (negative radius)"""
    r = np.sqrt(x**2 + y**2)
    return -r * 6.0


def flow_coord_circulation(x, y, fx, fy):
    """Rotational: color flows around center with angle"""
    # Use integer multiplier to avoid arctan2 discontinuity at ±π
    theta = np.arctan2(y, x)
    return theta * 3.0  # 3 color bands around circle


def flow_coord_waves(x, y, fx, fy):
    """Waves: color flows in x direction"""
    return x * 5.0


def flow_coord_vortex(x, y, fx, fy):
    """Spiral: combination of radius and angle"""
    r = np.sqrt(x**2 + y**2)
    # Use integer multiplier for theta to avoid discontinuity
    theta = np.arctan2(y, x)
    return r * 5.0 - theta * 2.0


def flow_coord_magnetic(x, y, fx, fy):
    """Magnetic: flow along field lines using potential-like function"""
    pole_sep = 0.5
    theta_p = np.arctan2(y - pole_sep, x)
    theta_n = np.arctan2(y + pole_sep, x)
    psi = theta_p - theta_n
    # Use 1.0 multiplier for more detail (integer, no discontinuity)
    return psi * 1.0


# ============================================
# RENDERING - SEAMLESS LOOP VIA FLOW COORDINATES
# ============================================

def render_frame(t, loop_duration, field_func, flow_coord_func):
    """Render a single frame with seamless looping via flow-aligned animation."""
    y_coords, x_coords = np.mgrid[0:HEIGHT, 0:WIDTH]

    uv_x = x_coords / WIDTH
    uv_y = 1.0 - (y_coords / HEIGHT)

    x = uv_x * 2.0 - 1.0
    y = uv_y * 2.0 - 1.0

    # Phase completes exactly 2*pi for seamless loop
    phase = (t / loop_duration) * 2.0 * np.pi

    fx, fy, aux = field_func(x, y)

    # Flow-aligned coordinate for this field type
    flow = flow_coord_func(x, y, fx, fy)

    # Animate color along flow direction
    # sin(flow - phase) loops perfectly since phase goes 0 to 2π
    flow_pattern = np.sin(flow - phase)
    flow_pattern = flow_pattern * 0.5 + 0.5  # normalize to 0-1

    # Secondary pattern for visual interest (also loops perfectly)
    secondary = np.sin(flow * 2.0 - phase * 2.0) * 0.5 + 0.5

    # Blend based on field direction for color variation
    dir_blend = (fy * 0.5 + 0.5) * 0.3 + (fx * 0.5 + 0.5) * 0.2

    # Combine patterns
    gradient_pos = flow_pattern * 0.6 + secondary * 0.2 + dir_blend * 0.2
    gradient_pos = np.clip(gradient_pos, 0, 1)

    r, g, b = gradient_aurora(gradient_pos)

    # Subtle brightness pulsing (loops with phase)
    pulse = np.sin(phase) * 0.5 + 0.5
    brightness = 0.9 + pulse * 0.1
    r = r * brightness
    g = g * brightness
    b = b * brightness

    # Circular alpha mask
    center_x = uv_x - 0.5
    center_y = uv_y - 0.5
    dist = np.sqrt(center_x * center_x + center_y * center_y) * 2.0

    alpha = 1.0 - smoothstep(0.0, 0.85, dist)
    alpha = alpha * alpha * (3.0 - 2.0 * alpha)

    frame = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    frame[..., 0] = (np.clip(r, 0, 1) * 255).astype(np.uint8)
    frame[..., 1] = (np.clip(g, 0, 1) * 255).astype(np.uint8)
    frame[..., 2] = (np.clip(b, 0, 1) * 255).astype(np.uint8)
    frame[..., 3] = (alpha * 255).astype(np.uint8)

    return frame


def create_sprite_sheet(frames, cols=12):
    """Create sprite sheet from frames"""
    rows = math.ceil(len(frames) / cols)
    sheet_width = WIDTH * cols
    sheet_height = HEIGHT * rows

    sheet = Image.new('RGBA', (sheet_width, sheet_height), (0, 0, 0, 0))

    for i, frame in enumerate(frames):
        row = i // cols
        col = i % cols
        x_pos = col * WIDTH
        y_pos = row * HEIGHT
        sheet.paste(frame, (x_pos, y_pos))

    return sheet


def render_field_sprite(field_func, flow_coord_func, name):
    """Render sprite sheet for one field type."""
    print(f"  Rendering {name}...")

    frames = []
    for i in range(TOTAL_FRAMES):
        t = i / FPS
        frame_data = render_frame(t, DURATION, field_func, flow_coord_func)
        img = Image.fromarray(frame_data, 'RGBA')
        frames.append(img)

        if (i + 1) % 24 == 0:
            print(f"    Frame {i + 1}/{TOTAL_FRAMES}")

    cols = 12
    rows = math.ceil(TOTAL_FRAMES / cols)
    sprite_path = os.path.join(OUTPUT_DIR, f"{name}_sprite.png")

    sprite_sheet = create_sprite_sheet(frames, cols=cols)
    sprite_sheet.save(sprite_path, optimize=True, compress_level=9)

    try:
        subprocess.run(
            ["pngquant", "--force", "--ext", ".png", "--quality=70-90", sprite_path],
            check=True, capture_output=True
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    preview_path = os.path.join(OUTPUT_DIR, f"{name}_preview.png")
    frames[TOTAL_FRAMES // 4].save(preview_path, optimize=True)

    print(f"    -> {name}_sprite.png ({cols}x{rows} grid)")
    return sprite_path


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"Rendering sprite sheets: {TOTAL_FRAMES} frames at {WIDTH}x{HEIGHT}")
    print(f"Duration: {DURATION}s, FPS: {FPS}, seamless loop via flow coordinates\n")

    fields = [
        (field_expansion, flow_coord_expansion, "expansion"),
        (field_contraction, flow_coord_contraction, "contraction"),
        (field_circulation, flow_coord_circulation, "circulation"),
        (field_waves, flow_coord_waves, "waves"),
        (field_vortex, flow_coord_vortex, "vortex"),
        (field_magnetic, flow_coord_magnetic, "magnetic"),
    ]

    for field_func, flow_coord_func, name in fields:
        render_field_sprite(field_func, flow_coord_func, name)

    cols = 12
    rows = math.ceil(TOTAL_FRAMES / cols)
    print(f"\nDone! Sprite sheet info:")
    print(f"  Columns: {cols}")
    print(f"  Rows: {rows}")
    print(f"  Total frames: {TOTAL_FRAMES}")
    print(f"  FPS: {FPS}")
    print(f"  Duration: {DURATION}s (seamless loop)")
    print(f"  Frame size: {WIDTH}x{HEIGHT}")


if __name__ == "__main__":
    main()
