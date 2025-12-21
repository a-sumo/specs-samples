/**
 * Spherical controller for selecting between 5 options.
 *
 * 5 points are placed on a sphere. Rotating the sphere brings different
 * points to the "front" (positive Z direction). The frontmost point
 * becomes the active selection.
 *
 * Point arrangement: one at front, four around it (left, right, up, down).
 * The back of the sphere is unused.
 */

export type SpherePointId = 0 | 1 | 2 | 3 | 4;

export interface SpherePoint {
  id: SpherePointId;
  label: string;
  /** Position on unit sphere (before rotation) */
  basePosition: vec3;
  /** Current position after sphere rotation */
  currentPosition: vec3;
}

export class SphereController {
  private points: SpherePoint[] = [];
  private rotation: quat = quat.quatIdentity();
  private _activePointId: SpherePointId = 0;

  /** Callback fired when active point changes */
  public onActiveChange?: (pointId: SpherePointId, label: string) => void;

  /** Labels for the 5 points (can be customized) */
  private labels: string[];

  constructor(labels: string[] = ["RGB", "CIELAB", "CIEXYZ", "Oklab", "CIELUV"]) {
    this.labels = labels;
    this.initializePoints();
    this.updateActivePoint();
  }

  /**
   * Arrange 5 points on the sphere:
   * - Point 0: Front center (will be active initially)
   * - Points 1-4: Arranged in a ring around front (left, up, right, down)
   *
   * Using a latitude of ~60° from front for the ring gives good separation.
   */
  private initializePoints(): void {
    const frontDir = new vec3(0, 0, 1);

    // Point 0: Front center
    this.points.push({
      id: 0,
      label: this.labels[0],
      basePosition: frontDir,
      currentPosition: frontDir,
    });

    // Points 1-4: Ring at 72° from front (360°/5 = 72° spacing conceptually)
    // Using spherical coordinates: theta from front axis, phi around
    const theta = Math.PI * 0.4; // ~72° from front
    const ringRadius = Math.sin(theta);
    const ringZ = Math.cos(theta);

    for (let i = 0; i < 4; i++) {
      // phi: 0=left(-X), 90=up(+Y), 180=right(+X), 270=down(-Y)
      const phi = (i * Math.PI / 2) + Math.PI; // Start from left
      const x = ringRadius * Math.cos(phi);
      const y = ringRadius * Math.sin(phi);
      const z = ringZ;

      const pos = new vec3(x, y, z);
      this.points.push({
        id: (i + 1) as SpherePointId,
        label: this.labels[i + 1],
        basePosition: pos,
        currentPosition: pos,
      });
    }
  }

  /** Apply current rotation to all points */
  private applyRotation(): void {
    for (const point of this.points) {
      point.currentPosition = this.rotation.multiplyVec3(point.basePosition);
    }
  }

  /** Find which point is closest to front (+Z) and update active */
  private updateActivePoint(): void {
    const frontDir = new vec3(0, 0, 1);
    let bestId: SpherePointId = 0;
    let bestDot = -Infinity;

    for (const point of this.points) {
      const dot = point.currentPosition.dot(frontDir);
      if (dot > bestDot) {
        bestDot = dot;
        bestId = point.id;
      }
    }

    if (bestId !== this._activePointId) {
      this._activePointId = bestId;
      if (this.onActiveChange) {
        this.onActiveChange(bestId, this.points[bestId].label);
      }
    }
  }

  /** Get current active point ID */
  get activePointId(): SpherePointId {
    return this._activePointId;
  }

  /** Get current active point label */
  get activeLabel(): string {
    return this.points[this._activePointId].label;
  }

  /** Get all points with current positions */
  get allPoints(): readonly SpherePoint[] {
    return this.points;
  }

  /** Get current rotation quaternion */
  get currentRotation(): quat {
    return this.rotation;
  }

  /**
   * Rotate the sphere by euler angles (in radians).
   * - rotateX: pitch (rotate up/down)
   * - rotateY: yaw (rotate left/right)
   */
  public rotate(deltaYaw: number, deltaPitch: number): void {
    // Create rotation quaternions
    const yawQuat = quat.fromEulerAngles(0, deltaYaw, 0);
    const pitchQuat = quat.fromEulerAngles(deltaPitch, 0, 0);

    // Apply: new rotation = yaw * pitch * current
    // This gives intuitive control: yaw in world space, pitch in local
    this.rotation = yawQuat.multiply(this.rotation);
    this.rotation = this.rotation.multiply(pitchQuat);

    this.applyRotation();
    this.updateActivePoint();
  }

  /**
   * Rotate to bring a specific point to the front.
   * Returns the rotation needed (for animation purposes).
   */
  public rotateToPoint(pointId: SpherePointId): quat {
    const point = this.points[pointId];
    const frontDir = new vec3(0, 0, 1);

    // Find rotation that brings point.basePosition to frontDir
    const targetRotation = quat.lookAt(point.basePosition, frontDir);

    // Invert because we want to rotate the sphere, not the camera
    this.rotation = targetRotation;
    this.applyRotation();
    this.updateActivePoint();

    return this.rotation;
  }

  /**
   * Set rotation directly (for animation interpolation).
   */
  public setRotation(rotation: quat): void {
    this.rotation = rotation;
    this.applyRotation();
    this.updateActivePoint();
  }

  /**
   * Reset rotation to identity (point 0 at front).
   */
  public reset(): void {
    this.rotation = quat.quatIdentity();
    this.applyRotation();
    this.updateActivePoint();
  }

  /**
   * Snap to the nearest point.
   * Returns the target rotation for animation.
   */
  public snapToNearest(): quat {
    return this.rotateToPoint(this._activePointId);
  }

  /**
   * Get the rotation needed to snap to a specific point.
   * Does not apply the rotation - use for animation planning.
   */
  public getRotationToPoint(pointId: SpherePointId): quat {
    const point = this.points[pointId];
    // Calculate rotation that brings this point's base position to +Z
    return this.calculateAlignmentRotation(point.basePosition, new vec3(0, 0, 1));
  }

  /**
   * Calculate quaternion to rotate 'from' direction to 'to' direction.
   */
  private calculateAlignmentRotation(from: vec3, to: vec3): quat {
    const fromNorm = from.normalize();
    const toNorm = to.normalize();

    const dot = fromNorm.dot(toNorm);

    if (dot > 0.9999) {
      return quat.quatIdentity();
    }

    if (dot < -0.9999) {
      // Opposite directions - rotate 180° around any perpendicular axis
      let axis = new vec3(1, 0, 0).cross(fromNorm);
      if (axis.length < 0.001) {
        axis = new vec3(0, 1, 0).cross(fromNorm);
      }
      return quat.angleAxis(Math.PI, axis.normalize());
    }

    const axis = fromNorm.cross(toNorm).normalize();
    const angle = Math.acos(dot);
    return quat.angleAxis(angle, axis);
  }

  /**
   * Get the "frontness" of each point (dot product with +Z).
   * Useful for rendering (e.g., opacity based on frontness).
   */
  public getPointFrontness(): Map<SpherePointId, number> {
    const result = new Map<SpherePointId, number>();
    const frontDir = new vec3(0, 0, 1);

    for (const point of this.points) {
      const dot = point.currentPosition.dot(frontDir);
      // Remap from [-1, 1] to [0, 1]
      result.set(point.id, (dot + 1) / 2);
    }

    return result;
  }

  /**
   * Check if a point is on the back of the sphere (Z < 0).
   */
  public isPointHidden(pointId: SpherePointId): boolean {
    return this.points[pointId].currentPosition.z < 0;
  }
}
