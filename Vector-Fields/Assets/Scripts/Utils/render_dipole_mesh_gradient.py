#!/usr/bin/env python3
"""Render flowing mesh gradient along dipole field as video"""

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
DURATION = 6  # seconds
TOTAL_FRAMES = FPS * DURATION

# Dipole settings
DIPOLE_SEPARATION = 0.3
POLE_FADEOUT_RADIUS = 0.15  # Blur/fade near poles

OUTPUT_DIR = "/Users/armand/Documents/specs-samples/Vector-Fields/Assets/Scripts/Utils"


def smoothstep(edge0, edge1, x):
    """GLSL smoothstep implementation"""
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def dipole_field_vectorized(x, y, pole_sep=DIPOLE_SEPARATION):
    """
    Calculate dipole field for arrays of points.
    Returns (fx, fy) normalized direction vectors.
    """
    # Positive pole (source)
    px, py = 0.0, pole_sep
    dx_p = x - px
    dy_p = y - py
    r_p = np.sqrt(dx_p**2 + dy_p**2) + 1e-6
    strength_p = 1.0 / (r_p ** 2)
    fx_p = (dx_p / r_p) * strength_p
    fy_p = (dy_p / r_p) * strength_p

    # Negative pole (sink)
    nx, ny = 0.0, -pole_sep
    dx_n = x - nx
    dy_n = y - ny
    r_n = np.sqrt(dx_n**2 + dy_n**2) + 1e-6
    strength_n = 1.0 / (r_n ** 2)
    fx_n = -(dx_n / r_n) * strength_n
    fy_n = -(dy_n / r_n) * strength_n

    # Combined field
    fx = fx_p + fx_n
    fy = fy_p + fy_n

    # Normalize
    mag = np.sqrt(fx**2 + fy**2) + 1e-6
    return fx / mag, fy / mag, mag


def compute_flow_potential(x, y, pole_sep=DIPOLE_SEPARATION):
    """
    Compute a potential function that increases along field lines.
    """
    r_p = np.sqrt(x**2 + (y - pole_sep)**2) + 1e-6
    r_n = np.sqrt(x**2 + (y + pole_sep)**2) + 1e-6
    potential = np.log(r_n / r_p)
    return potential


def get_gradient_color(value):
    """
    5-stop gradient matching MagneticField.js shader:
    c0 = cyan (0.0, 0.9, 1.0)
    c1 = blue (0.2, 0.3, 1.0)
    c2 = magenta (0.85, 0.15, 0.95)
    c3 = red (1.0, 0.15, 0.25)
    c4 = orange (1.0, 0.5, 0.0)
    """
    c0 = np.array([0.0, 0.9, 1.0])
    c1 = np.array([0.2, 0.3, 1.0])
    c2 = np.array([0.85, 0.15, 0.95])
    c3 = np.array([1.0, 0.15, 0.25])
    c4 = np.array([1.0, 0.5, 0.0])

    # value is an array, we need to handle it element-wise
    r = np.zeros_like(value)
    g = np.zeros_like(value)
    b = np.zeros_like(value)

    # Segment 0: value < 0.25
    mask0 = value < 0.25
    t0 = value[mask0] * 4.0
    r[mask0] = c0[0] * (1 - t0) + c1[0] * t0
    g[mask0] = c0[1] * (1 - t0) + c1[1] * t0
    b[mask0] = c0[2] * (1 - t0) + c1[2] * t0

    # Segment 1: 0.25 <= value < 0.5
    mask1 = (value >= 0.25) & (value < 0.5)
    t1 = (value[mask1] - 0.25) * 4.0
    r[mask1] = c1[0] * (1 - t1) + c2[0] * t1
    g[mask1] = c1[1] * (1 - t1) + c2[1] * t1
    b[mask1] = c1[2] * (1 - t1) + c2[2] * t1

    # Segment 2: 0.5 <= value < 0.75
    mask2 = (value >= 0.5) & (value < 0.75)
    t2 = (value[mask2] - 0.5) * 4.0
    r[mask2] = c2[0] * (1 - t2) + c3[0] * t2
    g[mask2] = c2[1] * (1 - t2) + c3[1] * t2
    b[mask2] = c2[2] * (1 - t2) + c3[2] * t2

    # Segment 3: value >= 0.75
    mask3 = value >= 0.75
    t3 = (value[mask3] - 0.75) * 4.0
    t3 = np.clip(t3, 0, 1)
    r[mask3] = c3[0] * (1 - t3) + c4[0] * t3
    g[mask3] = c3[1] * (1 - t3) + c4[1] * t3
    b[mask3] = c3[2] * (1 - t3) + c4[2] * t3

    return r, g, b


