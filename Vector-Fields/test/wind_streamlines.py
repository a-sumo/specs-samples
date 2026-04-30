#!/usr/bin/env python3
"""Compute 2D potential flow streamlines around a Joukowski airfoil and export
them as JSON for the Lens Studio WindStreamlines component to render.

Math:
  - Cylinder of radius R offset by mu in zeta-plane.
  - Joukowski transform z = zeta + 1/zeta maps the circle to an airfoil.
  - Complex potential around the cylinder: w(zeta) = U·exp(-iα)·zeta_rel
                                            + U·exp(iα)·R^2/zeta_rel
                                            + iΓ/(2π)·log(zeta_rel)
  - Kutta condition fixes Γ so the rear stagnation point lies at the trailing edge.
  - Velocity in the physical plane: dw/dz = (dw/dzeta) / (dz/dzeta).

Streamlines are integrated with RK4 from a column of upstream seeds and stacked
on a few z-layers so the wing demo has volumetric flow rather than a flat plane.
"""

import json
import math
import cmath
from pathlib import Path

R = 1.05                      # cylinder radius in zeta-plane
mu = complex(-0.08, 0.08)     # cylinder center offset (camber + thickness)
alpha = math.radians(8.0)     # angle of attack
U = 1.0                       # freestream speed

beta = math.asin(mu.imag / R)
Gamma = 4 * math.pi * U * R * math.sin(alpha + beta)


def w_prime_zeta(zeta: complex) -> complex:
    z_rel = zeta - mu
    return (U * cmath.exp(-1j * alpha)
            - U * cmath.exp(1j * alpha) * R * R / (z_rel * z_rel)
            - 1j * Gamma / (2 * math.pi * z_rel))


def pick_zeta(z: complex) -> complex:
    """Two roots of zeta^2 - z*zeta + 1 = 0; pick the one outside the cylinder."""
    disc = cmath.sqrt(z * z - 4)
    z1 = (z + disc) / 2
    z2 = (z - disc) / 2
    return z1 if abs(z1 - mu) > abs(z2 - mu) else z2


def velocity_z(z: complex) -> complex:
    zeta = pick_zeta(z)
    dz_dzeta = 1 - 1 / (zeta * zeta)
    if abs(dz_dzeta) < 1e-6:
        return complex(0, 0)
    return w_prime_zeta(zeta) / dz_dzeta


def velocity_xy(x: float, y: float):
    try:
        u = velocity_z(complex(x, y))
        return u.real, -u.imag
    except ZeroDivisionError:
        return 0.0, 0.0


def integrate_streamline(x0, y0, ds=0.04, max_steps=80, bounds=(-2.0, 4.0, -2.0, 2.0)):
    pts = [(x0, y0)]
    x, y = x0, y0

    def step_dir(xx, yy):
        u, v = velocity_xy(xx, yy)
        s = math.hypot(u, v)
        return (u / s, v / s) if s > 1e-6 else (0.0, 0.0)

    for _ in range(max_steps):
        k1 = step_dir(x, y)
        if k1 == (0.0, 0.0):
            break
        k2 = step_dir(x + 0.5 * ds * k1[0], y + 0.5 * ds * k1[1])
        k3 = step_dir(x + 0.5 * ds * k2[0], y + 0.5 * ds * k2[1])
        k4 = step_dir(x + ds * k3[0], y + ds * k3[1])
        dx = ds * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6
        dy = ds * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6
        x += dx
        y += dy
        if not (bounds[0] < x < bounds[1] and bounds[2] < y < bounds[3]):
            break
        pts.append((x, y))
    return pts


def airfoil_polygon(n=64):
    pts = []
    for i in range(n):
        theta = 2 * math.pi * i / n
        zeta = mu + R * complex(math.cos(theta), math.sin(theta))
        z = zeta + 1 / zeta
        pts.append([z.real, z.imag])
    return pts


def main():
    seeds_y = [-1.6 + i * 0.16 for i in range(21)]
    seeds_x = -1.6
    z_layers = [-0.4, 0.0, 0.4]

    streamlines = []
    for z_layer in z_layers:
        for y0 in seeds_y:
            pts2d = integrate_streamline(seeds_x, y0, ds=0.04, max_steps=80)
            if len(pts2d) < 6:
                continue
            streamlines.append([[p[0], p[1], z_layer] for p in pts2d])

    out = {
        "airfoil": airfoil_polygon(),
        "streamlines": streamlines,
        "params": {
            "R": R,
            "mu": [mu.real, mu.imag],
            "alpha_deg": math.degrees(alpha),
            "U": U,
            "Gamma": Gamma,
        },
    }
    out_path = Path(__file__).resolve().parent.parent / "Assets" / "Slides" / "wing_streamlines.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, separators=(",", ":")))

    total_pts = sum(len(s) for s in streamlines)
    print(f"Wrote {len(streamlines)} streamlines, {total_pts} total points")
    print(f"Airfoil polygon: {len(out['airfoil'])} points")
    print(f"Output: {out_path}")


if __name__ == "__main__":
    main()
