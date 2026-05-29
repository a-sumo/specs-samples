import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless:true, args:[
  '--no-sandbox',
  '--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist','--enable-webgl'] });
const p = await b.newPage();
await p.setViewport({ width:1400, height:800, deviceScaleFactor:2 });
const errs=[]; p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
p.on('pageerror', e=>errs.push(String(e)));
await p.goto('http://localhost:4322/index.html', { waitUntil:'domcontentloaded' });
await p.waitForFunction('window.__ready===true', { timeout:15000 }).catch(()=>{});
await new Promise(r=>setTimeout(r,1500));
await p.screenshot({ path:'shot.png' });
console.log('errors:', errs.length? errs : 'none');
await b.close();