def render_frame(t, loop_duration):
    """Render a single frame of the flowing mesh gradient."""
    # Create coordinate grids
    y_coords, x_coords = np.mgrid[0:HEIGHT, 0:WIDTH]

    # Normalize to [-1, 1] range
    x = (x_coords / WIDTH) * 2.0 - 1.0
    y = 1.0 - (y_coords / HEIGHT) * 2.0  # Flip Y

    # Get field direction
    fx, fy, mag = dipole_field_vectorized(x, y)

    # Compute flow potential for base coloring
    potential = compute_flow_potential(x, y)

    # Normalize potential to [0, 1] for color gradient
    # Clamp extreme values near poles
    potential_clamped = np.clip(potential, -3.0, 3.0)
    potential_norm = (potential_clamped + 3.0) / 6.0

    # Animation phase
    time_phase = (t / loop_duration) * 2.0 * np.pi
    flow_speed = 3.0

    # Advect coordinates along field for flowing effect
    advect_x = x - fx * np.sin(time_phase) * 0.12 * flow_speed
    advect_y = y - fy * np.sin(time_phase) * 0.12 * flow_speed

    # Create flowing noise patterns
    noise1 = np.sin(advect_x * 8.0 + potential * 4.0 + time_phase * flow_speed)
    noise2 = np.cos(advect_y * 6.0 - potential * 3.0 + time_phase * flow_speed * 0.7)
    noise3 = np.sin((advect_x + advect_y) * 5.0 + time_phase * flow_speed * 1.3)

    combined_noise = (noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2)
    combined_noise = combined_noise * 0.5 + 0.5

    # Create flowing bands along field lines
    band_frequency = 10.0
    flow_bands = np.sin(potential * band_frequency + time_phase * flow_speed)
    flow_bands = flow_bands * 0.5 + 0.5

    # Color based on field direction (like shader's "northness")
    # Field pointing up (+y) = higher gradient value
    # Field pointing down (-y) = lower gradient value
    northness = fy  # -1 to 1
    gradient_pos = northness * 0.5 + 0.5  # 0 to 1

    # Add subtle variation from noise
    gradient_pos = gradient_pos + combined_noise * 0.08
    gradient_pos = np.clip(gradient_pos, 0, 1)

    # Get colors from gradient
    r, g, b = get_gradient_color(gradient_pos)

    # Modulate brightness with flow bands
    brightness = 0.75 + flow_bands * 0.25
    r = r * brightness
    g = g * brightness
    b = b * brightness

    # === POLE FADEOUT ===
    # Distance to each pole
    dist_to_pos = np.sqrt(x**2 + (y - DIPOLE_SEPARATION)**2)
    dist_to_neg = np.sqrt(x**2 + (y + DIPOLE_SEPARATION)**2)

    # Fade out near poles (too much density there)
    pole_fade_pos = smoothstep(0.0, POLE_FADEOUT_RADIUS, dist_to_pos)
    pole_fade_neg = smoothstep(0.0, POLE_FADEOUT_RADIUS, dist_to_neg)
    pole_fade = pole_fade_pos * pole_fade_neg

    # === CIRCULAR BORDER ALPHA (like color_cloud.py) ===
    # Distance from center
    center_x = x  # already centered
    center_y = y
    dist = np.sqrt(center_x * center_x + center_y * center_y) * 2.0  # Scale so edge is at 1.0

    # Smooth alpha falloff with wider gradient
    border_alpha = 1.0 - smoothstep(0.0, 0.85, dist)
    # Apply extra smoothing curve for softer edges
    border_alpha = border_alpha * border_alpha * (3.0 - 2.0 * border_alpha)

    # Combine pole fade and border alpha
    final_alpha = pole_fade * border_alpha

    # Apply alpha to colors for premultiplied output
    r = r * pole_fade
    g = g * pole_fade
    b = b * pole_fade

    # Create output frame
    frame = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    frame[..., 0] = (np.clip(r, 0, 1) * 255).astype(np.uint8)
    frame[..., 1] = (np.clip(g, 0, 1) * 255).astype(np.uint8)
    frame[..., 2] = (np.clip(b, 0, 1) * 255).astype(np.uint8)
    frame[..., 3] = (final_alpha * 255).astype(np.uint8)

    return frame


def main():
    print(f"Rendering dipole mesh gradient...")
    print(f"  {WIDTH}x{HEIGHT}, {DURATION}s @ {FPS}fps")

    temp_dir = tempfile.mkdtemp()
    print(f"  Rendering {TOTAL_FRAMES} frames...")

    try:
        for i in range(TOTAL_FRAMES):
            t = i / FPS
            frame_data = render_frame(t, DURATION)
            img = Image.fromarray(frame_data, 'RGBA')
            frame_path = os.path.join(temp_dir, f"frame_{i:04d}.png")
            img.save(frame_path)

            if (i + 1) % 30 == 0:
                print(f"    Frame {i + 1}/{TOTAL_FRAMES}")

        output_path = os.path.join(OUTPUT_DIR, "dipole_mesh_gradient.mp4")
        print(f"  Encoding video to {output_path}...")

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

        print(f"\nDone! Video saved to: {output_path}")

    finally:
        shutil.rmtree(temp_dir)


if __name__ == "__main__":
    main()
