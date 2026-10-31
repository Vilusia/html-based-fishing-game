const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const source=fs.readFileSync('character-thumbnails.js','utf8');
function setup(fail=false){
 const frames=[],cameras=[],built=[],freed=[],canvases=[];let contexts=0,lost=0,fallbacks=0;
 function canvas(){const classes=new Set(),node={isConnected:true,width:128,height:128,copies:0,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},getContext:()=>({clearRect(){},drawImage(){node.copies++;}})};canvases.push(node);return node;}
 class Renderer{constructor(){contexts++;if(fail)throw Error('No WebGL');this.domElement=canvas();}setPixelRatio(){}setSize(){}setClearColor(){}render(scene,camera){cameras.push(camera.clone());}dispose(){}forceContextLoss(){lost++;}}
 const c=vm.createContext({window:{},THREE:{...THREE,WebGLRenderer:Renderer},document:{createElement:canvas},requestAnimationFrame:fn=>frames.push(fn)});vm.runInContext(source,c);
 function request(cfg={},focus='full',extra={}){const target=canvas();c.window.CharacterThumbnails.request({canvas:target,cfg,focus,...extra,build:cfg=>{built.push(cfg);const body=new THREE.Group();body.add(new THREE.Mesh(new THREE.BoxGeometry(1,3,1),new THREE.MeshBasicMaterial()));return body;},dispose:body=>freed.push(body),fallback(){fallbacks++;}});return target;}
 return {api:c.window.CharacterThumbnails,frames,cameras,built,freed,request,contexts:()=>contexts,lost:()=>lost,fallbacks:()=>fallbacks};
}
test('many cards share one renderer and build only one model per frame, disposing every model',()=>{
 const s=setup();const a=s.request({ears:'cat'}),b=s.request({ears:'fox'});assert.equal(s.frames.length,1);assert.equal(s.built.length,0);
 s.frames.shift()();assert.equal(s.built.length,1);assert.equal(s.freed.length,1);assert.equal(a.copies,1);assert.equal(b.copies,0);
 s.frames.shift()();assert.equal(s.built.length,2);assert.equal(s.contexts(),1);assert.equal(b.copies,1);assert.equal(s.freed.length,2);
});
test('cache reuses exact appearance and framing while colors and signs invalidate the card',()=>{
 const s=setup();s.request({eye:'#00ff00',protogenLogo:'a'});s.frames.shift()();const cached=s.request({eye:'#00ff00',protogenLogo:'a'});assert.equal(cached.copies,1);assert.equal(s.built.length,1);
 s.request({eye:'#ff0000',protogenLogo:'a'});s.frames.shift()();s.request({eye:'#ff0000',protogenLogo:'b'});s.frames.shift()();assert.equal(s.built.length,3);
});
test('obsolete category jobs and detached cards are skipped; closing releases the context',()=>{
 const s=setup();s.request({ears:'cat'});s.api.cancel();s.frames.shift()();assert.equal(s.built.length,0);
 const detached=s.request({ears:'fox'});detached.isConnected=false;s.frames.shift()();assert.equal(s.built.length,0);
 s.request({ears:'bunny'});s.frames.shift()();s.api.dispose();assert.equal(s.lost(),1);
});
test('shop and studio jobs keep separate dimensions and cancel without stopping the other queue',()=>{
 const s=setup();s.request({ears:'cat'},'full',{width:96,height:128,scope:'shop'});s.request({ears:'fox'},'full',{width:128,height:128,scope:'studio'});s.api.cancel('shop');s.frames.shift()();
 assert.equal(s.built.length,1);assert.equal(s.built[0].ears,'fox');assert.equal(s.cameras[0].aspect,1);
 s.request({ears:'cat'},'full',{width:96,height:128,scope:'shop'});s.frames.shift()();assert.equal(s.cameras[1].aspect,96/128);
});
test('head and tail views frame the real geometry from distinct sides',()=>{
 const s=setup();s.request({},'full');s.frames.shift()();s.request({},'head');s.frames.shift()();s.request({},'back');s.frames.shift()();
 assert(s.cameras[1].position.y>s.cameras[0].position.y);assert(s.cameras[2].position.z<0);assert(s.cameras[0].position.z>0);
});
test('WebGL failure uses the retained fallback without retrying context allocation for every card',()=>{
 const s=setup(true);s.request({ears:'cat'});s.frames.shift()();s.request({ears:'fox'});s.frames.shift()();assert.equal(s.fallbacks(),2);assert.equal(s.contexts(),1);
});
test('thumbnail module is deployed before studio requests and forces 3D only for preview builds',()=>{
 const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('ui.js','utf8');assert(html.indexOf('src="character-thumbnails.js')<html.indexOf('src="character-studio.js'));
 assert(ui.includes("kind==='studio-thumbnail'||!!saveState.model3D"));
 for(const file of ['.cpanel.yml','deploy.ps1'])assert(fs.readFileSync(file,'utf8').includes('character-thumbnails.js'));
});
