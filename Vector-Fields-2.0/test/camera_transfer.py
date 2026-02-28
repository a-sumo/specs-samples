"""
camera_transfer.py

Canonical transfer format for mapping camera intrinsics, view transforms,
and scene object properties between rendering engines. Designed so that
any engine pair (ManimGL, Lens Studio, Three.js, Unity, Blender, etc.)
can round-trip through a single intermediate representation.

The core idea: every engine has its own conventions for handedness,
axis orientation, field of view parameterization, and coordinate origin.
Instead of writing N^2 pairwise converters, each engine writes two
functions: `to_canonical(engine_state) -> CanonicalCamera` and
`from_canonical(CanonicalCamera) -> engine_state`.

Canonical conventions:
  - Right-handed coordinate system
  - Y-up (+Y = up, +X = right, -Z = forward/into screen)
  - Position in world units (meters by default)
  - Rotation as quaternion [x, y, z, w] (Hamilton convention)
  - Vertical FOV in radians
  - Aspect ratio = width / height
  - Near/far clip in world units
  - Projection: perspective (orthographic = fov of 0 + ortho_size)

Usage:
  # Lens Studio -> ManimGL
  ls_cam = LensStudioAdapter.to_canonical(ls_camera_data)
  manim_cam = ManimGLAdapter.from_canonical(ls_cam)

  # Three.js -> Lens Studio
  three_cam = ThreeJSAdapter.to_canonical(three_camera_data)
  ls_cam = LensStudioAdapter.from_canonical(three_cam)
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Optional, List, Tuple


# ---------------------------------------------------------------------------
# Canonical representations
# ---------------------------------------------------------------------------

@dataclass
class CanonicalCamera:
    """Engine-agnostic camera state."""
    position: np.ndarray = field(default_factory=lambda: np.zeros(3))  # world XYZ
    rotation: np.ndarray = field(default_factory=lambda: np.array([0, 0, 0, 1.0]))  # quat xyzw
    fov_y: float = 0.7854  # vertical FOV in radians (~45 degrees)
    aspect: float = 1.0     # width / height
    near: float = 0.1
    far: float = 1000.0
    # For orthographic projection:
    ortho: bool = False
    ortho_size: float = 5.0  # half-height in world units


@dataclass
class CanonicalTransform:
    """Engine-agnostic object transform."""
    position: np.ndarray = field(default_factory=lambda: np.zeros(3))
    rotation: np.ndarray = field(default_factory=lambda: np.array([0, 0, 0, 1.0]))  # quat xyzw
    scale: np.ndarray = field(default_factory=lambda: np.ones(3))


# ---------------------------------------------------------------------------
# Quaternion utilities
# ---------------------------------------------------------------------------

def quat_multiply(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Multiply two quaternions [x,y,z,w]."""
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array([
        aw*bx + ax*bw + ay*bz - az*by,
        aw*by - ax*bz + ay*bw + az*bx,
        aw*bz + ax*by - ay*bx + az*bw,
        aw*bw - ax*bx - ay*by - az*bz,
    ])


def quat_conjugate(q: np.ndarray) -> np.ndarray:
    """Conjugate (inverse for unit quaternion) [x,y,z,w]."""
    return np.array([-q[0], -q[1], -q[2], q[3]])


def quat_from_axis_angle(axis: np.ndarray, angle: float) -> np.ndarray:
    """Quaternion from axis-angle [x,y,z,w]."""
    axis = axis / np.linalg.norm(axis)
    s = np.sin(angle / 2)
    return np.array([axis[0]*s, axis[1]*s, axis[2]*s, np.cos(angle/2)])


# ---------------------------------------------------------------------------
# Engine adapters
# ---------------------------------------------------------------------------

