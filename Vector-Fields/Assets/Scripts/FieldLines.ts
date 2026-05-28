// FieldLines.ts
// ----------------------------------------------------------------------
// A FIELD LINE is a curve everywhere tangent to a vector field. Not a
// trail (no history); not a particle path (the line doesn't move over
// time). It's geometry. Move a charge, the lines snap.
//
// How each line is built (all on CPU, so the algorithm is right here):
//   1. Pick a seed on a small sphere around chargeA.
//   2. Step along normalize(F(p)) with a fixed step size.
//   3. The resulting polyline IS the field line.
//   4. Build a frame at each sample, extrude the cross-section circle.
//
// Field: two-charge Coulomb dipole, F(p) = sum q_i * (p - x_i) / |p - x_i|^3.

@component
export class FieldLines extends BaseScriptComponent {

    @input
    @hint("Any material that renders triangles (FlatMaterial works)")
    material: Material;

    @input
    chargeA: SceneObject;

    @input
    chargeB: SceneObject;

    @input
    @widget(new SliderWidget(-5, 5, 0.1))
    private _strengthA: number = 1.0;

    @input
    @widget(new SliderWidget(-5, 5, 0.1))
    private _strengthB: number = -1.0;

    @input
    @widget(new SliderWidget(1, 24, 1))
    private _lineCount: number = 12;

    @input
    @widget(new SliderWidget(8, 48, 1))
    private _segments: number = 32;

    @input
    @widget(new SliderWidget(3, 12, 1))
    private _radialSegments: number = 6;

    @input
    @widget(new SliderWidget(0.3, 8.0, 0.1))
    private _seedRadius: number = 2.0;

    @input
    @widget(new SliderWidget(0.1, 4.0, 0.05))
    private _stepSize: number = 1.0;

    @input
    @widget(new SliderWidget(0.05, 1.5, 0.01))
    private _tubeRadius: number = 0.4;

