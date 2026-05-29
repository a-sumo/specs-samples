// Pure-JS cost of re-solving the streamlines every frame (no WebGL).
// V8 here is representative of browser CPU cost; render cost is separate & tiny.
const faces = [];
for (let i=0;i<34;i++){ // realistic convex-hull face count
  const a=i*0.3; faces.push({cx:Math.cos(a),cy:Math.sin(a),cz:Math.cos(a*2),
    nx:Math.cos(a),ny:Math.sin(a),nz:0.2});
}
const U=[1,0,0], R=1.4;
function vel(px,py,pz){
  let best=-1e9,bnx=0,bny=0,bnz=0;
  for(const f of faces){ const d=(px-f.cx)*f.nx+(py-f.cy)*f.ny+(pz-f.cz)*f.nz;
    if(d>best){best=d;bnx=f.nx;bny=f.ny;bnz=f.nz;} }
  const w=Math.exp(-Math.max(best,0)/R);
  const un=U[0]*bnx+U[1]*bny+U[2]*bnz;
  return [U[0]-bnx*un*w,U[1]-bny*un*w,U[2]-bnz*un*w];
}
function trace(p,h,steps){ let[x,y,z]=p;
  for(let s=0;s<steps;s++){
    const k1=vel(x,y,z),k2=vel(x+.5*h*k1[0],y+.5*h*k1[1],z+.5*h*k1[2]),
      k3=vel(x+.5*h*k2[0],y+.5*h*k2[1],z+.5*h*k2[2]),k4=vel(x+h*k3[0],y+h*k3[1],z+h*k3[2]);
    x+=h/6*(k1[0]+2*k2[0]+2*k3[0]+k4[0]); y+=h/6*(k1[1]+2*k2[1]+2*k3[1]+k4[1]);
    z+=h/6*(k1[2]+2*k2[2]+2*k3[2]+k4[2]); }
  return [x,y,z]; }
function frame(nLines,steps){ for(let i=0;i<nLines;i++) trace([-3.2,Math.random(),Math.random()-0.5],0.02,steps); }
for(const [n,s,label] of [[35,900,'current'],[120,900,'4x lines'],[300,1200,'high detail']]){
  frame(n,s); // warmup
  const t0=process.hrtime.bigint(); const N=30;
  for(let i=0;i<N;i++) frame(n,s);
  const ms=Number(process.hrtime.bigint()-t0)/1e6/N;
  console.log(`${label.padEnd(12)} ${n} lines x ${s} steps  ->  ${ms.toFixed(2)} ms/full-resolve   (${(1000/ms).toFixed(0)} re-solves/sec)`);
}
