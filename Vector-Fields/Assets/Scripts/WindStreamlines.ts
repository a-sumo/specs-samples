import { loadGfsArrays, GFS_META } from "./GfsData";

enum WindTubeMode {
  Trails = 0,
  Points = 1,
  Arrows = 2
}

// Wind streamlines on a calibrated globe — static-template version.
//
// Architecture (after iteration):
//   1. At init, scatter N seeds across the sphere with Fibonacci sampling,
//      then integrate the wind field at each seed for M steps. This gives N
//      pre-baked streamline paths — the *templates*. They don't move.
//   2. Build a ribbon mesh ONCE: 2 vertices per ring × M rings × N templates,
//      plus rounded cap fans at both tips. Positions, surface-normal-aligned
//      widths, per-vertex speed colour ratio, per-vertex flow speed, and a
//      signed cross-section coordinate are baked into UV channels.
//   3. Per frame, the shader receives Time and animates only opacity. Hue is
//      derived from the local speed at each vertex, so opacity scrolling cannot
//      create false colour gradients along a trail.
//
// All the heavy work happens once. Per-frame cost is just pushing the
// Time/PhaseSpeed/Displace uniforms; hue and opacity stay in the shader.

@component
export class WindStreamlines extends BaseScriptComponent {
  @input
  @hint("Globe Calibration SceneObject (its WindGlobeCalibration script is read).")
  calibrationObject!: SceneObject;

  @input
  material!: Material;

  @input
  @hint("Number of streamline templates uniformly scattered across the sphere.")
  templateCount: number = 700;

  @input
  @hint("Samples per template path. More = longer-looking streamlines.")
  segmentsPerDash: number = 18;

  @input
  @hint("Ribbon half-width as fraction of sphere radius.")
  ribbonWidthRel: number = 0.010;

  @input
  @widget(new ComboBoxWidget([
    new ComboBoxItem("Trails", 0),
    new ComboBoxItem("Points", 1),
    new ComboBoxItem("Arrows", 2)
  ]))
  @hint("Trails: flowing paths, Points: sampled wind tracers, Arrows: sampled wind direction.")
  private _tubeMode: number = 0;

  @input
  @hint("Point radius as fraction of sphere radius.")
  pointRadiusRel: number = 0.013;

  @input
  @hint("Arrow length as fraction of sphere radius.")
  arrowLengthRel: number = 0.055;

  @input
  @hint("Arrow width as fraction of sphere radius.")
  arrowWidthRel: number = 0.016;

  @input
  @hint("Simulated seconds advanced between path samples during init integration.")
  integrationStepSeconds: number = 2500;

  @input
  @hint("Phase cycles per second along each dash. Higher = faster flow.")
  phaseSpeed: number = 0.45;

  @input
  @hint("Vertex displacement amplitude along surface normal — set > 0 to test vertex-shader deformation.")
  displace: number = 0.0;

  @input
  @hint("Reference speed (m/s) that maps to peak warm colour.")
  speedScale: number = 30;

  // ----- internals -----

  private readonly D2R = Math.PI / 180;
  private cal: any = null;
  private meshVisual: RenderMeshVisual | null = null;
  private builder: MeshBuilder | null = null;
  private static readonly MAX_VERTEX_COUNT: number = 62000;
  private static readonly CAP_SEGMENTS: number = 8;
  private meshReady: boolean = false;

  // Cached at init.
  // Vertex layout (9 floats):
  //   position (3) | texture0 (2: pathT, templatePhase) | texture1 (2: speedColor, speedRatioRaw)
  //   texture2 (2: crossSection, capRadial/shapeTag)
  //
  // - pathT       ∈ [0, 1]   distance along the dash, 0=tail, 1=head
  // - templatePhase ∈ [0, 1] random per-template offset
  // - speedColor  ∈ [0, 1]   wind speed at this sample / speedScale
  // - speedRatioRaw >= 0     unclamped wind speed / speedScale, retained for diagnostics/future modes
  // - crossSection ∈ [-1, 1]  left/right ribbon coordinate, or point billboard X
  // - capRadial    body=-1, caps=0..1, points=1.05..1.95 with billboard Y, arrows=2
  //
  // The WindStreamFlow Code Node consumes these to shade trails, points, and
  // arrows without changing hue as opacity scrolls.
  private vertexData!: Float32Array;
  private vertexCount: number = 0;

