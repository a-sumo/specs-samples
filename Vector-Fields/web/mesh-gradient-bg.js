// mesh-gradient-bg.js
// Static, baked-friendly mesh-gradient background renderer.
// Ports the 2D screen-space liquid-gradient + colored film grain from
// armandsumo/src/components/HyperbolicStarLogo.tsx (the marching-cubes star
// mesh is dropped; the gradient already runs purely on screen coordinates).
//
// One shared WebGL2 context renders each background, then blits into a plain
// 2D <canvas> per element. This avoids the browser's "too many active WebGL
// contexts" cap when dozens of panels/cards each need a background.
//
// Time is frozen so output is deterministic and screenshots identically
// headless. Palette is blue-only (no cyan/green/lime/purple) per the project
// UI color rules.
//
// Usage:
//   mountMeshGradient(canvasEl, { width, height, time, brightness, grain, noiseScale, vignette, colors });
// Returns true on success, false if WebGL2 is unavailable (a solid fallback
// fill is painted instead).

(function () {
  "use strict";

  // Blue-family palette (7 stops, matching the original shader's color slots).
  // Dark charcoal/navy anchors with vivid-blue blooms. Kept dark overall so
  // white text reads on top.
  const PANEL_PALETTE = [
    "#0b0e13", // c0 near-black base
    "#101a2b", // c1 dark navy
    "#1878e0", // c2 vivid blue (primary accent)
    "#163e74", // c3 deep mid blue
    "#0d2344", // c4 deep blue
    "#2b8dff", // c5 bright blue highlight
    "#0a0d12", // c6 darkest
  ];
  const FALLBACK_FILL = "#0d1016";

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return [0, 0, 0];
    return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  }

  const VERT = `#version 300 es
  precision highp float;
  in vec2 aPos;
  out vec2 vUv;
  void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }`;

  const FRAG = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;

  uniform float uTime;
  uniform float uNoiseScale;
  uniform float uNoiseSpeed;
  uniform float uGrain;
  uniform float uBrightness;
  uniform float uVignette;
  uniform vec3 uColor0;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;
  uniform vec3 uColor5;
  uniform vec3 uColor6;

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  // 2D simplex noise (Ashima / IQ port, same as HyperbolicStarLogo)
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * uNoiseSpeed;
    float ns = uNoiseScale;

    float t1 = t * 0.7;
    float t2 = t * 1.2;
    float t3 = t * 0.5;
    float t4 = t * 0.85;

    float n1 = snoise((uv + vec2(t1 * 0.2, t2 * 0.15)) * ns * 2.0) * 0.5 + 0.5;
    float n2 = snoise((uv + vec2(-t2 * 0.18, t3 * 0.22)) * ns * 2.5) * 0.5 + 0.5;
    float n3 = snoise((uv + vec2(t3 * 0.25, -t1 * 0.2)) * ns * 1.8) * 0.5 + 0.5;
    float n4 = snoise((uv + vec2(-t4 * 0.15, t2 * 0.12)) * ns * 3.0) * 0.5 + 0.5;
    float n5 = snoise((uv + vec2(t1 * 0.1, -t4 * 0.18)) * ns * 1.5) * 0.5 + 0.5;

    float posX = uv.x;
    float posY = uv.y;

    vec3 c1 = mix(uColor0, uColor1, n1);
    vec3 c2 = mix(uColor1, uColor2, n2);
    vec3 c3 = mix(uColor5, uColor6, n3);
    vec3 c4 = mix(uColor3, uColor2, n4);
    vec3 c5 = mix(uColor4, uColor1, n5);
    vec3 c6 = mix(uColor6, uColor5, n1 * n2);
    vec3 c7 = mix(uColor5, uColor4, n3 * 0.3);

    float blend1 = smoothstep(0.2, 0.8, posY + n1 * 0.3);
    float blend2 = smoothstep(0.3, 0.7, posX + n2 * 0.25);
    float blend3 = smoothstep(0.25, 0.75, (1.0 - posX) + n3 * 0.2);
    float blend4 = smoothstep(0.3, 0.7, (1.0 - posY) + n4 * 0.25);

    vec3 col = mix(c1, c2, blend1);
    col = mix(col, c4, blend3 * 0.45);
    col = mix(col, c5, blend4 * 0.5);
    col = mix(col, c7, n2 * 0.4);
    col = mix(col, c6, blend2 * 0.35);
    col = mix(col, c3, n5 * 0.3);

    // No "keep bright" normalization: this is a dark background, not a logo.
    // Scale luminance down so dark anchors dominate and blue pools in the
    // bright zones.
    col *= uBrightness;

    // Radial vignette toward the edges keeps panel centers readable.
    vec2 d = uv - 0.5;
    float vig = 1.0 - uVignette * dot(d, d) * 2.4;
    col *= clamp(vig, 0.0, 1.0);

    // Static colored film grain (per-channel), as in the original.
    vec2 grainCoord = uv * 900.0;
    float gr = random(grainCoord + vec2(0.0, 0.0));
    float gg = random(grainCoord + vec2(1.0, 0.0));
    float gb = random(grainCoord + vec2(0.0, 1.0));
    vec3 grain = vec3(gr, gg, gb) - 0.5;
    col += grain * uGrain;

    col = clamp(col, 0.0, 1.0);
    fragColor = vec4(col, 1.0);
  }`;

  let gl = null;
  let glCanvas = null;
  let prog = null;
  let uniforms = null;
  let initFailed = false;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error("shader compile error: " + log);
    }
    return sh;
  }

  function ensureGL() {
    if (gl || initFailed) return gl;
    glCanvas = document.createElement("canvas");
    gl = glCanvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      initFailed = true;
      return null;
    }
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("program link error: " + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const names = [
      "uTime", "uNoiseScale", "uNoiseSpeed", "uGrain", "uBrightness", "uVignette",
      "uColor0", "uColor1", "uColor2", "uColor3", "uColor4", "uColor5", "uColor6",
    ];
    uniforms = {};
    for (const n of names) uniforms[n] = gl.getUniformLocation(prog, n);
    return gl;
  }

  function mountMeshGradient(target, opts) {
    opts = opts || {};
    const w = Math.max(1, Math.round(opts.width || target.clientWidth || 300));
    const h = Math.max(1, Math.round(opts.height || target.clientHeight || 200));

    const context = ensureGL();
    if (!context) {
      target.width = w;
      target.height = h;
      const ctx2 = target.getContext("2d");
      ctx2.fillStyle = FALLBACK_FILL;
      ctx2.fillRect(0, 0, w, h);
      return false;
    }

    const colors = (opts.colors || PANEL_PALETTE).slice(0, 7);
    while (colors.length < 7) colors.push(PANEL_PALETTE[colors.length]);
    const rgb = colors.map(hexToRgb);

    glCanvas.width = w;
    glCanvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    gl.uniform1f(uniforms.uTime, opts.time != null ? opts.time : 12.7);
    gl.uniform1f(uniforms.uNoiseScale, opts.noiseScale != null ? opts.noiseScale : 0.85);
    gl.uniform1f(uniforms.uNoiseSpeed, 0.5);
    gl.uniform1f(uniforms.uGrain, opts.grain != null ? opts.grain : 0.06);
    gl.uniform1f(uniforms.uBrightness, opts.brightness != null ? opts.brightness : 0.34);
    gl.uniform1f(uniforms.uVignette, opts.vignette != null ? opts.vignette : 0.55);
    for (let i = 0; i < 7; i++) {
      gl.uniform3f(uniforms["uColor" + i], rgb[i][0], rgb[i][1], rgb[i][2]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.flush();

    target.width = w;
    target.height = h;
    const ctx2 = target.getContext("2d");
    ctx2.drawImage(glCanvas, 0, 0);
    return true;
  }

  window.PANEL_GRADIENT_PALETTE = PANEL_PALETTE;
  window.mountMeshGradient = mountMeshGradient;
})();
