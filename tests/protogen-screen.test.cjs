const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),THREE=require('../vendor/three.min.js');
test('protogen nose builds a full visor with eye-colored mouth and blinkable screen',()=>{
 const c=vm.createContext({THREE,window:{}});vm.runInContext(fs.readFileSync('character3d.js','utf8'),c);
 const tex=()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);
 for(const eye of ['#12edbc','#ee2288','#000000']){
  const assets={headFront:tex(),headBlink:tex(),headBack:tex(),torsoFront:tex(),torsoBack:tex()};
  const body=c.window.Character3D.buildCharacter({eye},{base:'#ffffff',belly:'#ffffff',pc:{noseColor:'#ff0000'},parts:{nose:'protogen',eyes:'standard',ears:'protogen',tail:'none',misc:'none'}},assets);
  const visor=body.getObjectByName('protogenScreen'),mouth=body.userData.mouth;
  assert(visor);visor.geometry.computeBoundingBox();const size=visor.geometry.boundingBox.getSize(new THREE.Vector3());assert(size.x>1.2);assert(size.z>.9);
  assert.equal(mouth.material.color.getHexString(),eye.slice(1));
  assert(mouth.position.z>visor.position.z+size.z/2);
  assert(body.userData.blinkBatches.length);c.window.Character3D.setBlink(body,true);c.window.Character3D.setBlink(body,false);
 }
});
test('sprite screen eyes and mouth both use selected eye ink',()=>{
 const ui=fs.readFileSync('ui.js','utf8'),start=ui.indexOf('function drawProtogenFace('),end=ui.indexOf('function drawSpecies(',start);
 const inks=[],ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},fill(){},stroke(){inks.push(this.strokeStyle)},ellipse(){}};
 const c=vm.createContext({Math});vm.runInContext(ui.slice(start,end),c);
 for(const closed of [false,true])for(const talking of [false,true]){
  inks.length=0;c.drawProtogenFace(ctx,'#ee2288',closed,talking);assert.deepEqual(inks.slice(1),['#ee2288','#ee2288','#ee2288']);
 }
});
test('solid visor paints the entire face crop dark before screen details',()=>{
 const ui=fs.readFileSync('ui.js','utf8'),start=ui.indexOf('function drawProtogenFace('),end=ui.indexOf('function drawSpecies(',start),fills=[];
 const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},fill(){},stroke(){},ellipse(){},fillRect(...rect){fills.push([this.fillStyle,...rect]);}};
 const c=vm.createContext({Math});vm.runInContext(ui.slice(start,end),c);
 c.drawProtogenFace(ctx,'#22ff00',false,false,false,true);
 assert.deepEqual(fills,[['#101923',16,8,32,26]]);
 fills.length=0;c.drawProtogenFace(ctx,'#22ff00',false,false,true,false);
 assert.deepEqual(fills,[],'sprite mode retains its shaped visor and surrounding fur');
});