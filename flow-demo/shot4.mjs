import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless:true, args:['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width:1200, height:700, deviceScaleFactor:2 });
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto('http://localhost:4322/slice2d.html', { waitUntil:'domcontentloaded' });
await new Promise(r=>setTimeout(r,1200));
await p.screenshot({ path:'slice_a.png' });
// drag the car to a new spot + set angle of attack
await p.mouse.move(600,350); await p.mouse.down(); await p.mouse.move(760,250,{steps:10}); await p.mouse.up();
await p.evaluate(()=>{ const a=document.getElementById('angle'); a.value=20; a.dispatchEvent(new Event('input')); });
await new Promise(r=>setTimeout(r,900));
await p.screenshot({ path:'slice_b.png' });
console.log('fps:', await p.$eval('#fps',e=>e.textContent));
console.log('errors:', errs.length?errs:'none');
await b.close();
