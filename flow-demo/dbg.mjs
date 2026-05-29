import puppeteer from 'puppeteer';
const b=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();
p.on('console',m=>{const t=m.text(); if(t.startsWith('DIMS')||t.startsWith('DIAG')||t.startsWith('bake')) console.log(t);});
p.on('pageerror',e=>console.log('PAGEERR',String(e).slice(0,200)));
await p.goto('http://localhost:4322/slice_car.html?nx=40&ny=22&nz=26',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__ready===true',{timeout:20000}).catch(()=>console.log('(timeout)'));
await new Promise(r=>setTimeout(r,300));
await b.close();
