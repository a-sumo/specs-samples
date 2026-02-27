#!/usr/bin/env python3
"""Render all vector field presets with aurora gradient - clean 2D formulas"""

import numpy as np
from PIL import Image
import subprocess
import os
import tempfile
import shutil

WIDTH = 512
HEIGHT = 512
FPS = 30
DURATION = 4
TOTAL_FRAMES = FPS * DURATION

OUTPUT_DIR = "/Users/armand/Documents/specs-samples/Vector-Fields/Assets/Scripts/Utils/renders"


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# ============================================
# AURORA GRADIENT (original from gradient_2_aurora)
# ============================================

def gradient_aurora(value):
    """Aurora/northern lights: green → cyan → blue → purple → pink"""
    c0 = np.array([0.2, 1.0, 0.4])    # green
    c1 = np.array([0.0, 0.9, 0.8])    # teal/cyan
    c2 = np.array([0.2, 0.4, 1.0])    # blue
    c3 = np.array([0.6, 0.2, 0.9])    # purple
    c4 = np.array([1.0, 0.4, 0.7])    # pink

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
# CLEAN 2D VECTOR FIELD DEFINITIONS
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
    """Sinusoidal wave pattern - larger scale"""
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
    """Magnetic dipole field - larger scale"""
    pole_sep = 0.5  # increased from 0.3

    # Positive pole (source)
    dx_p = x
    dy_p = y - pole_sep
    r_p = np.sqrt(dx_p**2 + dy_p**2) + 1e-6
    strength_p = 1.0 / (r_p ** 2)
    fx_p = (dx_p / r_p) * strength_p
    fy_p = (dy_p / r_p) * strength_p

    # Negative pole (sink)
    dx_n = x
    dy_n = y + pole_sep
    r_n = np.sqrt(dx_n**2 + dy_n**2) + 1e-6
    strength_n = 1.0 / (r_n ** 2)
    fx_n = -(dx_n / r_n) * strength_n
    fy_n = -(dy_n / r_n) * strength_n

    fx = fx_p + fx_n
    fy = fy_p + fy_n
    mag = np.sqrt(fx**2 + fy**2) + 1e-6

    # Fade near poles - larger radius
    dist_pos = np.sqrt(x**2 + (y - pole_sep)**2)
    dist_neg = np.sqrt(x**2 + (y + pole_sep)**2)
    pole_fade = smoothstep(0.0, 0.18, dist_pos) * smoothstep(0.0, 0.18, dist_neg)

    return fx / mag * pole_fade, fy / mag * pole_fade, mag * pole_fade


# ============================================
# RENDERING (exact same as gradient_options)
# ============================================

def render_frame(t, loop_duration, field_func):
    """Render a single frame."""
    y_coords, x_coords = np.mgrid[0:HEIGHT, 0:WIDTH]
    x = (x_coords / WIDTH) * 2.0 - 1.0
    y = 1.0 - (y_coords / HEIGHT) * 2.0

    fx, fy, aux = field_func(x, y)

    time_phase = (t / loop_duration) * 2.0 * np.pi
    flow_speed = 2.5

    advect_x = x - fx * np.sin(time_phase) * 0.15
    advect_y = y - fy * np.sin(time_phase) * 0.15

    # Color based on field direction
    gradient_pos = (fy * 0.5 + 0.5) * 0.7 + (fx * 0.5 + 0.5) * 0.3

    # Flowing bands
    streamline_coord = advect_x * fx + advect_y * fy
    flow_bands = np.sin(streamline_coord * 12.0 + time_phase * flow_speed)
    flow_bands = flow_bands * 0.5 + 0.5

    # Noise
    noise = np.sin(advect_x * 6.0 + time_phase) * np.cos(advect_y * 5.0 - time_phase * 0.7)
    noise = noise * 0.5 + 0.5

    gradient_pos = gradient_pos + noise * 0.08
    gradient_pos = np.clip(gradient_pos, 0, 1)

    r, g, b = gradient_aurora(gradient_pos)

    # Brightness modulation
    brightness = 0.7 + flow_bands * 0.3
    r = r * brightness
    g = g * brightness
    b = b * brightness

    # Circular alpha border
    center_dist = np.sqrt(x**2 + y**2)
    border_alpha = 1.0 - smoothstep(0.55, 0.85, center_dist)
    border_alpha = border_alpha * border_alpha * (3.0 - 2.0 * border_alpha)

    frame = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    frame[..., 0] = (np.clip(r, 0, 1) * 255).astype(np.uint8)
    frame[..., 1] = (np.clip(g, 0, 1) * 255).astype(np.uint8)
    frame[..., 2] = (np.clip(b, 0, 1) * 255).astype(np.uint8)
    frame[..., 3] = (border_alpha * 255).astype(np.uint8)

    return frame


def render_field(field_func, name):
    print(f"  Rendering {name}...")

    temp_dir = tempfile.mkdtemp()

    try:
        for i in range(TOTAL_FRAMES):
            t = i / FPS
            frame_data = render_frame(t, DURATION, field_func)
            img = Image.fromarray(frame_data, 'RGBA')
            frame_path = os.path.join(temp_dir, f"frame_{i:04d}.png")
            img.save(frame_path)

            if (i + 1) % 40 == 0:
                print(f"    Frame {i + 1}/{TOTAL_FRAMES}")

        output_path = os.path.join(OUTPUT_DIR, f"{name}.mp4")

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
        print(f"    -> {name}.mp4")
        return output_path

    finally:
        shutil.rmtree(temp_dir)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("Rendering all fields with aurora gradient...")
    print(f"  {WIDTH}x{HEIGHT}, {DURATION}s @ {FPS}fps\n")

    fields = [
        (field_expansion, "expansion"),
        (field_contraction, "contraction"),
        (field_circulation, "circulation"),
        (field_waves, "waves"),
        (field_vortex, "vortex"),
        (field_magnetic, "magnetic"),
    ]

    paths = []
    for field_func, name in fields:
        path = render_field(field_func, name)
        paths.append(path)

    print(f"\nDone! Created {len(paths)} videos in {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
