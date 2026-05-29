import puppeteer from 'puppeteer';
import { PNG } from 'pngjs';
import fs from 'fs';

const OUT_DIR = '/Users/armand/Documents/specs-samples/Vector-Fields/Assets/Flow';
const NXq = process.argv[2]||'100', NYq=process.argv[3]||'48', NZq=process.argv[4]||'54';
fs.mkdirSync(OUT_DIR,{recursive:true});

const b=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();
p.on('console',m=>{const t=m.text(); if(t.startsWith('bake ms')||t.startsWith('DIMS')) console.log(t);});
await p.goto(`http://localhost:4322/slice_car.html?nx=${NXq}&ny=${NYq}&nz=${NZq}`,{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__ready===true',{timeout:60000});
const F=await p.evaluate(()=>{ const f=window.__field; return {...f, VOL:Array.from(f.VOL)}; });
await b.close();

const {NX,NY,NZ}=F, VSCALE=2.0;
const tilesX=Math.ceil(Math.sqrt(NZ)), tilesY=Math.ceil(NZ/tilesX);
const W=tilesX*NX, H=tilesY*NY;
const png=new PNG({width:W,height:H});
const encV=v=>Math.max(0,Math.min(255,Math.round((v/(2*VSCALE)+0.5)*255)));
const encS=s=>Math.max(0,Math.min(255,Math.round((s/VSCALE)*255)));
for(let k=0;k<NZ;k++){ const col=k%tilesX, row=(k/tilesX)|0;
  for(let j=0;j<NY;j++) for(let i=0;i<NX;i++){
    const o=((k*NY+j)*NX+i)*3;
    const px=col*NX+i, py=row*NY+(NY-1-j);        // image-up = +Y
    const idx=(py*W+px)*4;
    png.data[idx]  =encV(F.VOL[o]);
    png.data[idx+1]=encV(F.VOL[o+1]);
    png.data[idx+2]=encS(F.VOL[o+2]);
    png.data[idx+3]=255;
  }}
fs.writeFileSync(`${OUT_DIR}/flow_field.png`, PNG.sync.write(png));
const meta={ NX,NY,NZ,tilesX,tilesY,atlasW:W,atlasH:H,VSCALE,
  domain:{X0:F.X0,X1:F.X1,Y0:F.Y0,Y1:F.Y1,Z0:F.Z0,Z1:F.Z1},
  car:{CARL:F.CARL,CARH:F.CARH,CARW:F.CARW,lenAx:F.lenAx,minAx:F.minAx,midAx:F.midAx,center:F.ctr},
  encoding:'RG=velocity (v=(c-0.5)*2*VSCALE), B=speed (s=c*VSCALE), tile k at (k%tilesX, k/tilesX), tile-row0=highY' };
fs.writeFileSync(`${OUT_DIR}/flow_field.json`, JSON.stringify(meta,null,2));
console.log('wrote', `${OUT_DIR}/flow_field.png`, `${W}x${H}`, 'tiles', tilesX+'x'+tilesY, 'for', NZ, 'slices');
console.log(JSON.stringify(meta.domain), 'car', JSON.stringify(meta.car));
