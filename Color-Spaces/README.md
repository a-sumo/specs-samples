<p align="center">
  <img src="../assets/color-spaces/preview.png" alt="Color Spaces Preview" width="120">
</p>

<h1 align="center">Color Spaces</h1>

<p align="center">
  <strong>Interactive 3D visualization of color spaces in AR</strong><br>
  A Lens Studio 5.15 project for 2024 Spectacles Augmented Reality Glasses
</p>

<p align="center">
  <img src="../assets/color-spaces/demo.gif" alt="Demo" width="400">
</p>

<p align="center">
I've made a blog post where I provide a different perspective on the project and a broader context on why I took it on:
  <a href="https://a-sumo.github.io/posts/visualizing-color-spaces-in-ar-glasses/">
    <strong>Visualizing Color Spaces in AR Glasses</strong>
  </a>
</p>

## Overview

The aim for this project is to showcase the procedural geometry capabilities of Lens Studio 5.15 on 2024 Spectacles AR Glasses.

Here are the core problems I tackled:

1. How do I see where a specific color is located relatively to other colors?
2. What colors can I produce by mixing the colors I have?
3. There's a target color I'd like to recreate. Given the colors at my disposal, how close can I get to it?


The implementations in this repo are solutions to each of these practical problems. 
Before starting the project, I actually knew very little about color spaces, color mixing simulations or color gamuts. But I had a firm conviction that they were all solvable and that the solution could be brought into Spectacles.

## Implementation


Manipulating geometry in vertex shaders can be quite daunting, but with a step by step approach, it can be very satisfying.



Built with **Lens Studio 5.15** targeting **2024 Spectacles Augmented Reality Glasses**.


