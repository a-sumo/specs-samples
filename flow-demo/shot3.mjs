import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless:true, args:[
  '--no-sandbox','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl'] });
const p = await b.newPage();
await p.setViewport({ width:1400, height:800, deviceScaleFactor:2 });
await p.goto('http://localhost:4322/gpu.html?steps=110&h=0.082&ny=9&nz=13', { waitUntil:'domcontentloaded' });
await p.waitForFunction('window.__ready===true',{timeout:15000}).catch(()=>{});
await new Promise(r=>setTimeout(r,7000));
await p.screenshot({ path:'gpu_clean.png' });
console.log('fps:', await p.$eval('#fps',e=>e.textContent).catch(()=>''));
await b.close();