    private rmv: RenderMeshVisual | null = null;
    private builtTopologyKey: string = "";

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.onStart());
        this.createEvent("UpdateEvent").bind(() => this.tick());
    }

    private onStart(): void {
        this.rmv = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (this.material) this.rmv.mainMaterial = this.material;
        this.tick();
        print("FieldLines: ready");
    }

    private tick(): void {
        if (!this.rmv || !this.chargeA || !this.chargeB) return;

        const inv = this.sceneObject.getTransform().getInvertedWorldTransform();
        const a = inv.multiplyPoint(this.chargeA.getTransform().getWorldPosition());
        const b = inv.multiplyPoint(this.chargeB.getTransform().getWorldPosition());

        const builder = new MeshBuilder([
            { name: "position", components: 3 },
            { name: "normal",   components: 3 },
            { name: "texture0", components: 2 },
        ]);
        builder.topology = MeshTopology.Triangles;
        builder.indexType = MeshIndexType.UInt16;

        const segs = this._segments;
        const radial = this._radialSegments;
        const lineCount = this._lineCount;
        const seedR = this._seedRadius;
        const step = this._stepSize;
        const tubeR = this._tubeRadius;
        // Charge A as a sink (negative) would pull every seed straight in.
        // Flip sign so seeds walk OUTWARD from A and trace through the field.
        const sgn = this._strengthA >= 0 ? 1.0 : -1.0;

        for (let l = 0; l < lineCount; l++) {
            const dir = this.fibonacciDir(l, lineCount);
            const centerline = this.integrateLine(
                a.x + dir.x * seedR, a.y + dir.y * seedR, a.z + dir.z * seedR,
                a, b, sgn, step, segs);
            this.appendTube(builder, centerline, radial, tubeR);
        }

        if (builder.isValid()) {
            this.rmv.mesh = builder.getMesh();
            builder.updateMesh();
        }
    }

    private integrateLine(
        x: number, y: number, z: number,
        a: vec3, b: vec3, sgn: number, step: number, steps: number,
    ): number[] {
        const pts: number[] = [x, y, z];
        for (let i = 0; i < steps; i++) {
            const f = this.field(x, y, z, a, b);
            const mag = Math.sqrt(f.x * f.x + f.y * f.y + f.z * f.z) + 1e-6;
            const k = (sgn / mag) * step;
            x += f.x * k; y += f.y * k; z += f.z * k;
            pts.push(x, y, z);
        }
        return pts;
    }

    private field(px: number, py: number, pz: number, a: vec3, b: vec3): vec3 {
        const dax = px - a.x, day = py - a.y, daz = pz - a.z;
        const ra2 = dax * dax + day * day + daz * daz + 1e-3;
        const ra3 = ra2 * Math.sqrt(ra2);
        const dbx = px - b.x, dby = py - b.y, dbz = pz - b.z;
        const rb2 = dbx * dbx + dby * dby + dbz * dbz + 1e-3;
        const rb3 = rb2 * Math.sqrt(rb2);
        const qa = this._strengthA, qb = this._strengthB;
        return new vec3(
            qa * dax / ra3 + qb * dbx / rb3,
            qa * day / ra3 + qb * dby / rb3,
            qa * daz / ra3 + qb * dbz / rb3,
        );
    }

    // Tube extrusion frame — same pattern that solved the pinch/collapse glitches
    // in music-vids/Scripts/BSplineTube.ts and TrailRake.ts.
    //
    // Hybrid: at each sample compute a CANONICAL normal via Gram-Schmidt with a
    // smoothly-blended ref-up (Y when tangent is horizontal, X when tangent
    // approaches ±Y). That blend across tanY² ≈ 0.7 avoids the discontinuity a
    // hardcoded up vector would produce when the tangent passes through it.
    // Then PARALLEL TRANSPORT the previous sample's normal onto the new
    // tangent's perpendicular plane; if that projection collapses (180° flip),
    // fall back to the canonical normal for that sample. Together: continuous
    // frame along smooth stretches, no singularity at vertical tangents, and a
    // safety net at degenerate spots.
    private appendTube(builder: any, centerline: number[], radial: number, tubeR: number): void {
        const sampleCount = centerline.length / 3;
        const startVert = builder.getVerticesCount();

        let pNx = 0, pNy = 0, pNz = 0;

        for (let i = 0; i < sampleCount; i++) {
            const cx = centerline[i * 3];
            const cy = centerline[i * 3 + 1];
            const cz = centerline[i * 3 + 2];

            const j0 = Math.max(0, i - 1);
            const j1 = Math.min(sampleCount - 1, i + 1);
            let tx = centerline[j1 * 3]     - centerline[j0 * 3];
            let ty = centerline[j1 * 3 + 1] - centerline[j0 * 3 + 1];
            let tz = centerline[j1 * 3 + 2] - centerline[j0 * 3 + 2];
            const tlen = Math.sqrt(tx * tx + ty * ty + tz * tz) + 1e-6;
            tx /= tlen; ty /= tlen; tz /= tlen;

            // Canonical frame: Gram-Schmidt with smoothly-blended ref-up.
            const yAlign = ty * ty;
            let bl = Math.min(1, Math.max(0, (yAlign - 0.7) / 0.25));
            bl = bl * bl * (3 - 2 * bl);
            let upx = bl, upy = 1 - bl;
            const ulen = Math.sqrt(upx * upx + upy * upy);
            upx /= ulen; upy /= ulen;
            const upT = upx * tx + upy * ty;
            let cnx = upx - tx * upT;
            let cny = upy - ty * upT;
            let cnz = -tz * upT;
            let cnlen = Math.sqrt(cnx * cnx + cny * cny + cnz * cnz);
            if (cnlen < 1e-6) cnlen = 1;
            cnx /= cnlen; cny /= cnlen; cnz /= cnlen;

            // Final normal: parallel transport from previous, fall back to canonical.
            let nx: number, ny: number, nz: number;
            if (i === 0) {
                nx = cnx; ny = cny; nz = cnz;
            } else {
                const dot = pNx * tx + pNy * ty + pNz * tz;
                nx = pNx - dot * tx;
                ny = pNy - dot * ty;
                nz = pNz - dot * tz;
                const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz);
                if (nlen < 1e-4) {
                    nx = cnx; ny = cny; nz = cnz;
                } else {
                    nx /= nlen; ny /= nlen; nz /= nlen;
                }
            }

            const bx = ty * nz - tz * ny;
            const by = tz * nx - tx * nz;
            const bz = tx * ny - ty * nx;

            const t = i / Math.max(1, sampleCount - 1);
            for (let k = 0; k < radial; k++) {
                const theta = (k / radial) * Math.PI * 2;
                const cosT = Math.cos(theta);
                const sinT = Math.sin(theta);
                const ox = (cosT * nx + sinT * bx) * tubeR;
                const oy = (cosT * ny + sinT * by) * tubeR;
                const oz = (cosT * nz + sinT * bz) * tubeR;
                builder.appendVerticesInterleaved([
                    cx + ox, cy + oy, cz + oz,
                    ox / tubeR, oy / tubeR, oz / tubeR,
                    k / radial, t,
                ]);
            }

            pNx = nx; pNy = ny; pNz = nz;
        }

        for (let s = 0; s < sampleCount - 1; s++) {
            for (let k = 0; k < radial; k++) {
                const a = startVert + s * radial + k;
                const b = startVert + s * radial + ((k + 1) % radial);
                const c = startVert + (s + 1) * radial + k;
                const d = startVert + (s + 1) * radial + ((k + 1) % radial);
                builder.appendIndices([a, b, c, b, d, c]);
            }
        }
    }

    private fibonacciDir(index: number, count: number): vec3 {
        const phi = Math.PI * (Math.sqrt(5) - 1);
        const y = 1 - (index / Math.max(1, count - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = phi * index;
        return new vec3(Math.cos(theta) * r, y, Math.sin(theta) * r);
    }
}