  // Per-template metadata.
  private dashPhases!: Float32Array;        // length = N
  private dashFirstVertex!: Int32Array;     // length = N
  private dashRingCount!: Int32Array;       // length = N

  private readonly STRIDE = 9;

  onAwake() {
    this.createScriptApi();
    this.createEvent("OnStartEvent").bind(() => this.init());
    this.createEvent("UpdateEvent").bind(() => this.tick());
  }

  private createScriptApi(): void {
    const self = this;
    const api = {
      setTubeMode: (mode: number) => self.setTubeMode(mode),
      refresh: () => self.refresh(),
      get tubeMode(): number { return self.tubeMode; },
      set tubeMode(value: number) { self.tubeMode = value; },
      get flowSpeed(): number { return self.phaseSpeed; },
      set flowSpeed(value: number) { self.phaseSpeed = Math.max(0, value); },
    };
    (this as any).fieldApi = api;
    (this as any).windApi = api;
  }

  // ----- field model: NCEP GFS 10 m wind, baked at project build time -----
  // We resolve the closest forecast hour to the system clock so the static
  // mesh integrates today's baked NOAA GFS wind.
  private gfsU: Float32Array | null = null;
  private gfsV: Float32Array | null = null;
  private gfsTimeIdx: number = 0;

  private initGfsField(): boolean {
    try {
      const { u, v } = loadGfsArrays();
      this.gfsU = u; this.gfsV = v;
      const meta = GFS_META as any;
      const ref = Date.parse(meta.refTime);
      const now = Date.now();
      const stepMs = meta.stepHours * 3600 * 1000;
      const idxF = (now - ref) / stepMs;
      this.gfsTimeIdx = Math.max(0, Math.min(meta.nt - 1, Math.round(idxF)));
      this.gfsMeta = meta;
      print(`[WindStreamlines] GFS loaded: ${meta.nx}x${meta.ny}x${meta.nt}, using t=${meta.times[this.gfsTimeIdx]}`);
      return true;
    } catch (e) {
      print("[WindStreamlines] ERROR: GFS data unavailable. Wind streamlines require real baked data: " + e);
      return false;
    }
  }

  private gfsMeta: any = null;

  private sampleField(lonDeg: number, latDeg: number): { u: number; v: number } {
    if (!this.gfsU || !this.gfsV || !this.gfsMeta) {
      return { u: 0, v: 0 };
    }
    return this.sampleGfs(lonDeg, latDeg);
  }

  private sampleGfs(lonDeg: number, latDeg: number): { u: number; v: number } {
    const m = this.gfsMeta;
    let lo = lonDeg;
    while (lo < m.lonMin) lo += 360;
    while (lo > m.lonMax) lo -= 360;
    if (latDeg > m.latMax || latDeg < m.latMin) return { u: 0, v: 0 };
    const x = (lo - m.lonMin) / m.lonRes;
    const y = (m.latMax - latDeg) / m.latRes;
    const x0 = Math.floor(x), x1 = Math.min(m.nx - 1, x0 + 1);
    const y0 = Math.max(0, Math.min(m.ny - 1, Math.floor(y)));
    const y1 = Math.max(0, Math.min(m.ny - 1, y0 + 1));
    const fx = x - x0, fy = y - y0;
    const base = this.gfsTimeIdx * m.nx * m.ny;
    const i00 = base + y0 * m.nx + x0;
    const i01 = base + y0 * m.nx + x1;
    const i10 = base + y1 * m.nx + x0;
    const i11 = base + y1 * m.nx + x1;
    const u = (1-fx)*(1-fy)*this.gfsU![i00] + fx*(1-fy)*this.gfsU![i01]
            + (1-fx)*fy*this.gfsU![i10]     + fx*fy*this.gfsU![i11];
    const v = (1-fx)*(1-fy)*this.gfsV![i00] + fx*(1-fy)*this.gfsV![i01]
            + (1-fx)*fy*this.gfsV![i10]     + fx*fy*this.gfsV![i11];
    return { u, v };
  }

  // ----- init -----

