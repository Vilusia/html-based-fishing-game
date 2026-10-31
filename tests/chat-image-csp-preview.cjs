// Manual browser regression: node tests/chat-image-csp-preview.cjs
// Visit http://127.0.0.1:8766/ . No requests to public services are needed.
const http=require('node:http'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8'),source=fs.readFileSync('ui.js','utf8');
const policy=html.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
const helpers=source.slice(source.indexOf('// --- SECURITY FIX: Safe Image Embedding'),source.indexOf('let gifSearchAbort'));
let redirects=0,blockedRequests=0;
const server=http.createServer((req,res)=>{
 if(req.url==='/redirect-image'){redirects++;res.writeHead(302,{Location:'http://localhost:8766/tracker.gif'});res.end();return;}
 if(req.url==='/tracker.gif'){blockedRequests++;res.writeHead(200,{'Content-Type':'image/gif'});res.end();return;}
 if(req.url==='/stats'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({redirects,blockedRequests}));return;}
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><html><head><meta charset="utf-8">${policy}<title>Chat image privacy test</title></head><body>
 <h1>Local chat image privacy test</h1><p>No public image hosts are contacted.</p>
 <button id="plain">Render unapproved URL</button><button id="redirect">Test blocked redirect</button><button id="stats">Check request counters</button>
 <div id="message"></div><p id="violation"></p><pre id="result"></pre><div id="image"></div><script>
 function escapeHTML(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 ${helpers}
 document.getElementById('plain').onclick=()=>{document.getElementById('message').innerHTML=safeEmbedImage('https://unapproved.example/tracker.png');};
 document.getElementById('redirect').onclick=()=>{const image=document.createElement('img');image.alt='Blocked redirect test';image.src='/redirect-image';document.getElementById('image').append(image);};
 document.getElementById('stats').onclick=async()=>{document.getElementById('result').textContent=JSON.stringify(await(await fetch('/stats')).json());};
 document.addEventListener('securitypolicyviolation',event=>{document.getElementById('violation').textContent=event.effectiveDirective+' blocked '+event.blockedURI;});
 </script></body></html>`);
});
server.listen(8766,'127.0.0.1',()=>process.stdout.write('Local privacy test: http://127.0.0.1:8766/\n'));
