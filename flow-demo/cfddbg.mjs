import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();
p.on('console',m=>{const t=m.text(); if(t.startsWith('voxelize')||t.startsWith('CFD')||t.startsWith('DIMS')) console.log(t);});
p.on('pageerror',e=>console.log('PAGEERR',String(e).slice(0,160)));
await p.goto('http://localhost:4322/slice_car_cfd.html?nx=44&ny=22&nz=26&steps=600&chunk=40',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__solved===true',{timeout:60000}).catch(()=>console.log('(solve timeout)'));
const diag=await p.evaluate(()=>{
  const F=window.__field; if(!F) return 'no field';
  const {VOL,SOLID,NX,NY,NZ,X0,DX,DY,DZ,Y0,Z0,CARL}=F; const ID=(i,j,k)=>(k*NY+j)*NX+i;
  let nan=0; for(let n=0;n<VOL.length;n++) if(!isFinite(VOL[n])) nan++;
  // upstream freestream speed (front plane region, mid)
  const up=ID(3,(NY>>1),(NZ>>1)); 
  // wake box: behind car tail. car spans x in [-CARL/2,CARL/2]; tail at +CARL/2. sample just behind, mid height/center
  let wmin=9,wsum=0,wc=0;
  for(let i=0;i<NX;i++){ const x=X0+i*DX; if(x< CARL*0.55 || x>CARL*1.2) continue;
    for(let j=Math.floor(NY*0.35);j<Math.floor(NY*0.65);j++) for(let k=Math.floor(NZ*0.4);k<Math.floor(NZ*0.6);k++){
      const c=ID(i,j,k); if(SOLID[c])continue; const vx=VOL[c*3]; if(vx<wmin)wmin=vx; wsum+=vx; wc++; }}
  return {nan, upstreamSpeed:+VOL[up*3+2].toFixed(3), wakeMeanVx:+(wsum/wc).toFixed(3), wakeMinVx:+wmin.toFixed(3), wakeCells:wc};
});
console.log('DIAG', JSON.stringify(diag));
await b.close();
