import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless:true, args:['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width:1200, height:700, deviceScaleFactor:2 });
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto('http://localhost:4322/slice3d.html', { waitUntil:'domcontentloaded' });
await new Promise(r=>setTimeout(r,1500));
await p.screenshot({ path:'slice3_a.png' });               // z=0 center slice
await p.evaluate(()=>{ const s=document.getElementById('slice'); s.value=70; s.dispatchEvent(new Event('input')); });
await new Promise(r=>setTimeout(r,900));
await p.screenshot({ path:'slice3_b.png' });               // z=70 side slice
console.log('fps:', await p.$eval('#fps',e=>e.textContent));
console.log('errors:', errs.length?errs:'none');
await b.close();
