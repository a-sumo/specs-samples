#!/usr/bin/env python3
"""Lift dark StoryUI texture values for additive Spectacles display."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


DEFAULT_MIN_VALUE = 70
DEFAULT_ALPHA_THRESHOLD = 12


def lift_pixel(r: int, g: int, b: int, minimum: int) -> tuple[int, int, int]:
    current = max(r, g, b)
    if current >= minimum:
        return r, g, b
    if current <= 0:
        return minimum, minimum, minimum

    scale = minimum / current
    return (
        min(255, int(round(r * scale))),
        min(255, int(round(g * scale))),
        min(255, int(round(b * scale))),
    )


def process_image(path: Path, minimum: int, alpha_threshold: int) -> tuple[int, int]:
    image = Image.open(path).convert("RGBA")
    pixels = image.load()
    changed = 0
    total_visible = 0

    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a <= alpha_threshold:
                continue
            total_visible += 1
            nr, ng, nb = lift_pixel(r, g, b, minimum)
            if (nr, ng, nb) != (r, g, b):
                pixels[x, y] = (nr, ng, nb, a)
                changed += 1

    if changed > 0:
        image.save(path)
    return changed, total_visible


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default="Assets/Images/StoryUI")
    parser.add_argument("--min-value", type=int, default=DEFAULT_MIN_VALUE)
    parser.add_argument("--alpha-threshold", type=int, default=DEFAULT_ALPHA_THRESHOLD)
    args = parser.parse_args()

    root = Path(args.dir)
    paths = sorted(root.glob("*.png"))
    processed = 0
    changed_pixels = 0
    visible_pixels = 0

    for path in paths:
        changed, visible = process_image(path, args.min_value, args.alpha_threshold)
        processed += 1
        changed_pixels += changed
        visible_pixels += visible

    print(
        f"Raised StoryUI value floor to {args.min_value}/255 on {processed} PNGs; "
        f"{changed_pixels} of {visible_pixels} visible pixels changed."
    )


if __name__ == "__main__":
    main()
