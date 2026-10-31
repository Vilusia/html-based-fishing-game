const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),THREE=require('../vendor/three.min.js');
const props=fs.readFileSync(require.resolve('../props.js'),'utf8'),code=fs.readFileSync(require.resolve('../outdoor-props.js'),'utf8');
test('the previous unrotated rebuild reproduces the backing covering the video plane',()=>{
 const c=vm.createContext({THREE});vm.runInContext(code.replace("if(type==='screen')g.rotation.y=Math.PI;",''),c);const model=c.buildOutdoorProp('screen');model.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(0,3.55,-10.22),new THREE.Vector3(0,0,1));assert(ray.intersectObject(model,true)[0].distance<10,'old backing sat in front of the video plane');
});
test('outdoor screen housing stays behind the video cutout throughout the aperture at every placement rotation',()=>{
 const c=vm.createContext({THREE});vm.runInContext(code,c);
 // Read the same layout defaults used by both Twitch and YouTube positioning.
 vm.runInContext(props.slice(props.indexOf('const PANEL_Y ='),props.indexOf('// Show the video only from the front.',props.indexOf('const PANEL_Y ='))),c);
 const layout=vm.runInContext('({y:PANEL_Y,w:PANEL_W,h:PANEL_H,forward:VIDEO_FORWARD})',c);
 for(const rotation of [0,Math.PI/2,Math.PI,1.37]){
  const root=new THREE.Group(),screen=c.buildOutdoorProp('screen');root.add(screen);root.position.set(12,2,-5);root.rotation.y=rotation;root.updateMatrixWorld(true);
  for(const x of [-.4,0,.4])for(const y of [-.4,0,.4]){
   const point=new THREE.Vector3(x*layout.w,layout.y+y*layout.h,-layout.forward).applyMatrix4(root.matrixWorld),normal=new THREE.Vector3(0,0,-1).transformDirection(root.matrixWorld);
   const camera=point.clone().addScaledVector(normal,10),ray=new THREE.Raycaster(camera,normal.clone().negate()),hits=ray.intersectObject(screen,true);
   assert(hits.length,'screen has an opaque housing behind its video');assert(hits[0].distance>10.001,'backing must not block the video depth punch at '+rotation+' / '+x+','+y);
  }
 }
});
test('Twitch and YouTube still use the same outdoor video-facing defaults while house TV orientation is separate',()=>{
 assert(props.includes('const yawOffset = options.yawOffset !== undefined ? options.yawOffset : Math.PI;'));
 assert(props.includes('const ry = screenYaw(e);'));assert(props.includes('punchMesh.rotation.y = ry;'));assert(props.includes('yawOffset: 0'));
});
