const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const source=fs.readFileSync(path.join(__dirname,'../shop-preview.js'),'utf8');
function setup(){
 let renders=0,built=0,freed=0,disposed=0,lost=0;const handlers={},captures=new Set(),models=[];
 const canvas={setAttribute(){},classList:{add(){},remove(){}},focus(){},addEventListener:(name,fn)=>handlers[name]=fn,setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
 const host={clientWidth:220,clientHeight:280,replaceChildren(){}};
 class Renderer{constructor(){this.domElement=canvas;}setPixelRatio(){}setClearColor(){}setSize(){}render(scene,camera){renders++;models.push({model:scene.children[0],camera});}dispose(){disposed++;}forceContextLoss(){lost++;}}
 const c=vm.createContext({window:{devicePixelRatio:1},THREE:{...THREE,WebGLRenderer:Renderer},document:{getElementById:()=>host},console,ResizeObserver:class{observe(){}disconnect(){}}});vm.runInContext(source,c);
 const viewer=c.window.ShopCharacterPreview,build=cfg=>{built++;const b=new THREE.Group();b.position.y=1.46875;const mesh=new THREE.Mesh(new THREE.BoxGeometry(cfg.wide?4:1,3,2),new THREE.MeshBasicMaterial());b.add(mesh);return b;},dispose=()=>freed++;
 const update=cfg=>viewer.update(cfg,build,dispose),event=extra=>({pointerId:7,button:0,clientX:10,clientY:10,preventDefault(){},stopPropagation(){},...extra});
 return {viewer,update,handlers,event,models,counts:()=>({renders,built,freed,disposed,lost})};
}
test('outfit changes rebuild once, retain rotation, and fit wide accessories',()=>{
 const s=setup();assert(s.update({}));s.handlers.pointerdown(s.event());s.handlers.pointermove(s.event({clientX:70,clientY:30}));s.handlers.pointerup(s.event());const rotated=s.models.at(-1).model.rotation.y;assert(rotated>.35);
 s.update({});assert.equal(s.counts().built,1);s.update({wide:true});assert.equal(s.counts().built,2);assert.equal(s.counts().freed,1);assert.equal(s.models.at(-1).model.rotation.y,rotated);assert(s.models.at(-1).camera.position.z>4);
 s.viewer.destroy();assert.equal(s.counts().freed,2);assert.equal(s.counts().disposed,1);assert.equal(s.counts().lost,1);s.viewer.destroy();assert.equal(s.counts().disposed,1);
});
test('only left dragging rotates, and release stops rotation',()=>{
 const s=setup();s.update({});const yaw=()=>s.models.at(-1).model.rotation.y;s.handlers.pointerdown(s.event({button:2}));s.handlers.pointermove(s.event({clientX:100}));assert.equal(yaw(),.35);
 s.handlers.pointerdown(s.event());s.handlers.pointermove(s.event({clientX:40,clientY:900}));assert.equal(s.models.at(-1).model.rotation.x,.55);const after=yaw();s.handlers.pointercancel(s.event());s.handlers.pointermove(s.event({clientX:100}));assert.equal(yaw(),after);s.viewer.destroy();
});
test('viewer is packaged for both deployment methods and uses the 3D preview only',()=>{
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const id of ['preview-3d','preview-3d-hint'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.equal((html.match(/id="preview-2d"/g)||[]).length,0);
 assert(html.includes('shop-preview.js?v='));for(const file of ['.cpanel.yml','deploy.ps1'])assert(fs.readFileSync(path.join(root,file),'utf8').includes('shop-preview.js'));
});
test('studio camera presets and zoom change framing without rebuilding the model',()=>{
 const s=setup();s.update({});const count=s.models.length;
 s.viewer.setView('face');const camera=s.models.at(-1).camera;assert(camera.position.y>0);const faceDistance=camera.position.z;
 s.viewer.setView('full');assert.equal(camera.position.y,0);assert(camera.position.z>faceDistance);
 s.viewer.setView('back');assert.equal(s.models.at(-1).model.rotation.y,Math.PI);
 for(let i=0;i<30;i++)s.viewer.setView('in');assert(Number.isFinite(camera.position.z)&&camera.position.z>0);assert(s.models.length>count);
 s.viewer.destroy();assert.equal(s.viewer.setView('front'),false);
});
