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

---

<h3 align="center">
  <a href="https://a-sumo.github.io/posts/visualizing-color-spaces-in-ar-glasses/">
    Visualizing Color Spaces in AR Glasses: Full Technical Writeup
  </a>
</h3>

---

## Overview

This project visualizes how colors map across different perceptual color spaces in real-time 3D. Watch an RGB cube morph into CIELAB, Oklab, CIEXYZ, and CIELUV — see why some color spaces are more perceptually uniform than others.

Built with **Lens Studio 5.15** targeting **2024 Spectacles Augmented Reality Glasses**.

**Key Features:**
- Real-time morphing between 5 color spaces (RGB, CIELAB, CIEXYZ, Oklab, CIELUV)
- GPU-driven vertex transformation (no mesh rebuild during transitions)
- Pigment gamut visualization using Kubelka-Munk mixing model
- Gamut projection showing nearest achievable colors
- Interactive drag-based color space selection

The architecture and implementation details are covered in depth in the [full article](https://a-sumo.github.io/posts/visualizing-color-spaces-in-ar-glasses/).

## Color Spaces

| Space | Description |
|-------|-------------|
| **RGB** | Standard sRGB cube — the baseline representation |
| **CIELAB** | Perceptually uniform, lightness-aligned (L*a*b*) |
| **CIEXYZ** | CIE 1931 standard, device-independent |
| **Oklab** | Modern perceptual space with improved hue linearity |
| **CIELUV** | Alternative perceptual space with cylindrical form (LCh) |

## Project Structure

```
Color-Spaces/
├── Assets/
│   ├── Scripts/
│   │   ├── Controllers/     # UI and interaction logic
│   │   ├── Generators/      # Procedural mesh generation
│   │   ├── Encoders/        # VFX particle texture encoding
│   │   └── Utils/           # Helper utilities
│   ├── Shaders/             # Custom Code Node shader code (for reference)
│   ├── Materials/           # Material definitions
│   └── VFX/                 # Particle system decoders
├── WORKFLOW_DOCUMENTATION.md  # Technical deep-dive
└── custom_code_node_spec.md   # Shader system reference
```

## Scripts

### Controllers
| Script | Purpose |
|--------|---------|
| `ColorSpacePlaneController.ts` | Drag-based color space selection with snapping |

### Generators
| Script | Purpose |
|--------|---------|
| `RGBCubeGenerator.ts` | Procedural voxel grid representing color space |
| `PigmentGamutMeshGenerator.ts` | Achievable colors via pigment mixing |
| `GamutProjectionMeshGenerator.ts` | Visualizes gamut mapping/projection |
| `SingleColorMarker.ts` | Single color point that tracks through spaces |

### Encoders
| Script | Purpose |
|--------|---------|
| `RGBCubeParticleEncoder.ts` | GPU encodes RGB cube for VFX particles |
| `FullRGBParticleEncoder.ts` | Full sRGB gamut to LAB positions |
| `PigmentMixParticleEncoder.ts` | Kubelka-Munk pigment mixing encoder |
| `GamutProjectionParticleEncoder.ts` | Projects colors to nearest achievable |

### Utilities
| Script | Purpose |
|--------|---------|
| `KeepUpright.ts` | Locks object rotation/scale while allowing position changes |
| `SpectralMixUtil.ts` | Pigment mixing test utility |

## Pigment Presets

The pigment gamut visualization supports 7 palette presets:

| Index | Preset | Description |
|-------|--------|-------------|
| 0 | CMYK + White/Black | Traditional print colors |
| 1 | Primary (RGB + CMY) | Additive and subtractive primaries |
| 2 | Earth Tones | Natural browns, tans, olives |
| 3 | Pastels | Soft, light colors |
| 4 | Warm | Reds, oranges, yellows |
| 5 | Cool | Blues, teals, purples |
| 6 | Custom | User-defined pigments |

## Getting Started

1. Open `Color-Spaces.esproj` in [Lens Studio](https://developers.snap.com/lens-studio/home)
2. Connect Spectacles or use the Preview panel
3. Drag on the color space plane to morph between spaces

## Technical Details

See [WORKFLOW_DOCUMENTATION.md](WORKFLOW_DOCUMENTATION.md) for in-depth coverage of:
- Dynamic mesh generation with MeshBuilder
- GPU-driven vertex transformation
- Data encoding in texture coordinates
- Color space conversion mathematics

---

<p align="center">
  <a href="https://a-sumo.github.io/posts/visualizing-color-spaces-in-ar-glasses/">
    <strong>Read the full article: Visualizing Color Spaces in AR Glasses</strong>
  </a>
</p>
