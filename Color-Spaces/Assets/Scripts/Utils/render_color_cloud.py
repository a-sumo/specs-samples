#!/usr/bin/env python3
"""Render ColorCloud shader to APNG with proper alpha"""

import numpy as np
from PIL import Image

WIDTH = 512
HEIGHT = 512
FPS = 20
DURATION = 5
TOTAL_FRAMES = FPS * DURATION

def render_frame_vectorized(t):
    """Vectorized render"""
    y_coords, x_coords = np.mgrid[0:HEIGHT, 0:WIDTH]
    uv_x = x_coords / WIDTH
    uv_y = y_coords / HEIGHT

    time = t * 0.3

    n1 = np.sin(uv_x * 3.0 + time) * np.cos(uv_y * 2.0 - time * 0.7)
    n2 = np.cos(uv_x * 2.5 - time * 0.5) * np.sin(uv_y * 3.5 + time)
    n3 = np.sin((uv_x + uv_y) * 2.0 + time * 0.8)

    c1 = np.array([1.0, 0.3, 0.5])
    c2 = np.array([0.3, 0.5, 1.0])
    c3 = np.array([0.2, 0.9, 0.6])
    c4 = np.array([1.0, 0.8, 0.2])

    mix1 = (n1 * 0.5 + 0.5)[..., np.newaxis]
    color = c1 * (1 - mix1) + c2 * mix1

    mix2 = (n2 * 0.5 + 0.5)[..., np.newaxis]
    color = color * (1 - mix2) + c3 * mix2

    mix3 = (n3 * 0.3 + 0.3)[..., np.newaxis]
    color = color * (1 - mix3) + c4 * mix3

    center_x = uv_x - 0.5
    center_y = uv_y - 0.5
    dist = np.sqrt(center_x * center_x + center_y * center_y) * 2.0

    alpha = 1.0 - np.clip((dist - 0.3) / 0.7, 0.0, 1.0)

    frame = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    frame[..., 0] = (np.clip(color[..., 0], 0, 1) * 255).astype(np.uint8)
    frame[..., 1] = (np.clip(color[..., 1], 0, 1) * 255).astype(np.uint8)
    frame[..., 2] = (np.clip(color[..., 2], 0, 1) * 255).astype(np.uint8)
    frame[..., 3] = (alpha * 255).astype(np.uint8)

    return frame

def main():
    print(f"Rendering {TOTAL_FRAMES} frames at {WIDTH}x{HEIGHT}...")

    frames = []
    for i in range(TOTAL_FRAMES):
        t = i / FPS
        frame = render_frame_vectorized(t)
        img = Image.fromarray(frame, 'RGBA')
        frames.append(img)

        if (i + 1) % 60 == 0:
            print(f"  Frame {i + 1}/{TOTAL_FRAMES}")

    output_path = "/Users/armand/Documents/specs-samples/assets/color-spaces/color_cloud.png"
    print(f"Saving APNG to {output_path}...")

    frames[0].save(
        output_path,
        save_all=True,
        append_images=frames[1:],
        duration=int(1000 / FPS),
        loop=0
    )

    print("Done!")

if __name__ == "__main__":
    main()
