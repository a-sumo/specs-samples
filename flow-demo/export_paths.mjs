import puppeteer from 'puppeteer';
import fs from 'fs';
const OUT = '/Users/armand/Documents/specs-samples/Vector-Fields/Assets/Flow/flow_paths.json';
const N_TEMPLATES = 16, M_POINTS = 36;
const b = await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p = await b.newPage();
await p.goto('http://localhost:4322/slice_car.html?nx=100&ny=48&nz=54',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__field!==undefined',{timeout:60000});
const data = await p.evaluate((N, M) => {
  const F = window.__field; const {VOL,NX,NY,NZ,X0,X1,Y0,Y1,Z0,Z1,DX,DY,DZ} = F;
  const sample=(x,y,z,o)=>{ let gi=(x-X0)/DX,gj=(y-Y0)/DY,gk=Math.round((z-Z0)/DZ);
    if(gk<0)gk=0;else if(gk>NZ-1)gk=NZ-1;
    if(gi<0||gi>NX-1||gj<0||gj>NY-1){o[0]=1;o[1]=0;o[2]=1;return;}
    let i0=gi|0,j0=gj|0;const fi=gi-i0,fj=gj-j0;let i1=Math.min(i0+1,NX-1),j1=Math.min(j0+1,NY-1);
    const bI=(i,j)=>((gk*NY+j)*NX+i)*3,a00=bI(i0,j0),a10=bI(i1,j0),a01=bI(i0,j1),a11=bI(i1,j1);
    for(let c=0;c<3;c++){const x0=VOL[a00+c]+(VOL[a10+c]-VOL[a00+c])*fi,x1=VOL[a01+c]+(VOL[a11+c]-VOL[a01+c])*fi;o[c]=x0+(x1-x0)*fj;} };
  const k1=[0,0,0],k2=[0,0,0],k3=[0,0,0],k4=[0,0,0];
  const trace=(y0,z)=>{ const pts=[]; let x=X0+DX,y=y0; const h=(X1-X0)/140;
    for(let s=0;s<260&&x<X1;s++){ pts.push([x,y]);
      sample(x,y,z,k1);sample(x+0.5*h*k1[0],y+0.5*h*k1[1],z,k2);sample(x+0.5*h*k2[0],y+0.5*h*k2[1],z,k3);sample(x+h*k3[0],y+h*k3[1],z,k4);
      x+=h/6*(k1[0]+2*k2[0]+2*k3[0]+k4[0]); y+=h/6*(k1[1]+2*k2[1]+2*k3[1]+k4[1]); }
    return pts; };
  const resample=(pts,z)=>{ const o=[0,0,0];
    if(pts.length<2){ const x=pts.length?pts[0][0]:0,y=pts.length?pts[0][1]:0; sample(x,y,z,o);
      return {x:Array(M).fill(+x.toFixed(3)),y:Array(M).fill(+y.toFixed(3)),sp:Array(M).fill(+o[2].toFixed(3))}; }
    let L=0;const seg=[0]; for(let i=1;i<pts.length;i++){L+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);seg.push(L);}
    const out={x:[],y:[],sp:[]};
    for(let m=0;m<M;m++){ const target=(L>0)?L*m/(M-1):0; let i=1; while(i<pts.length&&seg[i]<target)i++; if(i>pts.length-1)i=pts.length-1;
      const denom=seg[i]-seg[i-1]; const t=denom>1e-6?(target-seg[i-1])/denom:0;
      const x=pts[i-1][0]+(pts[i][0]-pts[i-1][0])*t, y=pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t;
      sample(x,y,z,o); out.x.push(+x.toFixed(3));out.y.push(+y.toFixed(3));out.sp.push(+o[2].toFixed(3)); }
    return out; };
  const slices=[];
  for(let k=0;k<NZ;k++){ const z=Z0+k*DZ; const lines=[]; const m=(Y1-Y0)*0.46;
    for(let i=0;i<N;i++){ const y0=Y0+(Y1-Y0)*0.5+(-m+2*m*i/(N-1)); lines.push(resample(trace(y0,z),z)); }
    slices.push(lines); }
  return { NX,NY,NZ, X0,X1,Y0,Y1,Z0,Z1, M, N, slices };
}, N_TEMPLATES, M_POINTS);
await b.close();
fs.writeFileSync(OUT, JSON.stringify(data));
console.log('wrote', OUT, (fs.statSync(OUT).size/1024).toFixed(0)+'KB', 'slices:',data.slices.length,'lines/slice:',data.N,'pts/line:',data.M);
console.log('domain X',data.X0.toFixed(1),data.X1.toFixed(1),'Y',data.Y0.toFixed(1),data.Y1.toFixed(1),'Z',data.Z0.toFixed(1),data.Z1.toFixed(1));