class LensStudioAdapter:
    """
    Lens Studio conventions:
      - Left-handed coordinate system
      - Y-up, +Z = forward (into screen)
      - Camera looks along +Z in local space
      - FOV: vertical, in degrees (Camera component)
      - Quaternion: [x, y, z, w]
      - Units: centimeters (scene units)

    Left-handed -> right-handed: negate Z.
    """

    UNIT_SCALE = 0.01  # cm -> meters (canonical uses meters)

    @staticmethod
    def to_canonical(position: list, rotation: list,
                     fov_deg: float = 63.5, aspect: float = 1.0,
                     near: float = 1.0, far: float = 10000.0) -> CanonicalCamera:
        """Convert Lens Studio camera state to canonical."""
        pos = np.array(position, dtype=float)
        rot = np.array(rotation, dtype=float)

        # Left-handed -> right-handed: negate Z position and Z,W quaternion components
        # (negating Z axis flips handedness)
        can_pos = np.array([pos[0], pos[1], -pos[2]]) * LensStudioAdapter.UNIT_SCALE
        can_rot = np.array([rot[0], rot[1], -rot[2], -rot[3]])
        # Normalize
        can_rot = can_rot / np.linalg.norm(can_rot)

        # LS camera looks along +Z (local), canonical looks along -Z.
        # Apply 180-degree rotation around Y to flip forward direction.
        flip_y = quat_from_axis_angle(np.array([0, 1, 0]), np.pi)
        can_rot = quat_multiply(can_rot, flip_y)
        can_rot = can_rot / np.linalg.norm(can_rot)

        return CanonicalCamera(
            position=can_pos,
            rotation=can_rot,
            fov_y=np.radians(fov_deg),
            aspect=aspect,
            near=near * LensStudioAdapter.UNIT_SCALE,
            far=far * LensStudioAdapter.UNIT_SCALE,
        )

    @staticmethod
    def from_canonical(cam: CanonicalCamera) -> dict:
        """Convert canonical camera state to Lens Studio format."""
        # Undo 180-degree Y flip
        flip_y = quat_from_axis_angle(np.array([0, 1, 0]), np.pi)
        rot = quat_multiply(cam.rotation, quat_conjugate(flip_y))
        rot = rot / np.linalg.norm(rot)

        # Right-handed -> left-handed: negate Z
        pos = cam.position / LensStudioAdapter.UNIT_SCALE
        ls_pos = [pos[0], pos[1], -pos[2]]
        ls_rot = [rot[0], rot[1], -rot[2], -rot[3]]

        return {
            "position": ls_pos,
            "rotation": ls_rot,
            "fov": np.degrees(cam.fov_y),
            "near": cam.near / LensStudioAdapter.UNIT_SCALE,
            "far": cam.far / LensStudioAdapter.UNIT_SCALE,
        }