  private init() {
    if (!this.calibrationObject) {
      print("[WindStreamlines] missing calibrationObject");
      return;
    }
    const comps = this.calibrationObject.getComponents("Component.ScriptComponent") as ScriptComponent[];
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i] as any;
      if (typeof c.latLonToWorld === "function") { this.cal = c; break; }
    }
    if (!this.cal) {
      print("[WindStreamlines] No WindGlobeCalibration found.");
      return;
    }

    this.meshVisual = this.sceneObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (!this.meshVisual) {
      this.meshVisual = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    }
    if (this.material) this.meshVisual.mainMaterial = this.material;

    if (!this.initGfsField()) {
      return;
    }
    this.buildStaticMesh();
  }

  // Build one static mesh for the active wind view mode.
  private buildStaticMesh() {
    const mode = this.clampTubeMode(this._tubeMode);
    this.meshReady = false;
    const requestedN = Math.max(1, Math.floor(this.templateCount));
    const M = Math.min(64, Math.max(2, Math.floor(this.segmentsPerDash)));
    const radius = this.cal.radiusWorld as number;
    const radiusBoost = 1.004;
    const halfWidthBase = Math.max(0.001, radius * this.ribbonWidthRel);
    const pointRadiusBase = Math.max(0.001, radius * this.pointRadiusRel);
    const arrowLengthBase = Math.max(0.001, radius * this.arrowLengthRel);
    const arrowWidthBase = Math.max(0.001, radius * this.arrowWidthRel);
    const maxJumpSq = (radius * 0.4) * (radius * 0.4);
    const capSegments = WindStreamlines.CAP_SEGMENTS;
    const pointVertsPerGlyph = capSegments + 2;
    const arrowVertsPerGlyph = 7;
    const trailVertsPerTemplate = M * 2 + pointVertsPerGlyph * 2;
    const templateLimit = mode === WindTubeMode.Trails
      ? Math.min(requestedN, Math.max(1, Math.floor(WindStreamlines.MAX_VERTEX_COUNT / trailVertsPerTemplate)))
      : requestedN;
    const N = templateLimit;
    const totalSamples = requestedN * M;
    const pointSampleStride = Math.max(1, Math.ceil((totalSamples * pointVertsPerGlyph) / WindStreamlines.MAX_VERTEX_COUNT));
    const arrowSampleStride = Math.max(1, Math.ceil((totalSamples * arrowVertsPerGlyph) / WindStreamlines.MAX_VERTEX_COUNT));
    const maxVerts = mode === WindTubeMode.Trails
      ? Math.max(trailVertsPerTemplate, N * trailVertsPerTemplate)
      : WindStreamlines.MAX_VERTEX_COUNT;

    const inv = this.sceneObject.getTransform().getInvertedWorldTransform();
    const earthCenter = (this.calibrationObject.getTransform() as Transform).getWorldPosition();
    const earthCenterLocal = inv.multiplyPoint(earthCenter);

    this.dashPhases = new Float32Array(N);
    this.dashFirstVertex = new Int32Array(N);
    this.dashRingCount = new Int32Array(N);

    const vData = new Float32Array(maxVerts * this.STRIDE);
    const indices: number[] = [];

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    let vertCursor = 0;
    let sampleCursor = 0;

    // Per-template centerline scratch (local positions + speeds for one dash).
    const pathX = new Float32Array(M);
    const pathY = new Float32Array(M);
    const pathZ = new Float32Array(M);
    const pathSpeed = new Float32Array(M);
    const pathSpeedRatio = new Float32Array(M);
    const emitVertex = (
      x: number, y: number, z: number,
      pathT: number, tphase: number,
      speedColor: number, speedRatioRaw: number,
      crossSection: number, capRadial: number
    ): number => {
      const idx = vertCursor;
      const off = idx * this.STRIDE;
      vData[off] = x;
      vData[off + 1] = y;
      vData[off + 2] = z;
      vData[off + 3] = pathT;
      vData[off + 4] = tphase;
      vData[off + 5] = speedColor;
      vData[off + 6] = speedRatioRaw;
      vData[off + 7] = crossSection;
      vData[off + 8] = capRadial;
      vertCursor++;
      return idx;
    };
    const hasRoom = (count: number): boolean => vertCursor + count <= maxVerts;

    for (let i = 0; i < N; i++) {
      // Fibonacci sphere seed → (lat, lon).
      const y = 1 - (2 * i + 1) / N;
      const ringR = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * goldenAngle;
      let lat = Math.asin(y) * (180 / Math.PI);
      let lon = (Math.atan2(Math.sin(theta) * ringR, Math.cos(theta) * ringR)) * (180 / Math.PI);

      this.dashPhases[i] = Math.random();
      const tphase = this.dashPhases[i];

      // Integrate the field for M samples.
      let rings = 0;
      for (let k = 0; k < M; k++) {
        const world = this.cal.latLonToWorld(lat, lon) as vec3;
        const off = world.sub(earthCenter);
        const lifted = earthCenter.add(off.uniformScale(radiusBoost));
        const local = inv.multiplyPoint(lifted);
        pathX[k] = local.x; pathY[k] = local.y; pathZ[k] = local.z;

        const f = this.sampleField(lon, lat);
        const speed = Math.hypot(f.u, f.v);
        const speedRatio = speed / Math.max(0.01, this.speedScale);
        pathSpeed[k] = Math.min(1, speedRatio);
        pathSpeedRatio[k] = Math.max(0, speedRatio);

        rings++;
        const cphi = Math.max(0.08, Math.cos(lat * this.D2R));
        const dlon = (f.u / (111000 * cphi)) * this.integrationStepSeconds;
        const dlat = (f.v / 111000) * this.integrationStepSeconds;
        lon += dlon;
        if (lon > 180) lon -= 360; else if (lon < -180) lon += 360;
        lat += dlat;
        if (lat > 89.5 || lat < -89.5) break;
      }

      this.dashFirstVertex[i] = vertCursor;
      this.dashRingCount[i] = rings;

      if (rings < 1) continue;

      const getFrame = (k: number): number[] => {
        let tx: number, ty: number, tz: number;
        if (rings < 2) {
          tx = 1; ty = 0; tz = 0;
        } else if (k === 0) {
          tx = pathX[1] - pathX[0]; ty = pathY[1] - pathY[0]; tz = pathZ[1] - pathZ[0];
        } else if (k === rings - 1) {
          tx = pathX[k] - pathX[k-1]; ty = pathY[k] - pathY[k-1]; tz = pathZ[k] - pathZ[k-1];
        } else {
          tx = pathX[k+1] - pathX[k-1]; ty = pathY[k+1] - pathY[k-1]; tz = pathZ[k+1] - pathZ[k-1];
        }
        const tl = Math.sqrt(tx*tx + ty*ty + tz*tz);
        if (tl > 1e-6) { tx /= tl; ty /= tl; tz /= tl; } else { tx = 1; ty = 0; tz = 0; }

        let nx = pathX[k] - earthCenterLocal.x;
        let ny = pathY[k] - earthCenterLocal.y;
        let nz = pathZ[k] - earthCenterLocal.z;
        const nl = Math.sqrt(nx*nx + ny*ny + nz*nz);
        if (nl > 1e-6) { nx /= nl; ny /= nl; nz /= nl; } else { nx = 0; ny = 1; nz = 0; }

        const tangentDotNormal = tx*nx + ty*ny + tz*nz;
        tx -= nx * tangentDotNormal;
        ty -= ny * tangentDotNormal;
        tz -= nz * tangentDotNormal;
        let tl2 = Math.sqrt(tx*tx + ty*ty + tz*tz);
        if (tl2 <= 1e-6) {
          const rx = Math.abs(ny) < 0.92 ? 0 : 1;
          const ry = Math.abs(ny) < 0.92 ? 1 : 0;
          const rz = 0;
          tx = ry*nz - rz*ny;
          ty = rz*nx - rx*nz;
          tz = rx*ny - ry*nx;
          tl2 = Math.sqrt(tx*tx + ty*ty + tz*tz);
        }
        if (tl2 > 1e-6) { tx /= tl2; ty /= tl2; tz /= tl2; } else { tx = 1; ty = 0; tz = 0; }

        let wx = ny*tz - nz*ty;
        let wy = nz*tx - nx*tz;
        let wz = nx*ty - ny*tx;
        const wl = Math.sqrt(wx*wx + wy*wy + wz*wz);
        if (wl > 1e-6) { wx /= wl; wy /= wl; wz /= wl; } else { wx = 0; wy = 1; wz = 0; }

        return [tx, ty, tz, wx, wy, wz];
      };

      const emitRoundCap = (k: number, sign: number) => {
        const frame = getFrame(k);
        const tx = frame[0], ty = frame[1], tz = frame[2];
        const wx = frame[3], wy = frame[4], wz = frame[5];
        const pathT = k / (rings - 1);
        const speedN = pathSpeed[k];
        const speedRatioN = pathSpeedRatio[k];
        const center = emitVertex(pathX[k], pathY[k], pathZ[k], pathT, tphase, speedN, speedRatioN, 0, 0);
        let prev = -1;
        for (let s = 0; s <= capSegments; s++) {
          const a = (s / capSegments) * Math.PI;
          const ca = Math.cos(a);
          const sa = Math.sin(a) * sign;
          const x = pathX[k] + (wx * ca + tx * sa) * halfWidthBase;
          const y = pathY[k] + (wy * ca + ty * sa) * halfWidthBase;
          const z = pathZ[k] + (wz * ca + tz * sa) * halfWidthBase;
          const arc = emitVertex(x, y, z, pathT, tphase, speedN, speedRatioN, ca, 1);
          if (prev >= 0) {
            indices.push(center, prev, arc);
          }
          prev = arc;
        }
      };

      const emitPointFan = (k: number) => {
        if (!hasRoom(pointVertsPerGlyph)) return;
        const pathT = rings > 1 ? k / (rings - 1) : 0.5;
        const speedN = pathSpeed[k];
        const radiusScale = pointRadiusBase * (0.86 + speedN * 0.34);
        const center = emitVertex(pathX[k], pathY[k], pathZ[k], pathT, tphase, speedN, radiusScale, 0, 1.50);
        let prev = -1;
        for (let s = 0; s <= capSegments; s++) {
          const a = (s / capSegments) * Math.PI * 2.0;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const fanY = 1.05 + (sa + 1.0) * 0.45;
          const arc = emitVertex(pathX[k], pathY[k], pathZ[k], pathT, tphase, speedN, radiusScale, ca, fanY);
          if (prev >= 0) {
            indices.push(center, prev, arc);
          }
          prev = arc;
        }
      };

      const emitArrow = (k: number) => {
        if (!hasRoom(arrowVertsPerGlyph)) return;
        const frame = getFrame(k);
        const tx = frame[0], ty = frame[1], tz = frame[2];
        const wx = frame[3], wy = frame[4], wz = frame[5];
        const pathT = rings > 1 ? k / (rings - 1) : 0.5;
        const speedN = pathSpeed[k];
        const speedRatioN = pathSpeedRatio[k];
        const speedScale = 0.70 + Math.min(1.0, speedRatioN) * 0.65;
        const len = arrowLengthBase * speedScale;
        const headLen = len * 0.40;
        const shaftHalf = arrowWidthBase * (0.24 + speedN * 0.10);
        const headHalf = arrowWidthBase * (0.82 + speedN * 0.24);
        const cx = pathX[k], cy = pathY[k], cz = pathZ[k];
        const tailX = cx - tx * len * 0.50;
        const tailY = cy - ty * len * 0.50;
        const tailZ = cz - tz * len * 0.50;
        const tipX = cx + tx * len * 0.50;
        const tipY = cy + ty * len * 0.50;
        const tipZ = cz + tz * len * 0.50;
        const neckX = tipX - tx * headLen;
        const neckY = tipY - ty * headLen;
        const neckZ = tipZ - tz * headLen;

        const tailL = emitVertex(tailX + wx * shaftHalf, tailY + wy * shaftHalf, tailZ + wz * shaftHalf, pathT, tphase, speedN, speedRatioN, -1, 2.0);
        const tailR = emitVertex(tailX - wx * shaftHalf, tailY - wy * shaftHalf, tailZ - wz * shaftHalf, pathT, tphase, speedN, speedRatioN, 1, 2.0);
        const neckL = emitVertex(neckX + wx * shaftHalf, neckY + wy * shaftHalf, neckZ + wz * shaftHalf, pathT, tphase, speedN, speedRatioN, -0.55, 2.0);
        const neckR = emitVertex(neckX - wx * shaftHalf, neckY - wy * shaftHalf, neckZ - wz * shaftHalf, pathT, tphase, speedN, speedRatioN, 0.55, 2.0);
        const headL = emitVertex(neckX + wx * headHalf, neckY + wy * headHalf, neckZ + wz * headHalf, pathT, tphase, speedN, speedRatioN, -1, 2.0);
        const headR = emitVertex(neckX - wx * headHalf, neckY - wy * headHalf, neckZ - wz * headHalf, pathT, tphase, speedN, speedRatioN, 1, 2.0);
        const tip = emitVertex(tipX, tipY, tipZ, pathT, tphase, speedN, speedRatioN, 0, 2.0);
        indices.push(tailL, tailR, neckR, tailL, neckR, neckL, headL, headR, tip);
      };

      if (mode === WindTubeMode.Points) {
        for (let k = 0; k < rings; k++) {
          if ((sampleCursor % pointSampleStride) === 0) emitPointFan(k);
          sampleCursor++;
        }
        continue;
      }

      if (mode === WindTubeMode.Arrows) {
        for (let k = 0; k < rings; k++) {
          if ((sampleCursor % arrowSampleStride) === 0) emitArrow(k);
          sampleCursor++;
        }
        continue;
      }

      if (rings < 2) continue;

      // Emit left/right ribbon vertices per ring.
      for (let k = 0; k < rings; k++) {
        const frame = getFrame(k);
        const wx = frame[3], wy = frame[4], wz = frame[5];
        const halfW = halfWidthBase;
        const pathT = k / (rings - 1);             // 0 at tail, 1 at head
        const speedN = pathSpeed[k];
        const speedRatioN = pathSpeedRatio[k];

        // Left vertex.
        emitVertex(
          pathX[k] + wx * halfW,
          pathY[k] + wy * halfW,
          pathZ[k] + wz * halfW,
          pathT, tphase, speedN, speedRatioN, -1, -1
        );

        // Right vertex.
        emitVertex(
          pathX[k] - wx * halfW,
          pathY[k] - wy * halfW,
          pathZ[k] - wz * halfW,
          pathT, tphase, speedN, speedRatioN, 1, -1
        );
      }

      // Triangulate adjacent rings, rejecting any spanning >40% of radius.
      const startV = this.dashFirstVertex[i];
      for (let k = 0; k < rings - 1; k++) {
        const dx = pathX[k+1] - pathX[k];
        const dy = pathY[k+1] - pathY[k];
        const dz = pathZ[k+1] - pathZ[k];
        if (dx*dx + dy*dy + dz*dz >= maxJumpSq) continue;
        const L0 = startV + k*2;
        const R0 = L0 + 1;
        const L1 = L0 + 2;
        const R1 = L0 + 3;
        indices.push(L0, R0, R1, L0, R1, L1);
      }

      emitRoundCap(0, -1);
      emitRoundCap(rings - 1, 1);
    }

    this.vertexCount = vertCursor;
    // Truncate vertexData to exact size.
    this.vertexData = vData.slice(0, vertCursor * this.STRIDE);

    // Build the mesh once. Per-vertex flow data lives in texture0/texture1,
    // and texture2 carries a soft cross-section/cap coordinate for the shader.
    this.builder = new MeshBuilder([
      { name: "position", components: 3 },
      { name: "texture0", components: 2 },
      { name: "texture1", components: 2 },
      { name: "texture2", components: 2 },
    ]);
    this.builder.topology = MeshTopology.Triangles;
    this.builder.indexType = MeshIndexType.UInt16;
    const flat: number[] = [];
    for (let i = 0; i < this.vertexData.length; i++) flat.push(this.vertexData[i]);
    this.builder.appendVerticesInterleaved(flat);
    this.builder.appendIndices(indices);
    if (this.builder.isValid()) {
      this.meshVisual!.mesh = this.builder.getMesh();
      this.builder.updateMesh();
      this.meshReady = true;
    }
    const modeNames = ["Trails", "Points", "Arrows"];
    print("[WindStreamlines] " + modeNames[mode] + " mesh: " + this.vertexCount + " verts, " + (indices.length / 3) + " tris.");
  }

  // ----- per-frame -----
  // The mesh is fully static after init. The Code Node shader reads texture0,
  // texture1, and texture2 to animate opacity and render each active mode.
  private tick() {
    if (!this.meshVisual || !this.meshVisual.mainMaterial) return;
    const pass = this.meshVisual.mainMaterial.mainPass as any;
    if (!pass) return;
    pass.Time = getTime();
    pass.PhaseSpeed = this.phaseSpeed;
    pass.Displace = this.displace;
  }

  public setTubeMode(mode: number): void {
    const nextMode = this.clampTubeMode(mode);
    if (nextMode === this._tubeMode) return;
    this._tubeMode = nextMode;
    this.refresh();
  }

  public refresh(): void {
    if (!this.cal || !this.gfsU || !this.gfsV || !this.meshVisual) return;
    this.buildStaticMesh();
  }

  public queueRefresh(_delaySeconds?: number): void {
    this.refresh();
  }

  private clampTubeMode(mode: number): WindTubeMode {
    return Math.floor(Math.min(2, Math.max(0, mode))) as WindTubeMode;
  }

  get tubeMode(): number { return this._tubeMode; }
  set tubeMode(value: number) {
    this.setTubeMode(value);
  }

  get hasMesh(): boolean { return this.meshReady; }
}
