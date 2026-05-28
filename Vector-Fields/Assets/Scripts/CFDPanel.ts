// Lattice-Boltzmann D2Q9 CFD around a Joukowski airfoil, rendered to a
// procedural texture and bound to a target material's baseTex.
// Ported from Vector-Fields/cfd_aoa_sweep.html (preview renderer only — no
// charts, no sweep, no force averaging).

const D2Q9_W  = [4/9, 1/9, 1/9, 1/9, 1/9, 1/36, 1/36, 1/36, 1/36];
const D2Q9_EX = [0, 1, 0,-1, 0, 1,-1,-1, 1];
const D2Q9_EY = [0, 0, 1, 0,-1, 1, 1,-1,-1];
const D2Q9_OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];

@component
export class CFDPanel extends BaseScriptComponent {
  @input
  @hint("Material whose baseTex will receive the flow field. Assign the panel/quad material here. If the material is shared, duplicate the .mat asset first so other meshes are not affected.")
  targetMaterial: Material;

  @input
  @widget(new ComboBoxWidget([
    new ComboBoxItem("40 x 20",  "40"),
    new ComboBoxItem("60 x 30",  "60"),
    new ComboBoxItem("80 x 40",  "80"),
    new ComboBoxItem("120 x 60", "120"),
  ]))
  gridChoice: string = "60";

  @input("float", "10")
  @widget(new SliderWidget(-10, 25, 1))
  @hint("Angle of attack in degrees")
  aoaDeg: number = 10;

  @input("float", "0.10")
  @widget(new SliderWidget(0.02, 0.20, 0.005))
  @hint("Inlet speed in lattice units")
  inletSpeed: number = 0.10;

  @input("float", "0.02")
  @widget(new SliderWidget(0.005, 0.05, 0.001))
  viscosity: number = 0.02;

  @input("float", "0.12")
  @widget(new SliderWidget(0.02, 0.25, 0.01))
  thickness: number = 0.12;

  @input("float", "0.08")
  @widget(new SliderWidget(-0.15, 0.20, 0.01))
  camber: number = 0.08;

  @input("int", "20")
  @widget(new SliderWidget(1, 60, 1))
  @hint("LBM steps per Update tick. Higher = faster sim, more CPU per frame.")
  stepsPerFrame: number = 20;

  @input("float", "0.18")
  @hint("Speed magnitude that maps to the top of the inferno colormap.")
  speedScale: number = 0.18;

  // Solver state
  private W: number = 0;
  private H: number = 0;
  private N: number = 0;
  private f0!: Float32Array;
  private f1!: Float32Array;
  private rho!: Float32Array;
  private ux!: Float32Array;
  private uy!: Float32Array;
  private barrier!: Uint8Array;

  // Pixel buffer + texture
  private pixels!: Uint8Array;
  private texture!: Texture;

  // Param tracking — rebuild airfoil if any of these change
  private lastAoa: number = NaN;
  private lastThickness: number = NaN;
  private lastCamber: number = NaN;
  private lastGrid: string = "";

