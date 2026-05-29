# Surface Placement

A comprehensive surface detection and object placement system for AR experiences. This package provides horizontal, vertical, and near-surface placement modes with adjustment widgets, surface detection utilities, and SIK integration for interactive object positioning.

## Features

- **Multiple Placement Modes**: Horizontal (floor/tables), Vertical (walls), and Near-Surface detection
- **Adjustment Widget**: Interactive slider for fine-tuning object placement
- **Surface Detection**: Automatic surface discovery with hit testing
- **Hand Hints Integration**: Visual tutorials for surface placement gestures
- **Placement Settings**: Configurable modes with offset and callback support
- **Circle Animation**: Visual feedback during surface detection
- **SIK Compatibility**: Works seamlessly with Spectacles Interaction Kit

## Quick Start

Set up basic horizontal surface placement:

```typescript
import {PlacementSettings, PlacementMode} from "SurfacePlacement.lspkg/Scripts/PlacementSettings";

@component
export class SurfacePlacementExample extends BaseScriptComponent {
  @input objectToPlace: SceneObject;
  @input interactable: Interactable;

  private settings: PlacementSettings;

  onAwake() {
    // Configure placement for horizontal surfaces
    this.settings = new PlacementSettings(
      PlacementMode.HORIZONTAL,
      true,  // use adjustment widget
      new vec3(2, 2, 0),  // widget offset
      (position) => this.onPositionUpdate(position)
    );

    // Trigger placement on interaction
    this.interactable.onTriggerStart.add(() => {
      this.placementObject();
    });
  }

  placeObject() {
    // Surface detection and placement logic
    print("Placing object on horizontal surface");
    this.objectToPlace.enabled = true;
  }

  onPositionUpdate(newPosition: vec3) {
    this.objectToPlace.getTransform().setWorldPosition(newPosition);
  }
}
```

## Script Highlights

### PlacementSettings.ts
Defines configuration for surface placement behavior with three modes (HORIZONTAL, VERTICAL, NEAR_SURFACE). Provides settings for adjustment widget usage, widget offset positioning, and slider update callbacks. The PlacementSettings class encapsulates all placement parameters in a single configuration object that can be passed to placement controllers for consistent behavior across different placement scenarios.

### SurfaceDetector.ts
Implements surface detection using raycasting and hit testing to find suitable placement locations. Performs continuous surface scanning and evaluates surface normals to determine if detected surfaces match the requested placement mode (horizontal vs vertical). Provides callbacks for surface found/lost events and maintains surface validity state based on angle thresholds and distance requirements.

### CircleAnimation.ts
Creates animated visual feedback during surface detection with expanding/contracting circles. The animation provides users with visual confirmation that the system is actively searching for placement surfaces. Circle size and opacity animate to draw attention to detected surfaces and provide intuitive feedback during the placement process.

## Core API Methods

```typescript
// Placement configuration
PlacementSettings(
  mode: PlacementMode,
  useWidget: boolean,
  widgetOffset: vec3,
  onSliderUpdate: (value: vec3) => void
)

// Placement modes
enum PlacementMode {
  HORIZONTAL,
  VERTICAL,
  NEAR_SURFACE
}

// Surface detection
detectSurface(): Surface | null
isSurfaceValid(surface: Surface): boolean
```

## Advanced Usage

### Multi-Mode Placement System

Allow users to switch between horizontal and vertical placement:

```typescript
@component
export class AdaptivePlacement extends BaseScriptComponent {
  @input objectToPlace: SceneObject;
  @input modeToggleButton: Interactable;

  private currentMode = PlacementMode.HORIZONTAL;
  private settings: PlacementSettings;

  onAwake() {
    this.updatePlacementMode();

    this.modeToggleButton.onTriggerStart.add(() => {
      this.toggleMode();
    });
  }

  toggleMode() {
    if (this.currentMode === PlacementMode.HORIZONTAL) {
      this.currentMode = PlacementMode.VERTICAL;
    } else {
      this.currentMode = PlacementMode.HORIZONTAL;
    }

    this.updatePlacementMode();
    print(`Switched to ${this.currentMode} mode`);
  }

  updatePlacementMode() {
    this.settings = new PlacementSettings(
      this.currentMode,
      true,
      new vec3(2, 2, 0),
      (pos) => this.updateObjectPosition(pos)
    );
  }

  updateObjectPosition(position: vec3) {
    const transform = this.objectToPlace.getTransform();
    transform.setWorldPosition(position);

    // Rotate object based on mode
    if (this.currentMode === PlacementMode.VERTICAL) {
      const rotation = quat.fromEulerVec(new vec3(90, 0, 0));
      transform.setWorldRotation(rotation);
    } else {
      transform.setWorldRotation(quat.quatIdentity());
    }
  }
}
```

## Built with 👻 by the Spectacles team




