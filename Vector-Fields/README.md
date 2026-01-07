<p align="center">
  <img src="../assets/vector-fields/magnetic-field-demo.gif" alt="Magnetic Field Demo" width="500">
</p>

<h1 align="center">Vector Fields</h1>

## Overview

This project visualizes vector fields in augmented reality using procedurally generated tube meshes that deform along field lines. This repository accompanies a blog post that I encourage you to check out!

<p align="center">
  <a href="https://a-sumo.github.io/posts/visualizing-vector-fields-on-ar-glasses/">
    <strong>Visualizing Vector Fields on AR Glasses</strong>
  </a>
</p>

## Implementation

### Tube Mesh Generation

Tubes are generated procedurally using the MeshBuilder API. Rings of vertices are created along the tube length and connected with triangles, with hemispherical end caps.

<p align="center">
  <img src="../assets/vector-fields/TubeConstruction.gif" alt="Tube Construction" width="400">
</p>

### GPU Tube Deformation

Deforming tubes while preserving volume requires computing a moving T/N/B (Tangent, Normal, Binormal) coordinate frame at each point. A naive offset where rings stay horizontal produces incorrect endcaps:

<p align="center">
  <img src="../assets/vector-fields/NaiveOffset.gif" alt="Naive Offset" width="280">
  &nbsp;&nbsp;&nbsp;
  <img src="../assets/vector-fields/TNBFrame.gif" alt="TNB Frame" width="280">
</p>
<p align="center"><em>Left: Naive offset (rings stay horizontal) | Right: TNB frame (rings perpendicular to tangent)</em></p>

<p align="center">
  <img src="../assets/vector-fields/TubeDeformation.gif" alt="Tube Deformation" width="400">
</p>

### Field Integration

Starting from sample points, the shader integrates along the field: `pos += field(pos) * stepSize`, computing local coordinate frames that follow the path curvature.

<p align="center">
  <img src="../assets/vector-fields/VectorFieldIntegration.gif" alt="Vector Field Integration" width="400">
</p>

### Visualization Modes

The implementation supports three visualization modes that can be toggled at runtime:

- **Arrows**: Static vectors showing direction and magnitude at discrete sample points. Best for understanding local field behavior.
- **Flow Lines**: Tubes that follow field lines by integrating through the field. Shows how the field flows through space.
- **Particles**: Animated points that advect along the field, revealing the dynamic nature of the flow.

<p align="center">
  <img src="../assets/vector-fields/visualization-modes-demo.gif" alt="Visualization Modes Demo">
</p>
<p align="center"><em>Demo showing the three visualization modes: arrows, flow lines, and particles</em></p>


## Components

### Scripts

| Script | Description |
|--------|-------------|
| `VectorField.ts` | Main vector field visualization with multiple preset field types (Expansion, Contraction, Circulation, Vortex, Waves) |
| `MagneticField.ts` | Magnetic dipole field visualization with two interactive magnets |
| `TubeTest.ts` | Test component for tube mesh generation and GPU deformation |
| `FieldController.ts` | Controller for switching between field types and managing field parameters |
| `DynamicSettingsPanel.ts` | Runtime UI panel for adjusting field parameters |
| `MagnetPhysics.ts` | Physics simulation for magnet interactions |
| `IridescentMaterial.ts` | Iridescent material controller for magnet visuals |

### Shaders

| Shader | Description |
|--------|-------------|
| `VectorField.js` | GPU shader that integrates field lines and computes T/N/B frames for tube deformation |
| `MagneticField.js` | Computes magnetic field from two dipole magnets using the formula `B = (3(m·r̂)r̂ - m) / r³` |
| `TubeTest.js` | Test shader for basic tube deformation along parametric curves |
| `MagnetPole.js` | Shader for rendering magnet pole indicators |
| `IridescentShader.js` | Iridescent surface shader for magnet visualization |


## Field Types

### Vector Field Presets

#### Contraction
Vectors spiral inward toward a target point, creating sink-like behavior.

<p align="center">
  <img src="../assets/vector-fields/FieldContraction.gif" alt="Contraction Field" width="500">
