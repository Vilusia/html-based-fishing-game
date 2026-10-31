// Local visual QA of the real game/shop without opening a network lobby.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
http.createServer((req,res)=>{
 let url=decodeURIComponent(req.url.split('?')[0]);if(url==='/')url='/index.html';
 const file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(error,buffer)=>{
  if(error){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html;charset=utf-8':'application/octet-stream');
  if(url==='/index.html')buffer=Buffer.from(buffer.toString().replace('</html>',`<button id="qa-open-shop" type="button" class="btn" onclick="document.getElementById('lobby-screen').style.display='none';toggleShop()" style="position:fixed;bottom:8px;left:8px;z-index:20000;padding:12px">Open shop · local preview</button></html>`));
  res.end(buffer);
 });
}).listen(8766,'127.0.0.1',()=>process.stdout.write('Studio QA: http://localhost:8766/\n'));
