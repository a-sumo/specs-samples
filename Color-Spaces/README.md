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
sRGB, XYZ, CIELAB, CIELUV, OkLab. These are the most useful ones for artists due to their perceptual accuracy.

Their second role is to control materials, located at `Color-Spaces/Assets/Materials/MeshTransforms/`. These materials will take the input position of the geometry and add a transform to it in order to move from a origin color space to a destination color space. They use a blend parameter to interpolate between those positions. 

Finally, I needed an interface to morph between such color spaces. I wanted to experiment with something different than sliders, so I implemented a ColorSpacePlaneController `Color-Spaces/Assets/Scripts/Controllers/ColorSpacePlaneController.ts`. It's basically a slider, but on a plane, so a 2D Slider.
First, color space presets are laid out in radial coordinates (distance from center, and angle value). Then, the hover interaction on a plane provides a hit position UV coordinates which are then converted into radial coordinates and those radial coordinates into a blending value between two spaces at the time. 

Because hover interaction can be quite noisy, I added snapping. It occured to me that it was unlikely for the user to want to remain in some hybrid color space, though they might appreciate smooth transitions between color space presets.

The `Color-Spaces/Assets/Scripts/Generators/PigmentGamutMeshGenerator.ts` uses Kubelka Munk theory (https://en.wikipedia.org/wiki/Kubelka%E2%80%93Munk_theory ) to mix colors in a way that's physically accurate and create a gamut based on those mixes. 
For the Lens Studio implementation, I've taken inspiration from the Spectral.js library https://github.com/rvanwijnen/spectral.js. The script creates a lookup table that stores an achievability flag for every color of the space based on two or three-way color mixing of some input pigments. The visualizer then simply does not render the geometry for the colors that are not achievable.

Finally, the `Color-Spaces/Assets/Scripts/Generators/GamutProjectionMeshGenerator.ts` finds the closest point in the color gamut to an input point. This allows in essence to project a target color onto the space of achievable colors. 

## UX

I wanted the Lens to feel relaxing, so I added a  script `Color-Spaces/Assets/Scripts/Utils/BreathingMotion.ts` that can be added to any component, and simulates a verical cyclic motion similar to breathing. 
I also added an animated meshgradient gif to the Lens title's background. Running such a shader in real-time would be too expensive, so I did it in Python and output a gif which I brougth in Lens Studio. The implementation can be found at Color-Spaces/Assets/Scripts/Utils/render_color_cloud.py
Finally, a added a little utility file called Color-Spaces/Assets/Scripts/Utils/KeepUpright.ts that allows to preserve the orientation of text elements such as labels even when they're attached to moving objects.