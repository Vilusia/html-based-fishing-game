const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const c=vm.createContext({THREE,window:{}});vm.runInContext(fs.readFileSync('character3d.js','utf8'),c);
function build(eye,misc='protogen_visor',ears='protogen'){
 const tex=()=>new THREE.Texture();return c.window.Character3D.buildCharacter({eye},{base:'#df513b',belly:'#eeeeff',pc:{miscColor:'#445566'},parts:{ears,eyes:'standard',nose:'protogen',tail:'none',misc}},{headFront:tex(),headBack:tex(),torsoFront:tex(),torsoBack:tex()});
}
test('legacy Extras selection builds two colored side screens and solid rear fins without covering the face',()=>{
 for(const eye of ['#13ddaa','#ff2277','#000000']){
  const body=build(eye),parts={};body.userData.modelSources.traverse(m=>{(parts[m.name]??=[]).push(m);});
  for(const name of ['protogenSideRing','protogenSideRim','protogenSideScreen','protogenSideFin'])assert.equal(parts[name].length,2,name);
  assert(!body.getObjectByName('visor'));assert(body.getObjectByName('protogenScreen'));
  for(const screen of parts.protogenSideScreen){assert.equal(screen.material.color.getHexString(),eye.slice(1));assert(Math.abs(screen.position.x)>.7);}
  for(const fin of parts.protogenSideFin){fin.geometry.computeBoundingBox();assert(fin.geometry.boundingBox.max.z<0);assert(fin.geometry.attributes.position.count>=24);assert.equal(fin.material.color.getHexString(),'445566');}
  const ear=body.getObjectByName('ear');ear.geometry.computeBoundingBox();assert(ear.geometry.boundingBox.max.y-ear.geometry.boundingBox.min.y>.9);
 }
 assert(!build('#fff','none').getObjectByName('protogenSideScreen'));
});
test('ear inset vertices are on the actual shell rather than a detached cone or ball',()=>{
 for(const species of ['cat','fox','wolf','bat','mouse','bear','bunny','dog','protogen']){
  const body=build('#33ffaa','none',species),parts=body.userData.modelSources,outer=[],inner=[];parts.updateMatrixWorld(true);
  parts.traverse(m=>{if(m.name==='ear')outer.push(m);if(m.name==='innerEar')inner.push(m);});
  for(let n=0;n<inner.length;n++){
   const shell=outer[n],patch=inner[n],p=patch.geometry.attributes.position;
   const ray=new THREE.Raycaster();
   for(let i=0;i<p.count;i++){
    const point=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(patch.matrixWorld);
    let hit=null;
    // Low-poly cone ears have a vertical seam; nudge across it before failing.
    for(const offset of [0,.006,-.006,.012,-.012]){
     ray.set(new THREE.Vector3(point.x+offset,point.y,5),new THREE.Vector3(0,0,-1));
     hit=ray.intersectObject(shell)[0];if(hit)break;
    }
    assert(hit,species+' patch extends outside shell');
    assert(Math.abs(point.z-hit.point.z)<.012,species+' patch floats ahead of shell');
   }
  }
 }
});
test('retained sprite draws eye-colored side circles on both views, and Extras keeps its saved id',()=>{
 const source=fs.readFileSync('ui.js','utf8'),a=source.indexOf('function drawMisc('),b=source.indexOf('\nfunction ',a+10),fills=[];
 const ctx={beginPath(){},moveTo(){},lineTo(){},closePath(){},ellipse(){},fill(){fills.push(this.fillStyle);}};
 const context=vm.createContext({shadeColor:c=>c});vm.runInContext(source.slice(a,b),context);
 for(const back of [true,false]){fills.length=0;context.drawMisc(ctx,'protogen_visor','#445566','#fff',back,'#dd22ee');assert.equal(fills.filter(x=>x==='#dd22ee').length,2);}
 assert(fs.readFileSync('core.js','utf8').includes("id: 'protogen_visor', name: 'Protogen Side Circles & Fins'"));
});