  onAwake(): void {
    this.allocate();
    this.rebuildAirfoilIfNeeded();
    this.initLattice();
    this.createTexture();

    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private allocate(): void {
    const dims = this.parseGrid();
    this.W = dims[0];
    this.H = dims[1];
    this.N = this.W * this.H;
    this.f0 = new Float32Array(this.N * 9);
    this.f1 = new Float32Array(this.N * 9);
    this.rho = new Float32Array(this.N);
    this.ux = new Float32Array(this.N);
    this.uy = new Float32Array(this.N);
    this.barrier = new Uint8Array(this.N);
    this.pixels = new Uint8Array(this.N * 4);
    this.lastGrid = this.gridChoice;
  }

  private parseGrid(): [number, number] {
    const w = parseInt(this.gridChoice);
    const W = isFinite(w) && w > 0 ? w : 60;
    return [W, Math.max(2, Math.floor(W / 2))];
  }

  private createTexture(): void {
    this.texture = ProceduralTextureProvider.create(this.W, this.H, Colorspace.RGBA);
    this.targetMaterial.mainPass.baseTex = this.texture;
    this.writePixels();
  }

  private onUpdate(): void {
    if (this.gridChoice !== this.lastGrid) {
      this.allocate();
      this.rebuildAirfoilIfNeeded();
      this.initLattice();
      this.texture = ProceduralTextureProvider.create(this.W, this.H, Colorspace.RGBA);
      this.targetMaterial.mainPass.baseTex = this.texture;
    } else if (this.rebuildAirfoilIfNeeded()) {
      this.initLattice();
    }

    const smag = 0.12;
    for (let i = 0; i < this.stepsPerFrame; i++) {
      this.step(this.inletSpeed, this.viscosity, smag);
    }
    this.writePixels();
  }

  // ----- Airfoil + lattice init -----

  private rebuildAirfoilIfNeeded(): boolean {
    if (this.aoaDeg === this.lastAoa &&
        this.thickness === this.lastThickness &&
        this.camber === this.lastCamber) return false;
    this.buildAirfoil(this.aoaDeg, this.thickness, this.camber);
    this.lastAoa = this.aoaDeg;
    this.lastThickness = this.thickness;
    this.lastCamber = this.camber;
    return true;
  }

  private buildAirfoil(aoaDeg: number, thickness: number, camber: number): void {
    const W = this.W, H = this.H;
    const b = this.barrier;
    b.fill(0);
    // Top + bottom walls
    for (let x = 0; x < W; x++) { b[x] = 1; b[x + (H - 1) * W] = 1; }

    // Joukowski airfoil polygon (same math as the HTML version)
    const angRad = -aoaDeg * Math.PI / 180;
    const cx = -thickness, cy = camber;
    const r = Math.sqrt((1 - cx) * (1 - cx) + cy * cy);
    const centerX = W * 0.25, centerY = H * 0.5;
    const scale = H * 0.15;

    const steps = 200;
    const polyX = new Float32Array(steps + 1);
    const polyY = new Float32Array(steps + 1);
    let minX = W, maxX = 0, minY = H, maxY = 0;
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * 2 * Math.PI;
      const zx = cx + r * Math.cos(theta), zy = cy + r * Math.sin(theta);
      let den = zx * zx + zy * zy; if (den < 1e-4) den = 1e-4;
      const wx = zx * (1 + 1 / den), wy = zy * (1 - 1 / den);
      const rx = wx * Math.cos(angRad) - wy * Math.sin(angRad);
      const ry = wx * Math.sin(angRad) + wy * Math.cos(angRad);
      const px = centerX + rx * scale, py = centerY - ry * scale;
      polyX[i] = px; polyY[i] = py;
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    }

    const x0 = Math.max(0, Math.floor(minX));
    const x1 = Math.min(W - 1, Math.ceil(maxX));
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(H - 1, Math.ceil(maxY));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (this.pip(x, y, polyX, polyY, steps + 1)) {
          b[y * W + x] = 1;
        }
      }
    }
  }

  private pip(px: number, py: number, polyX: Float32Array, polyY: Float32Array, n: number): boolean {
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polyX[i], yi = polyY[i], xj = polyX[j], yj = polyY[j];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  private feq(r: number, u: number, v: number, k: number): number {
    const cu = 3 * (D2Q9_EX[k] * u + D2Q9_EY[k] * v);
    return r * D2Q9_W[k] * (1 + cu + 0.5 * cu * cu - 1.5 * (u * u + v * v));
  }

  private initLattice(): void {
    const uIn = this.inletSpeed;
    for (let i = 0; i < this.N; i++) {
      const solid = this.barrier[i] !== 0;
      this.rho[i] = 1;
      this.ux[i] = solid ? 0 : uIn;
      this.uy[i] = 0;
      const u = solid ? 0 : uIn;
      const off = i * 9;
      for (let k = 0; k < 9; k++) {
        const v = this.feq(1, u, 0, k);
        this.f0[off + k] = v;
        this.f1[off + k] = v;
      }
    }
  }

  // ----- LBM step (collide + stream + outlet copy) -----

  private step(uIn: number, visc: number, smag: number): void {
    const W = this.W, H = this.H;
    const tau0 = 3 * visc + 0.5;
    const f0 = this.f0;
    const barrier = this.barrier;

    // Collision (with Smagorinsky LES)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = x + y * W;
        if (barrier[i]) continue;
        const off = i * 9;
        let r = 0, u = 0, v = 0;
        for (let k = 0; k < 9; k++) r += f0[off + k];
        if (x === 0) {
          u = uIn; v = 0; r = 1;
        } else {
          for (let k = 0; k < 9; k++) {
            u += f0[off + k] * D2Q9_EX[k];
            v += f0[off + k] * D2Q9_EY[k];
          }
          u /= r; v /= r;
        }
        this.rho[i] = r; this.ux[i] = u; this.uy[i] = v;

        let Qxx = 0, Qxy = 0, Qyy = 0;
        for (let k = 0; k < 9; k++) {
          const fn = f0[off + k] - this.feq(r, u, v, k);
          Qxx += D2Q9_EX[k] * D2Q9_EX[k] * fn;
          Qxy += D2Q9_EX[k] * D2Q9_EY[k] * fn;
          Qyy += D2Q9_EY[k] * D2Q9_EY[k] * fn;
        }
        const Pi = Math.sqrt(Qxx * Qxx + 2 * Qxy * Qxy + Qyy * Qyy);
        const ta = 0.5 * (Math.sqrt(tau0 * tau0 + 18 * smag * smag * Pi / r) - tau0);
        const omega = 1 / (tau0 + ta);

        for (let k = 0; k < 9; k++) {
          f0[off + k] += omega * (this.feq(r, u, v, k) - f0[off + k]);
        }
      }
    }

    // Stream into f1, with bounce-back at solids
    const f1 = this.f1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = x + y * W;
        if (barrier[i]) continue;
        for (let k = 0; k < 9; k++) {
          const nx = x + D2Q9_EX[k], ny = y + D2Q9_EY[k];
          if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
            const ni = nx + ny * W;
            if (barrier[ni]) f1[i * 9 + D2Q9_OPP[k]] = f0[i * 9 + k];
            else f1[ni * 9 + k] = f0[i * 9 + k];
          }
        }
      }
    }

    // Outlet copy (right edge)
    for (let y = 1; y < H - 1; y++) {
      const e = (W - 1) + y * W, p = (W - 2) + y * W;
      for (let k = 0; k < 9; k++) f1[e * 9 + k] = f1[p * 9 + k];
    }

    this.f0 = f1;
    this.f1 = f0;
  }

  // ----- Pixel write (inferno colormap on velocity magnitude) -----

  private writePixels(): void {
    const N = this.N;
    const inv = 1 / Math.max(1e-6, this.speedScale);
    const px = this.pixels;
    for (let i = 0; i < N; i++) {
      const pi = i * 4;
      if (this.barrier[i]) {
        px[pi] = 80; px[pi + 1] = 85; px[pi + 2] = 95; px[pi + 3] = 255;
        continue;
      }
      const u = this.ux[i], v = this.uy[i];
      let t = Math.sqrt(u * u + v * v) * inv;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      let r: number, g: number, b: number;
      if (t < 0.12)      { const s = t / 0.12;          r = s * 30;          g = s * 5;            b = s * 50; }
      else if (t < 0.35) { const s = (t - 0.12) / 0.23; r = 30 + s * 130;    g = 5 + s * 10;       b = 50 + s * 40; }
      else if (t < 0.6)  { const s = (t - 0.35) / 0.25; r = 160 + s * 75;    g = 15 + s * 65;      b = 90 - s * 55; }
      else if (t < 0.82) { const s = (t - 0.6) / 0.22;  r = 235 + s * 18;    g = 80 + s * 100;     b = 35 - s * 20; }
      else               { const s = (t - 0.82) / 0.18; r = 253 + s * 2;     g = 180 + s * 70;     b = 15 + s * 100; }
      px[pi] = r | 0; px[pi + 1] = g | 0; px[pi + 2] = b | 0; px[pi + 3] = 255;
    }
    (this.texture.control as ProceduralTextureProvider).setPixels(0, 0, this.W, this.H, px);
  }
}
