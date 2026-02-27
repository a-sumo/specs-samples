#!/usr/bin/env python3
"""Render various vector field types with flowing mesh gradient"""

import numpy as np
from PIL import Image
import subprocess
import os
import tempfile
import shutil

# Output settings
WIDTH = 512
HEIGHT = 512
FPS = 30
DURATION = 4  # seconds per video
TOTAL_FRAMES = FPS * DURATION

OUTPUT_DIR = "/Users/armand/Documents/specs-samples/Vector-Fields/Assets/Scripts/Utils"


def smoothstep(edge0, edge1, x):
    """GLSL smoothstep implementation"""
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# ============================================
# VECTOR FIELD DEFINITIONS
# ============================================

def vortex_field(x, y):
    """Rotational/vortex field - swirls around center"""
    r = np.sqrt(x**2 + y**2) + 1e-6
    # Tangential direction (perpendicular to radial)
    fx = -y / r
    fy = x / r
    # Falloff at center and edges
    strength = smoothstep(0.0, 0.2, r) * smoothstep(1.2, 0.5, r)
    return fx * strength, fy * strength, r


def spiral_field(x, y):
    """Spiral - combination of vortex and radial outward"""
    r = np.sqrt(x**2 + y**2) + 1e-6
    # Tangential + radial components
    fx = -y / r + x / r * 0.3
    fy = x / r + y / r * 0.3
    mag = np.sqrt(fx**2 + fy**2) + 1e-6
    strength = smoothstep(0.0, 0.15, r)
    return fx / mag * strength, fy / mag * strength, r


def saddle_field(x, y):
    """Saddle/hyperbolic field"""
    fx = x
    fy = -y
    mag = np.sqrt(fx**2 + fy**2) + 1e-6
    return fx / mag, fy / mag, mag


def source_field(x, y):
    """Radial source - flows outward from center"""
    r = np.sqrt(x**2 + y**2) + 1e-6
    fx = x / r
    fy = y / r
    strength = smoothstep(0.0, 0.1, r)
    return fx * strength, fy * strength, r


def sink_field(x, y):
    """Radial sink - flows inward to center"""
    r = np.sqrt(x**2 + y**2) + 1e-6
    fx = -x / r
    fy = -y / r
    strength = smoothstep(0.0, 0.1, r)
    return fx * strength, fy * strength, r


def wave_field(x, y):
    """Sinusoidal wave pattern"""
    fx = np.ones_like(x)
    fy = np.cos(x * 4.0) * 0.8
    mag = np.sqrt(fx**2 + fy**2) + 1e-6
    return fx / mag, fy / mag, mag


def double_vortex_field(x, y):
    """Two counter-rotating vortices"""
    # Left vortex (counterclockwise)
    x1, y1 = x + 0.4, y
    r1 = np.sqrt(x1**2 + y1**2) + 1e-6
    fx1, fy1 = -y1 / r1, x1 / r1
    s1 = 1.0 / (r1 + 0.3)

    # Right vortex (clockwise)
    x2, y2 = x - 0.4, y
    r2 = np.sqrt(x2**2 + y2**2) + 1e-6
    fx2, fy2 = y2 / r2, -x2 / r2
    s2 = 1.0 / (r2 + 0.3)

    fx = fx1 * s1 + fx2 * s2
    fy = fy1 * s1 + fy2 * s2
    mag = np.sqrt(fx**2 + fy**2) + 1e-6
    return fx / mag, fy / mag, mag


# ============================================
# COLOR GRADIENT
# ============================================

def get_gradient_color(value):
    """5-stop gradient: cyan → blue → magenta → red → orange"""
    c0 = np.array([0.0, 0.9, 1.0])   # cyan
    c1 = np.array([0.2, 0.3, 1.0])   # blue
    c2 = np.array([0.85, 0.15, 0.95]) # magenta
    c3 = np.array([1.0, 0.15, 0.25])  # red
    c4 = np.array([1.0, 0.5, 0.0])    # orange

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
# RENDERING
# ============================================

