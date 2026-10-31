const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const rules=require('../protogen-logo.js');
function sign(){const bits=new Uint8Array(1024);rules.stroke(bits,{x:8,y:24},{x:16,y:7},1.5,1);rules.stroke(bits,{x:16,y:7},{x:24,y:24},1.5,1);return rules.encode(bits);}
test('bounded pixel signs round-trip, clip to the circle and erase without storing images or URLs',()=>{
 const code=sign();assert.equal(code.length,256);assert.match(code,/^[0-9a-f]{256}$/);assert.equal(rules.encode(rules.decode(code)),code);
 for(const input of [null,{},'https://example.com/a.png','<svg>', 'f'.repeat(257),'g'.repeat(256),'0'.repeat(256)])assert.equal(rules.normalize(input),'');
 const bits=new Uint8Array(1024);rules.paint(bits,0,0,1,1);assert.equal(rules.encode(bits),'');rules.paint(bits,16,16,2,1);assert(rules.encode(bits));rules.paint(bits,16,16,2,0);assert.equal(rules.encode(bits),'');
});
test('2D sign rendering clips to the inner circle and uses selected eye ink',()=>{
 const fills=[],ctx={save(){},restore(){},beginPath(){},ellipse(){},clip(){},fillRect(){fills.push(this.fillStyle);}};
 assert(rules.draw(ctx,sign(),'#12ed34',12,21,3,4));assert.equal(fills[0],'#101923');assert(fills.slice(1).every(x=>x==='#12ed34'));assert(!rules.draw(ctx,'','#12ed34',12,21,3,4));
});
test('both 3D side circles use an upright outward-facing sign texture without increasing per-pixel geometry',()=>{
 const c=vm.createContext({window:{ProtogenLogo:rules},THREE});vm.runInContext(fs.readFileSync('character3d.js','utf8'),c);
 const tex=()=>new THREE.Texture(),assets=()=>({headFront:tex(),headBack:tex(),torsoFront:tex(),torsoBack:tex()});
 const build=(code,misc='protogen_visor')=>c.window.Character3D.buildCharacter({eye:'#12ed34',protogenLogo:code},{base:'#ffffff',belly:'#ffaaaa',pc:{},parts:{ears:'protogen',eyes:'standard',nose:'protogen',tail:'none',misc}},assets());
 const model=build(sign()),discs=[];model.userData.modelSources.traverse(o=>{if(o.name==='protogenSign')discs.push(o);});assert.equal(discs.length,2);assert.equal(discs[0].material.map,discs[1].material.map);
 for(const disc of discs){assert.equal(disc.rotation.y,Math.sign(disc.position.x)*Math.PI/2);assert(disc.geometry.attributes.position.count<=48);const data=disc.material.map.image.data;let ink=0,dark=0;for(let i=0;i<data.length;i+=4){if(data[i]===18&&data[i+1]===237&&data[i+2]===52)ink++;if(data[i]===16&&data[i+1]===25&&data[i+2]===35)dark++;}assert(ink>20);assert(dark>20);}
 assert(!build('').getObjectByName('protogenSign'));assert(!build(sign(),'none').getObjectByName('protogenSign'));assert(!build('https://evil.example/logo').getObjectByName('protogenSign'));
});
test('saved and received signs reach character configs and both renderer paths',()=>{
 const ui=fs.readFileSync('ui.js','utf8'),c=vm.createContext({window:{ProtogenLogo:rules},saveState:{protogenLogo:sign()}});
 const a=ui.indexOf('function characterCfgFromSave('),b=ui.indexOf('function createPlayerMesh(',a);vm.runInContext(ui.slice(a,b),c);
 assert.equal(c.characterCfgFromSave().protogenLogo,sign());assert.equal(c.characterCfgFromData({protogenLogo:sign()}).protogenLogo,sign());assert.equal(c.characterCfgFromData({protogenLogo:'bad'}).protogenLogo,'');
 assert(ui.includes('myData.protogenLogo='));assert(ui.includes('normalize(d.protogenLogo)'));assert(ui.includes('normalize(outfit.protogenLogo)'));assert(ui.includes('normalize(p.lastData.protogenLogo)'));assert(ui.includes('back, eyeCol,pc.protogenLogo)'));
});
test('network validation rejects oversized/invalid patterns before gameplay',()=>{
 const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('network-guard.js','utf8'),c);const packetCost=c.window.NetworkGuardRules.packetCost;
 const packet=logo=>({type:'update',payload:{pos:{x:0,y:0,z:0},protogenLogo:logo}});
 assert.notEqual(packetCost(packet(sign())),null);assert.notEqual(packetCost(packet('')),null);assert.equal(packetCost(packet('f'.repeat(257))),null);assert.equal(packetCost(packet('https://evil.example/a.png')),null);
});
test('editor stays alongside Extras only for the matching selection and is deployed before rendering code',()=>{
 const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('ui.js','utf8');assert(html.includes('id="protogen-logo-row" hidden'));assert(html.indexOf('id="protogen-logo-row"')>html.indexOf('id="misc-select"'));assert(html.indexOf('id="protogen-logo-row"')<html.indexOf('id="tail-select"'));
 const module=fs.readFileSync('protogen-logo.js','utf8');assert(module.includes("row.hidden=saveState.currentMisc!=='protogen_visor'"));assert(module.includes('pointermove'));assert(module.includes('pointercancel'));assert(module.includes('setPointerCapture'));assert(ui.includes("getElementById('protogen-logo-editor')?.open"));
 for(const file of ['index.html','.cpanel.yml','deploy.ps1']){const text=fs.readFileSync(file,'utf8');assert(text.includes('protogen-logo.js'));assert(text.includes('protogen-logo.css'));}
 assert(html.indexOf('src="protogen-logo.js')<html.indexOf('src="character3d.js'));
});