class ManimGLAdapter:
    """
    ManimGL conventions:
      - Right-handed coordinate system (same as canonical)
      - Y-up, camera looks along -Z by default
      - Frame centered at origin
      - FOV: vertical, 45 degrees default
      - Units: "manim units" (frame is ~14.2 x 8.0)
      - Camera position: derived from frame center + focal distance along +Z
      - No quaternion directly; uses Euler angles (zxz) on CameraFrame

    Since ManimGL is right-handed Y-up like canonical, the main conversion
    is just unit scaling and FOV/frame-shape mapping.
    """

    # Default: 8 manim units = ~1 meter in canonical (configurable)
    UNIT_SCALE = 1.0 / 8.0  # manim units -> meters

    @staticmethod
    def to_canonical(frame_center: list, euler_angles: list,
                     fov_deg: float = 45.0, frame_shape: tuple = (8.0, 8.0),
                     focal_distance: float = None) -> CanonicalCamera:
        """Convert ManimGL CameraFrame state to canonical."""
        pos = np.array(frame_center, dtype=float)

        # Focal distance: camera is at frame_center + [0, 0, focal_dist]
        if focal_distance is None:
            fov_rad = np.radians(fov_deg)
            focal_distance = 0.5 * frame_shape[1] / np.tan(0.5 * fov_rad)

        # Camera world position (looking from +Z toward origin)
        cam_pos = pos + np.array([0, 0, focal_distance])
        cam_pos_canonical = cam_pos * ManimGLAdapter.UNIT_SCALE

        # Euler angles (zxz) -> quaternion
        # ManimGL uses scipy internally; we'll do a basic conversion
        theta, phi, gamma = euler_angles  # zxz convention
        # For default (no rotation): theta=0, phi=0, gamma=0 -> identity
        from scipy.spatial.transform import Rotation
        r = Rotation.from_euler('zxz', [theta, phi, gamma], degrees=False)
        quat = r.as_quat()  # scipy returns [x, y, z, w]

        return CanonicalCamera(
            position=cam_pos_canonical,
            rotation=quat,
            fov_y=np.radians(fov_deg),
            aspect=frame_shape[0] / frame_shape[1],
        )

    @staticmethod
    def from_canonical(cam: CanonicalCamera) -> dict:
        """Convert canonical camera to ManimGL frame parameters."""
        pos = cam.position / ManimGLAdapter.UNIT_SCALE

        fov_rad = cam.fov_y
        frame_height = 8.0  # default
        frame_width = frame_height * cam.aspect
        focal_dist = 0.5 * frame_height / np.tan(0.5 * fov_rad)

        # Frame center is camera pos minus focal distance along Z
        frame_center = pos - np.array([0, 0, focal_dist])

        # Quaternion -> Euler zxz
        from scipy.spatial.transform import Rotation
        r = Rotation.from_quat(cam.rotation)  # [x,y,z,w]
        euler = r.as_euler('zxz', degrees=False)

        return {
            "frame_center": frame_center.tolist(),
            "euler_angles": euler.tolist(),
            "fov": np.degrees(fov_rad),
            "frame_shape": (frame_width, frame_height),
            "focal_distance": focal_dist,
        }


class ThreeJSAdapter:
    """
    Three.js conventions:
      - Right-handed coordinate system
      - Y-up, camera looks along -Z by default (same as canonical)
      - FOV: vertical, in degrees (PerspectiveCamera)
      - Quaternion: [x, y, z, w] (Three.Quaternion)
      - Units: arbitrary (typically 1 unit = 1 meter)

    Three.js is essentially identical to canonical. Minimal conversion.
    """

    UNIT_SCALE = 1.0  # three.js units -> meters

    @staticmethod
    def to_canonical(position: list, quaternion: list,
                     fov_deg: float = 63.5, aspect: float = 1.0,
                     near: float = 0.1, far: float = 1000.0) -> CanonicalCamera:
        return CanonicalCamera(
            position=np.array(position) * ThreeJSAdapter.UNIT_SCALE,
            rotation=np.array(quaternion),
            fov_y=np.radians(fov_deg),
            aspect=aspect,
            near=near * ThreeJSAdapter.UNIT_SCALE,
            far=far * ThreeJSAdapter.UNIT_SCALE,
        )

    @staticmethod
    def from_canonical(cam: CanonicalCamera) -> dict:
        pos = cam.position / ThreeJSAdapter.UNIT_SCALE
        return {
            "position": pos.tolist(),
            "quaternion": cam.rotation.tolist(),
            "fov": np.degrees(cam.fov_y),
            "aspect": cam.aspect,
            "near": cam.near / ThreeJSAdapter.UNIT_SCALE,
            "far": cam.far / ThreeJSAdapter.UNIT_SCALE,
        }


# ---------------------------------------------------------------------------
# Texture / frame orientation transfer
# ---------------------------------------------------------------------------

@dataclass
class FrameConvention:
    """Describes how pixel data is laid out in a frame buffer."""
    origin: str = "top-left"     # "top-left" or "bottom-left"
    channel_order: str = "RGBA"  # "RGBA", "BGRA", "RGB", etc.
    premultiplied_alpha: bool = False