</p>
<p align="center"><em>Manim visualization of contraction field</em></p>

<p align="center">
  <img src="../assets/vector-fields/contraction-demo.gif" alt="Contraction Demo" width="500">
</p>
<p align="center"><em>Demo on Spectacles</em></p>

#### Expansion
Radial waves emanate outward from the target with 3D oscillation perpendicular to the flow.

<p align="center">
  <img src="../assets/vector-fields/FieldExpansion.gif" alt="Expansion Field" width="500">
</p>
<p align="center"><em>Manim visualization of expansion field</em></p>

<p align="center">
  <img src="../assets/vector-fields/expansion-demo.gif" alt="Expansion Demo" width="500">
</p>
<p align="center"><em>Demo on Spectacles</em></p>

#### Circulation
A 3D swirling vortex that mixes rotation in multiple planes around the target.

<p align="center">
  <img src="../assets/vector-fields/FieldCirculation.gif" alt="Circulation Field" width="500">
</p>
<p align="center"><em>Manim visualization of circulation field</em></p>

<p align="center">
  <img src="../assets/vector-fields/circulation-demo.gif" alt="Circulation Demo" width="500">
</p>
<p align="center"><em>Demo on Spectacles</em></p>

#### Vortex
Rotating cellular patterns with an added spin component based on angular position.

<p align="center">
  <img src="../assets/vector-fields/FieldVortex.gif" alt="Vortex Field" width="500">
</p>
<p align="center"><em>Manim visualization of vortex field</em></p>

<p align="center">
  <img src="../assets/vector-fields/vortex-demo.gif" alt="Vortex Demo" width="500">
</p>
<p align="center"><em>Demo on Spectacles</em></p>

#### Waves
Sinusoidal interference patterns where each axis oscillates based on the other two coordinates.

<p align="center">
  <img src="../assets/vector-fields/FieldWaves.gif" alt="Waves Field" width="500">
</p>
<p align="center"><em>Manim visualization of waves field</em></p>

<p align="center">
  <img src="../assets/vector-fields/waves-demo.gif" alt="Waves Demo" width="500">
</p>
<p align="center"><em>Demo on Spectacles</em></p>

### Magnetic Field

Physically-based magnetic field from two dipole magnets. Each dipole creates a field following:

```
B = (3(m·r̂)r̂ - m) / r³
```

<p align="center">
  <img src="../assets/vector-fields/MagneticField.gif" alt="Magnetic Field" width="500">
</p>
<p align="center"><em>Manim visualization of magnetic dipole field</em></p>

<p align="center">
  <img src="../assets/vector-fields/magnetic-field-demo.gif" alt="Magnetic Field Demo" width="500">
</p>
<p align="center"><em>Demo on Spectacles with interactive magnet positioning</em></p>

The magnets can be repositioned interactively to observe field line changes in real-time.

## Performance & LOD

In order to improve performance on Spectacles and avoid freezes due to unintentionally high parameters, a vertex budget has been defined (32K vertices per-mesh limit) and all procedural geometry generation settings are ajusted all parameters to fit within this budget.

Additional Level of Detail (LOD) presets are available via the settings panel. 
Among others, they control:
- radial segments: Cross-section smoothness (4 = square-ish, 8 = round)
- length segments: Curve fidelity and integration steps
- grid size: Spatial density of field samples

## Usage

1. Open the project in Lens Studio
2. Select a field type from the FieldController
3. Adjust parameters using DynamicSettingsPanel
4. For magnetic fields, reposition the magnet objects to see field changes

## Exports

Pre-built lens packages are available in the `exports/` folder. These contain material and shader for either field mode, that you can drag and drop in any project.
- `VectorField.lspkg` - Vector field presets lens
- `MagneticField.lspkg` - Magnetic field lens

## Related

- [Article: Vector Fields in Augmented Reality](https://a-sumo.github.io/posts/visualizing-vector-fields-on-ar-glasses/)
- [Color Spaces Project](../Color-Spaces/)
- [Eyedropper Project](../Eyedropper/)
