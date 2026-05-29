import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage(); await p.setViewport({width:1200,height:700,deviceScaleFactor:2});
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{const t=m.text(); if(m.type()==='error'||t.startsWith('bake')) errs.push(m.type()+': '+t);});
await p.goto('http://localhost:4322/slice_car.html?nx=100&ny=48&nz=54',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__ready===true',{timeout:30000}).catch(()=>{});
await new Promise(r=>setTimeout(r,1500));
await p.screenshot({path:'car_a.png'});                 // mid slice
await p.evaluate(()=>{ const s=document.getElementById('slice'); s.value=82; s.dispatchEvent(new Event('input')); });
await new Promise(r=>setTimeout(r,900));
await p.screenshot({path:'car_b.png'});                 // side slice
console.log('fps:', await p.$eval('#fps',e=>e.textContent).catch(()=>''));
console.log('log:', errs.length?errs:'none');
await b.close();