# Known engine frame conventions
FRAME_CONVENTIONS = {
    "opengl":       FrameConvention(origin="bottom-left", channel_order="RGBA"),
    "lens_studio":  FrameConvention(origin="bottom-left", channel_order="RGBA"),
    "manimgl_raw":  FrameConvention(origin="bottom-left", channel_order="RGBA"),  # get_raw_fbo_data
    "manimgl_arr":  FrameConvention(origin="top-left",    channel_order="RGBA"),  # get_pixel_array (flipped)
    "three_js":     FrameConvention(origin="bottom-left", channel_order="RGBA"),  # WebGL readPixels
    "canvas_2d":    FrameConvention(origin="top-left",    channel_order="RGBA"),  # getImageData
    "pil":          FrameConvention(origin="top-left",    channel_order="RGBA"),
    "unity":        FrameConvention(origin="bottom-left", channel_order="RGBA"),
    "blender":      FrameConvention(origin="bottom-left", channel_order="RGBA"),
}


def transfer_frame(pixels: np.ndarray, src: str, dst: str) -> np.ndarray:
    """
    Convert pixel array between engine conventions.

    pixels: numpy array (H, W, C) uint8
    src/dst: engine name from FRAME_CONVENTIONS
    """
    src_conv = FRAME_CONVENTIONS[src]
    dst_conv = FRAME_CONVENTIONS[dst]

    result = pixels.copy()

    # Flip vertically if origin conventions differ
    if src_conv.origin != dst_conv.origin:
        result = result[::-1]

    # Channel reorder (if needed in future)
    # For now all supported engines use RGBA

    return result


# ---------------------------------------------------------------------------
# Example: Lens Studio ExplanatoryPanel pipeline
# ---------------------------------------------------------------------------

def example_pipeline():
    """
    Demonstrates the full transfer chain:
    ManimGL -> canonical -> Lens Studio (for camera alignment)
    ManimGL frame -> PIL convention -> binary protocol -> ExplanatoryPanel

    ExplanatoryPanel receives:
      - Binary frame: top-down RGBA (PIL/canvas convention)
      - Panel flips to bottom-left for LS ProceduralTexture
      - Result: correct on-screen rendering

    For 2D content (equations), camera sync is not needed.
    For 3D overlay content, use the camera transfer:
    """
    # Simulated: LS sends camera state over ws-relay
    ls_camera = {
        "position": [0, 0, 0],       # cm, at origin
        "rotation": [0, 0, 0, 1],    # identity quaternion
        "fov": 63.5,                  # Spectacles FOV
    }

    # Convert to canonical
    canonical = LensStudioAdapter.to_canonical(
        position=ls_camera["position"],
        rotation=ls_camera["rotation"],
        fov_deg=ls_camera["fov"],
    )

    # Convert to ManimGL frame parameters
    manim_params = ManimGLAdapter.from_canonical(canonical)
    print(f"ManimGL frame center: {manim_params['frame_center']}")
    print(f"ManimGL FOV: {manim_params['fov']:.1f} degrees")
    print(f"ManimGL focal distance: {manim_params['focal_distance']:.2f}")

    # Frame transfer: ManimGL renders (get_pixel_array = top-down)
    # We send top-down to ExplanatoryPanel, which flips for LS textures.
    fake_frame = np.zeros((512, 512, 4), dtype=np.uint8)

    # ManimGL get_pixel_array -> top-down (same as PIL)
    # ExplanatoryPanel expects top-down input (it flips internally)
    # So: manimgl_arr -> pil convention -> send as-is
    frame_for_relay = transfer_frame(fake_frame, "manimgl_arr", "pil")
    print(f"Frame ready for relay: {frame_for_relay.shape}")

    # If using raw FBO data (bottom-up), would need to flip:
    raw_frame = transfer_frame(fake_frame, "manimgl_raw", "pil")
    print(f"Raw FBO -> PIL: flipped={not np.array_equal(fake_frame, raw_frame)}")


if __name__ == "__main__":
    example_pipeline()
