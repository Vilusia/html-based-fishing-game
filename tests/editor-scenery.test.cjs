const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),THREE=require('../vendor/three.min.js');
const source=fs.readFileSync(path.join(__dirname,'../worldgen.js'),'utf8');
function setup(){
 const c=vm.createContext({THREE,window:{},document:{createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}}),width:1,height:1})}});
 vm.runInContext(source,c);return c.window.WorldGen;
}
function triangles(mesh){
 let count=0;mesh.traverse(o=>{if(!o.geometry)return;const g=o.geometry;count+=g.index?g.index.count/3:g.attributes.position.count/3;});return count;
}
function dispose(mesh){mesh.traverse(o=>{if(o.geometry)o.geometry.dispose();});}
test('the editor exposes a large, unique building and prop catalog',()=>{
 const WG=setup(),buildingIds=WG.BUILDING_TYPES.map(v=>v.id),propIds=WG.PROP_TYPES.map(v=>v.id);
 assert(buildingIds.length>=28,buildingIds.length+' buildings');assert(propIds.length>=50,propIds.length+' props');
 assert.equal(new Set(buildingIds).size,buildingIds.length);assert.equal(new Set(propIds).size,propIds.length);
 for(const list of [WG.BUILDING_TYPES,WG.PROP_TYPES])for(const item of list){assert(item.name&&Number.isFinite(item.radius)&&item.radius>=0,item.id);assert(/^#[0-9a-f]{6}$/.test('#'+Number(item.color).toString(16).padStart(6,'0')),item.id+' color');}
 for(const id of ['cottage','tavern','chapel','barn','stable','forge','bakery','gazebo','ruins','treehouse','boathouse','pier'])assert(buildingIds.includes(id),id);
 for(const id of ['pine_tree','palm_tree','boulder','picnic_table','well','fountain','statue','wagon','canoe','buoy','net_rack','fish_rack','crab_trap','anvil','firewood','pottery'])assert(propIds.includes(id),id);
});
test('every editor building and prop produces finite low-poly geometry',()=>{
 const WG=setup();let builds=0;
 for(const item of WG.BUILDING_TYPES){const mesh=WG.makeBuilding({type:item.id,scale:1,rot:.3});mesh.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(mesh),tris=triangles(mesh);assert(tris>0,item.id+' has geometry');assert(tris<2500,item.id+' stays low-poly: '+tris);assert(!box.isEmpty()&&[box.min.x,box.min.y,box.min.z,box.max.x,box.max.y,box.max.z].every(Number.isFinite),item.id+' bounds');dispose(mesh);builds++;}
 for(const item of WG.PROP_TYPES){const mesh=WG.makeProp({type:item.id,scale:1,rot:.3});mesh.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(mesh),tris=triangles(mesh);assert(tris>0,item.id+' has geometry');assert(tris<1200,item.id+' stays low-poly: '+tris);assert(!box.isEmpty()&&[box.min.x,box.min.y,box.min.z,box.max.x,box.max.y,box.max.z].every(Number.isFinite),item.id+' bounds');dispose(mesh);builds++;}
 assert(builds>=78);
});
test('new scenery includes water placement and editor-facing categories',()=>{
 const WG=setup(),water=[...WG.BUILDING_TYPES,...WG.PROP_TYPES].filter(v=>v.water).map(v=>v.id);
 for(const id of ['boathouse','pier','canoe','buoy','crab_trap','lily_pads','cattails','driftwood'])assert(water.includes(id),id);
 const editor=fs.readFileSync(path.join(__dirname,'../editor.js'),'utf8');assert(editor.includes('WorldGen.BUILDING_TYPES')&&editor.includes('WorldGen.PROP_TYPES'));
 for(const kind of ['prop','building','npc','tree','rock','cave'])assert(editor.includes('scan(lv.'+kind+'s'),kind);
 assert(editor.includes('bestKind === "building" ? WorldGen.buildingInfo(best.type).name'));
 assert(editor.includes('bestKind === "rock"'));
});
