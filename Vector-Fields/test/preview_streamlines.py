"""Generate an HTML preview of the wind streamlines JSON for browser inspection."""
import json
from pathlib import Path

here = Path(__file__).resolve().parent
data_path = here.parent / "Assets" / "Slides" / "wing_streamlines.json"
data = json.loads(data_path.read_text())

# embed JSON as a JS literal so the file works via file://
html = f"""<!doctype html>
<html><head><meta charset=utf-8>
<title>Wind streamlines</title>
<style>
  body {{ margin:0; background:#0e0f12; color:#e8e8ea; font-family:-apple-system,monospace; }}
  #wrap {{ display:flex; gap:24px; padding:20px; }}
  canvas {{ background:#0a0b0e; border:1px solid #2a2c33; border-radius:6px; }}
  .meta {{ font-size:13px; line-height:1.6; color:#9aa1ad; max-width:300px; }}
  h1 {{ font-size:14px; margin:0 0 12px; color:#e8e8ea; letter-spacing:.04em; text-transform:uppercase; }}
  code {{ background:#1a1c22; padding:2px 6px; border-radius:3px; color:#e8b010; }}
</style></head>
<body><div id=wrap>
  <canvas id=cv width=900 height=560></canvas>
  <div class=meta>
    <h1>Joukowski airfoil · potential flow</h1>
    <div>α = <code id=alpha></code>°&nbsp;&nbsp; U = <code id=U></code></div>
    <div>Γ (Kutta) = <code id=G></code></div>
    <div>R = <code id=R></code>, μ = <code id=mu></code></div>
    <div>Streamlines = <code id=ns></code></div>
    <div>Total points = <code id=np></code></div>
    <hr style="border-color:#2a2c33;margin:18px 0">
    <div>Color = z-layer · Bands top→bottom: 0.4, 0.0, -0.4</div>
    <div style="margin-top:8px">If the flow looks attached above and trails behind the wing, the math is correct. The Kutta condition pulls the rear stagnation point onto the trailing edge.</div>
  </div>
</div>
<script>
const D = {json.dumps(data, separators=(',',':'))};
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
document.getElementById('alpha').textContent = D.params.alpha_deg.toFixed(1);
document.getElementById('U').textContent = D.params.U.toFixed(2);
document.getElementById('G').textContent = D.params.Gamma.toFixed(3);
document.getElementById('R').textContent = D.params.R.toFixed(2);
document.getElementById('mu').textContent = D.params.mu.map(x=>x.toFixed(2)).join(', ');
document.getElementById('ns').textContent = D.streamlines.length;
document.getElementById('np').textContent = D.streamlines.reduce((a,s)=>a+s.length,0);

// world bounds for projection (xmin,xmax,ymin,ymax)
const xmin=-2, xmax=4, ymin=-2, ymax=2;
const pad = 20;
const sx = (cv.width  - 2*pad) / (xmax-xmin);
const sy = (cv.height - 2*pad) / (ymax-ymin);
const s = Math.min(sx, sy);
const ox = (cv.width  - s*(xmax-xmin)) / 2 - s*xmin;
const oy = (cv.height + s*(ymax-ymin)) / 2 + s*ymin;
const proj = (x,y) => [ox + s*x, oy - s*y];

// streamlines colored by z-layer
const layerColor = z => {{
  if (z >  0.2) return '#1878e0';   // back  - blue
  if (z < -0.2) return '#e08818';   // front - amber
  return '#e0e0e0';                  // mid   - white
}};
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
ctx.lineWidth = 1.1;
for (const sl of D.streamlines) {{
  ctx.strokeStyle = layerColor(sl[0][2]);
  ctx.beginPath();
  for (let i=0; i<sl.length; i++) {{
    const [px,py] = proj(sl[i][0], sl[i][1]);
    if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }}
  ctx.stroke();
}}

// airfoil silhouette
ctx.fillStyle = '#181a20';
ctx.strokeStyle = '#e03020';
ctx.lineWidth = 1.5;
ctx.beginPath();
const a = D.airfoil;
for (let i=0; i<a.length; i++) {{
  const [px,py] = proj(a[i][0], a[i][1]);
  if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
}}
ctx.closePath();
ctx.fill(); ctx.stroke();
</script></body></html>
"""

out = here / "wind_streamlines_preview.html"
out.write_text(html)
print("Wrote", out)
