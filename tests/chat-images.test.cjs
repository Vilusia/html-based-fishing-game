const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('ui.js','utf8'),start=source.indexOf('// --- SECURITY FIX: Safe Image Embedding'),end=source.indexOf('let gifSearchAbort',start);
const c=vm.createContext({URL,escapeHTML:text=>String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))});vm.runInContext(source.slice(start,end),c);
test('only exact HTTPS image CDN names embed, including Reddit preview query strings',()=>{
 for(const url of ['https://i.imgur.com/test.png','https://i.redd.it/test.jpeg','https://preview.redd.it/test.webp?width=640&format=webp&s=signature','https://media.giphy.com/media/id/giphy.gif','https://media4.giphy.com/media/id/200w.webp','https://i.giphy.com/id.gif','https://I.IMGUR.COM/test.JPG']){
  const html=c.safeEmbedImage(url);assert.match(html,/^<img /,url);assert.match(html,/referrerpolicy="no-referrer"/);assert.match(html,/loading="lazy"/);
 }
});
test('unknown hosts, IPs, lookalikes, credentials, ports, unsafe schemes and non-image pages stay escaped text',()=>{
 for(const url of ['https://tracker.example/grab.png','http://i.imgur.com/test.png','https://127.0.0.1/test.png','https://192.168.1.1/test.gif','https://[::1]/test.png','https://2130706433/test.png','https://i.imgur.com.attacker.example/a.jpg','https://evilimgur.com/a.jpg','https://attacker.example/i.imgur.com/a.png','https://i.imgur.com@attacker.example/a.png','https://attacker@i.imgur.com/a.png','https://i.imgur.com:8443/a.png','https://i.imgur.com./a.png','https://imgur.com/a/test','https://www.reddit.com/r/test/a.png','https://external-preview.redd.it/a.png','https://media9.giphy.com/a.gif','https://i.imgur.com/a.svg','https://i.imgur.com/a.html?file=.jpg','https://i.imgur.com/a.mp4','data:image/png;base64,abc','javascript:alert(1)','//i.imgur.com/a.png','<img src="https://tracker.example/a.png">']){
  assert.equal(c.allowedChatImageUrl(url),null,url);assert(!c.safeEmbedImage(url).includes('<img '),url);
 }
 assert.equal(c.allowedChatImageUrl('https://i.imgur.com/'+ 'x'.repeat(512)+'.png'),null);
});
test('allowed paths and query parameters cannot break out of an image attribute',()=>{
 const html=c.safeEmbedImage('https://i.imgur.com/a.png?note=" onerror="alert(1)&other=<img>');
 assert.match(html,/^<img /);assert(!html.includes('onerror="'));assert(!html.includes('<img>'));assert.match(html,/&amp;other=/);
});
test('GIF picker uses the same validation and does not expand the host allowlist',()=>{
 assert(c.isAllowedGifUrl('https://media.giphy.com/media/a/giphy.gif'));
 for(const url of ['https://i.imgur.com/a.gif','https://media.giphy.com:8443/a.gif','https://user@media.giphy.com/a.gif','https://media.giphy.com.attacker.example/a.gif'])assert(!c.isAllowedGifUrl(url));
 const picker=source.slice(source.indexOf('function gifRenderResults('),source.indexOf('// Picking a GIF'));
 assert(picker.includes('!isAllowedGifUrl(preview) || !isAllowedGifUrl(full)'));
 assert(picker.indexOf("img.referrerPolicy = 'no-referrer'")<picker.indexOf('img.src = preview'));
});
test('browser CSP matches the exact image allowlist to constrain redirects as well as initial URLs',()=>{
 const html=fs.readFileSync('index.html','utf8'),policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
 const hosts=vm.runInContext('[...CHAT_IMAGE_HOSTS,...GIF_MEDIA_HOSTS]',c);
 const directive=policy.match(/img-src ([^;]+)/)[1].split(/\s+/);
 assert.deepEqual(directive.sort(),["'self'",'data:','blob:',...Array.from(hosts,h=>'https://'+h)].sort());
 assert(!directive.includes('https:'));assert(!policy.includes('*'));
 assert(html.indexOf('http-equiv="Content-Security-Policy"')<html.indexOf('<link'));
});
test('all received chat messages pass through the allowlist before image markup is generated',()=>{
 const render=source.slice(source.indexOf('function displayChatMessage('),source.indexOf('function wrapChatBubbleText('));
 assert(render.includes('safeEmbedImage(rawText)'));assert(render.includes('allowedChatImageUrl(rawText)'));
});
