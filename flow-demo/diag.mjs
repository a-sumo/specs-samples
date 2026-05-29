import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless:true, args:[
  '--no-sandbox','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl'] });
const p = await b.newPage();
await p.evaluateOnNewDocument(()=>{
  window.__errs=[];
  window.addEventListener('error', e=>window.__errs.push('ERR: '+(e.message||e.error?.stack||e)));
  window.addEventListener('unhandledrejection', e=>window.__errs.push('REJ: '+(e.reason?.stack||e.reason)));
});
const logs=[]; p.on('console', m=>logs.push(m.type()+': '+m.text()));
p.on('pageerror', e=>logs.push('PAGEERROR: '+(e.stack||e)));
p.on('requestfailed', r=>logs.push('REQFAIL: '+r.url()+' '+r.failure()?.errorText));
const resp = await p.goto('http://localhost:4322/gpu.html?steps=24&ny=4&nz=5', { waitUntil:'networkidle2' });
console.log('status:', resp.status());
await new Promise(r=>setTimeout(r,3000));
console.log('ready:', await p.evaluate(()=>window.__ready));
console.log('diag :', await p.evaluate(()=>window.__diag));
console.log('werr :', await p.evaluate(()=>window.__err||'(none)'));
console.log('gerrs:', await p.evaluate(()=>window.__errs));
console.log('--- console ---\n'+logs.join('\n'));
await b.close();
