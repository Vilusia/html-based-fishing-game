const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ui=fs.readFileSync('ui.js','utf8'),html=fs.readFileSync('index.html','utf8'),loader=fs.readFileSync('level-loader.js','utf8');
function pathRules(){
 const start=ui.indexOf('const DEFAULT_PATH_RING'),end=ui.indexOf('function generateWorld(',start),c=vm.createContext({});
 vm.runInContext(ui.slice(start,end),c);return c;
}
test('default island path network covers the lake, dock, ponds, cave, house and Void route',()=>{
 const c=pathRules(),rules=vm.runInContext('({paths:DEFAULT_PATHS,ring:DEFAULT_PATH_RING,benches:DEFAULT_BENCHES})',c);assert.equal(rules.paths.length,8);assert.equal(rules.ring.length,33);assert.equal(rules.benches.length,6);for(const bench of rules.benches)assert(!c.isOnDefaultPath(bench.x,bench.z,1.8),`bench blocks the path at ${bench.x},${bench.z}`);
 for(const [x,z] of [[0,50],[0,-45],[-45,-14],[41,29],[-34,19],[48,-30]])assert(c.isOnDefaultPath(x,z),`missing path at ${x},${z}`);
 assert(!c.isOnDefaultPath(75,75));assert(!c.isOnDefaultPath(0,0));
});
test('default map refresh builds shared-style paths, ponds, cave dressing, shrines and exits',()=>{
 for(const marker of ['function createPathRibbon(','function createDefaultIslandDecor(','createDefaultIslandDecor();','function createVoidShrine(','function createLavaShrine(','addLilyPads(0, 0, 20','addPondGlow(-60, -30, 10','addPondGlow(60, 50, 14','addCaveDecor();','spawnPortal(x, z, false, true)','createLavaShrine(16, 16)','createVoidShrine(86, -58)'])assert(ui.includes(marker),marker);
 assert(ui.includes('if(!window.CUSTOM_LEVEL && !voidPortalMesh && !(window.Housing && Housing.inside))spawnPortal(86,-58,false,true);'));
 assert(ui.includes('voidExitPortalMesh.position.set(10000,2000.25,10000+32)'));
 assert(ui.includes('lavaExitPortalMesh.position.set(-19950,.25,0)'));
 assert(ui.includes("house.position.set(-40,0,10);house.name='playerHouseExterior'"));
 for(const npc of ['npcMerchant','npcStylist','npcBait','npcTutorial','npcLavaKeeper','npcFisher','npcScratch'])assert(ui.includes(npc),npc);
 assert(ui.includes('window.Halloween?.spawn(scene)')&&ui.includes('window.Boats?.setup(scene)'));
});
test('default map refresh is listed in the player patch notes',()=>{
 assert(html.includes('Default island refresh:'));
 assert(html.includes('central lake')&&html.includes('light pond')&&html.includes('dark pond'));
});
test('clearing a custom level evicts stored level state and cache-busts the default reload',()=>{
 assert(loader.includes('sessionStorage.removeItem("htmlfishing.level.hash")'));
 assert(loader.includes('function reloadDefault() { location.replace("index.html?default=" + Date.now()); }'));
 assert(loader.includes('setTimeout(reloadDefault, 300)'));
 assert(html.includes('level-loader.js?v=104'));
});
