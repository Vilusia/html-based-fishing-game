const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'ui.js'),'utf8');
const types={merchant:'npcMerchant',stylist:'npcStylist',bait:'npcBait',tutorial:'npcTutorial',lava:'npcLavaKeeper',fisher:'npcFisher',scratch:'npcScratch'};
const angles=[0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI,-Math.PI/4,-Math.PI/2,Math.PI*2];
function assertFacing(mesh,angle){const forward=mesh.getWorldDirection(new THREE.Vector3()),expected=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));assert(forward.distanceTo(expected)<1e-8,'world facing '+forward.toArray()+' must match editor yaw '+angle);const up=new THREE.Vector3(0,1,0).applyQuaternion(mesh.quaternion);assert(up.distanceTo(new THREE.Vector3(0,1,0))<1e-8,'NPC must stay upright');}
function character(){const mesh=new THREE.Group(),rod=new THREE.Group();rod.name='rod';mesh.add(rod);return mesh;}
test('every standard NPC uses the editor facing across all quadrants after default lookAt placement',()=>{
 for(const rot of angles){const npcs=Object.keys(types).map((type,i)=>({type,x:10+i*3,z:-20+i,rot})),c=vm.createContext({THREE,LAKE_RADIUS:20,window:{CUSTOM_LEVEL:{npcs},Level:{sampleHeight:()=>2}},scene:new THREE.Scene(),createPlayerMesh:character,addIcon(){}});
 vm.runInContext(source.slice(source.indexOf('function getDefaultNpcSpawns()'),source.indexOf('function isDefaultNpcAreaClear(')),c);
 vm.runInContext(source.slice(source.indexOf('function createNPCs()'),source.indexOf('function addIcon(')),c);c.createNPCs();
 for(const [type,name]of Object.entries(types)){assertFacing(c[name],rot);assert.equal(c[name].position.y,2,type);}
 }
});
test('boat captains discard inherited pitch and roll before applying an editor facing',()=>{
 for(const rot of angles){const c=vm.createContext({THREE,window:{CUSTOM_LEVEL:{npcs:[{type:'boatmaster',x:0,z:0,rot}]},Level:{sampleHeight:()=>0}},staticColliders:[],disposeCharacterBody(){},createPlayerMesh(){const mesh=character();mesh.rotation.set(Math.PI,.4,Math.PI);return mesh;}});vm.runInContext(fs.readFileSync(path.join(root,'boats.js'),'utf8'),c);const scene=new THREE.Scene();c.window.Boats.setup(scene);assertFacing(scene.children[0],rot);}
});
