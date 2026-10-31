const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const ui=fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8');
test('temporary rollout blocks the legacy mode toggle without changing the saved preference',()=>{
 const c=vm.createContext({window:{},TWO_D_MODE_AVAILABLE:false,saveState:{model3D:true,preferredModel3D:false},document:{getElementById:()=>null}});
 vm.runInContext(ui.slice(ui.indexOf('function update3DColorControls()'),ui.indexOf('function updatePerformanceUI()')),c);c.window.toggleCharacterModels();assert.equal(c.saveState.model3D,true);assert.equal(c.saveState.preferredModel3D,false);
});
test('old 2D preferences load into 3D while retained for restoring 2D later',()=>{
 const start=ui.indexOf('            const savedModelPreference='),end=ui.indexOf('            if(window.Housing)',start);
 const code=ui.slice(start,end);
 for(const saved of [{model3D:false},{preferredModel3D:false,model3D:true},{}]){
  const c=vm.createContext({d:saved,saveState:{},TWO_D_MODE_AVAILABLE:false});vm.runInContext(code,c);assert.equal(c.saveState.model3D,true);assert.equal(c.saveState.preferredModel3D,saved.model3D===undefined&&saved.preferredModel3D===undefined?true:false);
  c.TWO_D_MODE_AVAILABLE=true;c.d={...c.saveState};vm.runInContext('{'+code+'}',c);assert.equal(c.saveState.model3D,c.saveState.preferredModel3D);
 }
});
test('character artwork is drawn natively at 3x while preserving logical coordinates',()=>{
 const calls=[],ctx={scale:(...args)=>calls.push(args),translate(){}};const canvas={getContext:()=>ctx};const noop=()=>{};
 const c=vm.createContext({THREE,document:{createElement:()=>canvas},drawSpecies:noop,drawBodyPaint:noop,drawShirt:noop,drawPants:noop,drawCollar:noop,drawHair:noop,drawTalkingMouth:noop,drawEyes:noop,drawHat:noop,addSpriteOutline:noop});
 const start=ui.indexOf('function createSpeciesTexture('),end=ui.indexOf('function createFishTexture(',start);vm.runInContext(ui.slice(start,end),c);const texture=c.createSpeciesTexture({eyes:'standard'},'#abcdef','#ffffff',false);assert.equal(texture.image.width,192);assert.equal(texture.image.height,282);assert.deepEqual(calls[0],[3,3]);texture.dispose();
});