def render_frame(t, loop_duration, field_func, field_name):
    """Render a single frame."""
    y_coords, x_coords = np.mgrid[0:HEIGHT, 0:WIDTH]
    x = (x_coords / WIDTH) * 2.0 - 1.0
    y = 1.0 - (y_coords / HEIGHT) * 2.0

    # Get field
    fx, fy, aux = field_func(x, y)

    # Animation
    time_phase = (t / loop_duration) * 2.0 * np.pi
    flow_speed = 2.5

    # Advect for flow effect
    advect_x = x - fx * np.sin(time_phase) * 0.15
    advect_y = y - fy * np.sin(time_phase) * 0.15

    # Color based on field direction components (no discontinuity)
    # Map fy from [-1,1] to [0,1] for vertical gradient
    # Mix with fx for variation
    gradient_pos = (fy * 0.5 + 0.5) * 0.7 + (fx * 0.5 + 0.5) * 0.3

    # Flowing bands based on position along field
    streamline_coord = advect_x * fx + advect_y * fy
    flow_bands = np.sin(streamline_coord * 12.0 + time_phase * flow_speed)
    flow_bands = flow_bands * 0.5 + 0.5

    # Additional noise for variation
    noise = np.sin(advect_x * 6.0 + time_phase) * np.cos(advect_y * 5.0 - time_phase * 0.7)
    noise = noise * 0.5 + 0.5

    # Add subtle noise variation
    gradient_pos = gradient_pos + noise * 0.08
    gradient_pos = np.clip(gradient_pos, 0, 1)

    r, g, b = get_gradient_color(gradient_pos)

    # Brightness modulation
    brightness = 0.7 + flow_bands * 0.3
    r = r * brightness
    g = g * brightness
    b = b * brightness

    # === STRONGER CIRCULAR ALPHA BORDER ===
    center_dist = np.sqrt(x**2 + y**2)

    # More aggressive falloff - starts at 0.6, fully transparent at 0.9
    border_alpha = 1.0 - smoothstep(0.55, 0.85, center_dist)
    # Extra smoothing
    border_alpha = border_alpha * border_alpha * (3.0 - 2.0 * border_alpha)

    # Create frame
    frame = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    frame[..., 0] = (np.clip(r, 0, 1) * 255).astype(np.uint8)
    frame[..., 1] = (np.clip(g, 0, 1) * 255).astype(np.uint8)
    frame[..., 2] = (np.clip(b, 0, 1) * 255).astype(np.uint8)
    frame[..., 3] = (border_alpha * 255).astype(np.uint8)

    return frame


def render_field(field_func, field_name):
    """Render a complete video for one field type."""
    print(f"\n  Rendering {field_name}...")

    temp_dir = tempfile.mkdtemp()

    try:
        for i in range(TOTAL_FRAMES):
            t = i / FPS
            frame_data = render_frame(t, DURATION, field_func, field_name)
            img = Image.fromarray(frame_data, 'RGBA')
            frame_path = os.path.join(temp_dir, f"frame_{i:04d}.png")
            img.save(frame_path)

            if (i + 1) % 30 == 0:
                print(f"    Frame {i + 1}/{TOTAL_FRAMES}")

        output_path = os.path.join(OUTPUT_DIR, f"field_{field_name}.mp4")

        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", os.path.join(temp_dir, "frame_%04d.png"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "18",
            output_path
        ]

        subprocess.run(ffmpeg_cmd, check=True, capture_output=True)
        print(f"    Saved: {output_path}")
        return output_path

    finally:
        shutil.rmtree(temp_dir)


def main():
    print("Rendering field variations...")
    print(f"  {WIDTH}x{HEIGHT}, {DURATION}s @ {FPS}fps each")

    fields = [
        (vortex_field, "vortex"),
        (spiral_field, "spiral"),
        (saddle_field, "saddle"),
        (source_field, "source"),
        (double_vortex_field, "double_vortex"),
        (wave_field, "wave"),
    ]

    output_paths = []
    for field_func, field_name in fields:
        path = render_field(field_func, field_name)
        output_paths.append(path)

    print(f"\n\nDone! Created {len(output_paths)} videos:")
    for p in output_paths:
        print(f"  - {os.path.basename(p)}")


if __name__ == "__main__":
    main()
