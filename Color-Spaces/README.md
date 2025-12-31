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

Here are the core problems I tackled, which stemmed from me trying to mix oil and acrylic paint on a palette:

1. How do I see where a specific color is located relatively to other colors?
2. What colors can I produce by mixing the colors I have?
3. There's a target color I'd like to recreate. Given the colors at my disposal, how close can I get to it?

The implementations in this repo are solutions to each of these practical problems. 
Before starting the project, I actually knew very little about color spaces, color mixing simulations or color gamuts. But I had a firm conviction that the problems I was facing were all solvable and that the solution could be brought into Spectacles.


## Implementation

The core files that are involved in the visualization are located at `Color-Spaces/Assets/Scripts/Generators/`:

- `Color-Spaces/Assets/Scripts/Generators/RGBCubeGenerator.ts`
- `Color-Spaces/Assets/Scripts/Generators/PigmentGamutMeshGenerator.ts`
- `Color-Spaces/Assets/Scripts/Generators/GamutProjectionMeshGenerator.ts`

The first role of the generators is to create geometry, via the MeshBuilder API. More specifically, they spawn small cube meshes with a color corresponding to their color space value. In our project we handle 5 separate color spaces in total: 
sRGB, XYZ, CIELAB, CIELUV, OkLab. 

Their second role is to control materials, located at `Color-Spaces/Assets/Materials/MeshTransforms/`. These materials will take the input position of the geometry and add a transform to it in order to move from a origin color space to a destination color space. They use a blend parameter to interpolate between those positions. 

Finally, I needed an interface to morph between such color spaces. I really didn't want to use Sliders, as I felt it would bring down the UX. So I implemented a ColorSpacePlaneController `Color-Spaces/Assets/Scripts/Controllers/ColorSpacePlaneController.ts`. 


Built with **Lens Studio 5.15** targeting **2024 Spectacles Augmented Reality Glasses**.


