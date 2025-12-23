#!/usr/bin/env python3
"""Render ColorCloud shader to sprite sheet PNG - matches GLSL shader"""

import numpy as np
from PIL import Image
import math

WIDTH = 512
HEIGHT = 512
FPS = 12
DURATION = 10
TOTAL_FRAMES = FPS * DURATION

OUTPUT_DIR = "/Users/armand/Documents/specs-samples/Color-Spaces/Assets/Images"

def render_frame_vectorized(t, loop_duration):
    """Vectorized render matching ColorCloud.js shader exactly"""
    y_coords, x_coords = np.mgrid[0:HEIGHT, 0:WIDTH]
    uv_x = x_coords / WIDTH
    # Flip Y for Lens Studio (bottom-left is 0,0)
    uv_y = 1.0 - (y_coords / HEIGHT)

    # Loop-friendly time that matches shader behavior
    # Shader uses t * 0.3, we need full cycle at loop_duration
    # For seamless loop: phase should complete 2*pi at loop_duration
    time = (t / loop_duration) * (2.0 * np.pi / 0.3)

    # Noise functions matching shader exactly
    n1 = np.sin(uv_x * 3.0 + time) * np.cos(uv_y * 2.0 - time * 0.7)
    n2 = np.cos(uv_x * 2.5 - time * 0.5) * np.sin(uv_y * 3.5 + time)
    n3 = np.sin((uv_x + uv_y) * 2.0 + time * 0.8)

    # Colors matching shader
    c1 = np.array([1.0, 0.3, 0.5])  # pink
    c2 = np.array([0.3, 0.5, 1.0])  # blue
    c3 = np.array([0.2, 0.9, 0.6])  # cyan/green
    c4 = np.array([1.0, 0.8, 0.2])  # yellow

    # Mix colors matching shader
    mix1 = (n1 * 0.5 + 0.5)[..., np.newaxis]
    color = c1 * (1 - mix1) + c2 * mix1

    mix2 = (n2 * 0.5 + 0.5)[..., np.newaxis]
    color = color * (1 - mix2) + c3 * mix2

    mix3 = (n3 * 0.3 + 0.3)[..., np.newaxis]
    color = color * (1 - mix3) + c4 * mix3

    # Circular mask - ensure nothing touches borders
    center_x = uv_x - 0.5
    center_y = uv_y - 0.5
    dist = np.sqrt(center_x * center_x + center_y * center_y) * 2.0

    # Smoother alpha falloff with wider gradient
    alpha = 1.0 - smoothstep_np(0.0, 0.85, dist)
    # Apply extra smoothing curve for softer edges
    alpha = alpha * alpha * (3.0 - 2.0 * alpha)

    frame = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    frame[..., 0] = (np.clip(color[..., 0], 0, 1) * 255).astype(np.uint8)
    frame[..., 1] = (np.clip(color[..., 1], 0, 1) * 255).astype(np.uint8)
    frame[..., 2] = (np.clip(color[..., 2], 0, 1) * 255).astype(np.uint8)
    frame[..., 3] = (alpha * 255).astype(np.uint8)

    return frame

def smoothstep_np(edge0, edge1, x):
    """GLSL smoothstep implementation"""
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)

def create_sprite_sheet(frames, cols=8):
    """Create sprite sheet from frames"""
    rows = math.ceil(len(frames) / cols)
    sheet_width = WIDTH * cols
    sheet_height = HEIGHT * rows

    sheet = Image.new('RGBA', (sheet_width, sheet_height), (0, 0, 0, 0))

    for i, frame in enumerate(frames):
        row = i // cols
        col = i % cols
        x = col * WIDTH
        y = row * HEIGHT
        sheet.paste(frame, (x, y))

    return sheet

def main():
    print(f"Rendering {TOTAL_FRAMES} frames at {WIDTH}x{HEIGHT}...")
    print(f"Duration: {DURATION}s, FPS: {FPS}, seamless loop")

    frames = []
    for i in range(TOTAL_FRAMES):
        t = i / FPS
        frame_data = render_frame_vectorized(t, DURATION)
        img = Image.fromarray(frame_data, 'RGBA')
        frames.append(img)

        if (i + 1) % 12 == 0:
            print(f"  Frame {i + 1}/{TOTAL_FRAMES}")

    # Save sprite sheet PNG (Lens Studio compatible) with compression
    cols = 12
    sprite_path = f"{OUTPUT_DIR}/color_cloud_sprite.png"
    print(f"Saving sprite sheet to {sprite_path}...")
    sprite_sheet = create_sprite_sheet(frames, cols=cols)
    sprite_sheet.save(sprite_path, optimize=True, compress_level=9)

    # Also save single frame PNG for preview
    preview_path = f"{OUTPUT_DIR}/color_cloud.png"
    print(f"Saving preview frame to {preview_path}...")
    frames[len(frames)//4].save(preview_path)

    rows = math.ceil(TOTAL_FRAMES / cols)
    print(f"\nDone! Files created:")
    print(f"  - {sprite_path} ({TOTAL_FRAMES} frames in {cols}x{rows} grid)")
    print(f"  - {preview_path} (single frame preview)")
    print(f"\nSprite sheet info for shader:")
    print(f"  Columns: {cols}")
    print(f"  Rows: {rows}")
    print(f"  Total frames: {TOTAL_FRAMES}")
    print(f"  FPS: {FPS}")
    print(f"  Duration: {DURATION}s (seamless loop)")
    print(f"  Frame size: {WIDTH}x{HEIGHT}")

if __name__ == "__main__":
    main()
