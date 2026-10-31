const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const THREE = require('../vendor/three.min.js');
const furnitureSource = fs.readFileSync(path.join(__dirname,'../furniture.js'),'utf8');
const housingSource = fs.readFileSync(path.join(__dirname,'../housing.js'),'utf8');
function runtime() {
    const element=()=>({style:{},dataset:{},attributes:{},children:[],appendChild(node){this.children.push(node);},replaceChildren(){this.children=[];},get firstElementChild(){return this.children[0];},setAttribute(key,value){this.attributes[key]=value;},getContext(){return new Proxy({},{get:()=>()=>{}});},getBoundingClientRect(){return {left:0,top:0,width:660,height:540};},setPointerCapture(){this.captured=true;},hasPointerCapture(){return this.captured;},releasePointerCapture(){this.captured=false;}});
    const scene=new THREE.Scene(), player=new THREE.Group();scene.add(player);
    const sent=[];let saves=0;
    const ctx=vm.createContext({THREE,window:{},console,Date,crypto:require('node:crypto').webcrypto,Uint32Array,
        document:{createElement:element,body:element(),addEventListener(){},getElementById(){return null;}},
        scene,player,playerVelocity:new THREE.Vector3(),knockbackVelocity:new THREE.Vector3(),cameraRotationY:0,cameraDistance:9,
        isProne:false,isDiving:false,isSitting:false,isSailing:false,fishingState:'idle',isHost:false,myPeerId:'owner',otherPlayers:{},hostConn:{open:true,send:m=>sent.push(m)},
        saveState:{money:40000,displayName:'Owner',keybinds:{}},saveGame(){saves++;},showToast(){},sendUpdate(){},updateWeatherVisuals(){}});
    vm.runInContext(furnitureSource,ctx);ctx.Furniture=ctx.window.Furniture;
    vm.runInContext(housingSource.replace('    window.Housing = {',`    window.TestHouse = { makeRoom, openFurniture, startPlacement, rotateFurniture, commitFurniture, enter(owner,house){nearby={};enter(owner,house,'token');} };
    window.Housing = {`),ctx);
    return {ctx,F:ctx.Furniture,H:ctx.window.Housing,T:ctx.window.TestHouse,sent,saves:()=>saves};
}
const empty=()=>({name:'Test',furniture:[],inventory:[]});
test('paid interior upgrades preserve furniture, move wall mounts, and survive save normalization',()=>{
    const {F,H}=runtime();let house=empty();house.inventory=[{id:'tv',type:'wall_tv'},{id:'chair',type:'chair'}];
    house=F.place(house,'tv',{wall:'back',x:0}).house;house=F.place(house,'chair',{x:3,z:0}).house;
    assert(!F.upgradeHouse(house,9999).ok);assert(!F.upgradeHouse(house,Infinity).ok);
    const upgraded=F.upgradeHouse(house,40000);assert(upgraded.ok);assert.equal(upgraded.money,30000);assert.equal(house.sizeTier,undefined);
    house=H.normalize(JSON.parse(JSON.stringify(upgraded.house)));assert.equal(house.sizeTier,1);assert.equal(house.furniture.find(v=>v.id==='chair').x,3);assert.equal(house.furniture.find(v=>v.id==='tv').z,-6.9);
    house.inventory.push({id:'outer',type:'chair'});assert(F.place(house,'outer',{x:7,z:0}).ok);assert(!F.place({...house,sizeTier:0},'outer',{x:7,z:0}).ok);
    house=F.place(house,'outer',{x:7,z:0}).house;assert.equal(H.normalize(JSON.parse(JSON.stringify(house))).furniture.find(v=>v.id==='outer').x,7);
    const grand=F.upgradeHouse(house,30000);assert(grand.ok);assert.equal(grand.money,5000);assert.equal(grand.house.sizeTier,2);assert(!F.upgradeHouse(grand.house,999999).ok);
    assert.equal(H.normalize({sizeTier:99}).sizeTier,0);assert.equal(H.normalize({sizeTier:1.5}).sizeTier,0);
});
test('bought walls block walking and rotated doorways have a real open passage',()=>{
    const {F}=runtime();let house=empty();let purchase=F.buy(house,1000,'room_doorway','door');assert(purchase.ok);assert.equal(purchase.money,400);
    house=F.place(purchase.house,'door',{x:0,z:0}).house;
    assert(!F.collision(house.furniture,0,0));assert(F.collision(house.furniture,1.2,0));
    house=F.move(house,'door',{x:0,z:0,rot:Math.PI/2}).house;
    assert(!F.collision(house.furniture,0,0));assert(F.collision(house.furniture,0,1.2));
    assert(!F.place({...empty(),inventory:[{id:'wall',type:'room_wall'}]},'wall',{x:0,z:3.5}).ok,'protect exit');
    const wall=F.place({...empty(),inventory:[{id:'wall',type:'room_wall'}]},'wall',{x:0,z:0});assert(wall.ok);assert(F.collision(wall.house.furniture,0,0));
    const stored=F.store(house,'door');assert(stored.ok);assert.equal(stored.house.inventory[0].type,'room_doorway');
});
test('live upgrade rebuilds only interior, saves, syncs, and keeps player and visitors attached',()=>{
    const {ctx,F,H,T,sent,saves}=runtime();T.enter('owner',empty());const exterior=ctx.scene,old=H.renderScene;
    const visitor=new THREE.Group();old.add(visitor);ctx.otherPlayers.guest={mesh:visitor,lastData:{houseOwner:'owner'}};
    const position=ctx.player.position.clone();assert(T.commitFurniture(F.upgradeHouse(ctx.saveState.house||H.normalize(empty()),40000)));
    assert.notEqual(H.renderScene,old);assert.equal(ctx.scene,exterior);assert.equal(ctx.player.parent,H.renderScene);assert.equal(visitor.parent,H.renderScene);assert(ctx.player.position.equals(position));assert.equal(saves(),1);
    const update=sent.filter(m=>m.type==='house:update').at(-1);assert.equal(update.house.sizeTier,1);assert.equal(update.house.inventory.length,0);
    assert(H.canStand({x:30007,y:0,z:30000}));
    ctx.player.position.set(30020,0,30020);H.clampPlayer();assert.equal(ctx.player.position.x,30008.45);
    H.leave();assert.equal(ctx.player.parent,exterior);
    T.enter('someone-else',{...empty(),sizeTier:1});const oldGuest=H.renderScene;
    H.handleHost({type:'house:update',owner:'someone-else',house:{...empty(),sizeTier:2,furniture:[{id:'door',type:'room_doorway',x:0,z:0,rot:0}]}});
    assert.notEqual(H.renderScene,oldGuest);assert.equal(ctx.player.parent,H.renderScene);assert(H.canStand({x:30010,y:0,z:30000}));assert(H.canStand({x:30000,y:0,z:30000}));assert(!H.canStand({x:30001.2,y:0,z:30000}));
    assert(!T.commitFurniture(F.upgradeHouse(empty(),40000)),'visitor cannot buy upgrades for owner');
});
test('host validates expanded movement against owner snapshot and forwards room building saves only from owner',()=>{
    const {ctx,H}=runtime();const inbox=[],online=new Set(['owner','guest','stranger']);let now=10000;
    const {HouseRouter,ORIGIN}=ctx.window.HouseProtocol;
    const router=new HouseRouter({now:()=>now,online:id=>online.has(id),name:id=>id,token:()=> 'grant',deliver:(id,msg)=>inbox.push({id,msg})});
    router.receive('guest',{type:'house:request',owner:'owner'});const request=inbox.find(v=>v.id==='owner').msg;
    router.receive('owner',{type:'house:decision',requestId:request.requestId,accept:true,house:empty()});
    const presence={pos:{x:ORIGIN+10,y:0,z:ORIGIN},houseOwner:'owner',houseToken:'grant'};
    assert(!router.allowed('guest',presence));
    const expanded={...empty(),sizeTier:2,furniture:[{id:'wall',type:'room_wall',x:9,z:0,rot:0},{id:'door',type:'room_doorway',x:0,z:0,rot:0}]};
    router.receive('stranger',{type:'house:update',owner:'owner',house:expanded});assert(!router.allowed('guest',presence));
    router.receive('owner',{type:'house:update',house:expanded});assert(router.allowed('guest',presence));
    const delta=inbox.filter(v=>v.id==='guest'&&v.msg.type==='house:update').at(-1).msg;const sync={house:ctx.window.HouseProtocol.applyHousePatch(H.normalize(empty()),delta.patch)};assert.equal(sync.house.sizeTier,2);assert.equal(sync.house.furniture.length,2);assert.equal(sync.house.furniture[0].x,9);
    assert.equal(JSON.stringify(H.normalize(JSON.parse(JSON.stringify(sync.house)))),JSON.stringify(sync.house));
    assert(!router.allowed('stranger',presence));router.disconnect('owner');assert(!router.allowed('guest',presence));
});
test('room pieces snap end-to-end, around corners, and flush to every room boundary',()=>{
    const {F,H}=runtime();
    for(const sizeTier of [0,1,2]) {
        const house={...empty(),sizeTier},size=F.roomSize(house);
        for(const [x,z,rot,axis,edge] of [
            [size.width/2-1.8,-2,0,'x',size.width/2],[-size.width/2+1.8,-2,0,'x',-size.width/2],
            [-3,-size.depth/2+1.8,Math.PI/2,'z',-size.depth/2],[-3,size.depth/2-1.8,Math.PI/2,'z',size.depth/2],
            [-3,-size.depth/2+.5,0,'z',-size.depth/2]]) {
            const owned={...house,inventory:[{id:'w',type:'room_wall'}]};
            const placed=F.place(owned,'w',{x,z,rot});assert(placed.ok,placed.error);
            const item=placed.house.furniture[0],fp=F.footprint(item),half=axis==='x'?fp.w/2:fp.d/2;
            assert(Math.abs(fp[axis]+Math.sign(edge)*half-edge)<1e-6,'piece meets room boundary exactly');
            assert.deepEqual(JSON.parse(JSON.stringify(H.normalize(placed.house).furniture)),JSON.parse(JSON.stringify(placed.house.furniture)),'flush offset survives normalization');
        }
    }
    let house={...empty(),inventory:[{id:'a',type:'room_wall'},{id:'b',type:'room_doorway'},{id:'c',type:'room_wall'}]};
    house=F.place(house,'a',{x:0,z:0}).house;
    const preview=F.snapRoomPiece(house.furniture,{id:'b',type:'room_doorway',x:3.4,z:.2,rot:0},house);
    house=F.place(house,'b',preview).house;assert.equal(house.furniture[1].x,3);assert.equal(house.furniture[1].z,0);
    let corner=F.place(house,'c',{x:-1.5,z:-1.5,rot:Math.PI/2});assert(corner.ok,corner.error);house=corner.house;
    const a=F.footprint(house.furniture[0]),c=F.footprint(house.furniture[2]);
    const touchX=Math.abs(Math.abs(a.x-c.x)-(a.w+c.w)/2)<1e-6;
    const touchZ=Math.abs(Math.abs(a.z-c.z)-(a.d+c.d)/2)<1e-6;
    assert(touchX||touchZ,'corner has touching edges');assert(!F.overlap(a,c),'corner does not overlap');
    assert.deepEqual(JSON.parse(JSON.stringify(H.normalize(house).furniture)),JSON.parse(JSON.stringify(house.furniture)),'corner joints survive saving and sync normalization');
    const moved=F.move(house,'c',{x:-1.5,z:1.5,rot:Math.PI/2});assert(moved.ok);
    assert.deepEqual(JSON.parse(JSON.stringify(H.normalize(moved.house).furniture)),JSON.parse(JSON.stringify(moved.house.furniture)));
});
test('partition colors match chosen wall and trim and update live without remounting TVs',()=>{
    const {ctx,F,H,T}=runtime();
    const checkColors=(mesh,wall,trim)=>{
        const expected=[new THREE.Color(wall),new THREE.Color(trim)],values=mesh.geometry.attributes.color;
        for(let i=0;i<values.count;i++)assert(expected.some(c=>Math.abs(c.r-values.getX(i))<1e-6&&Math.abs(c.g-values.getY(i))<1e-6&&Math.abs(c.b-values.getZ(i))<1e-6),'only chosen wall and trim colors are used');
    };
    for(const type of ['room_wall','room_doorway'])checkColors(F.makeMesh(type,{wall:'#ffbbcc',trim:'#112233'}),'#ffbbcc','#112233');
    let mounts=0;ctx.window.attachHouseTv=()=>{mounts++;};
    const house={...empty(),wall:'#ffbbcc',trim:'#112233',furniture:[{id:'w',type:'room_wall',x:0,z:0,rot:0},{id:'tv',type:'stream_tv',x:-3,z:0,rot:0}]};
    T.enter('other',house);assert.equal(mounts,1);
    const group=H.renderScene.getObjectByName('houseFurnitureGroup'),mesh=group.children.find(m=>m.userData.furnitureId==='w');checkColors(mesh,house.wall,house.trim);
    H.handleHost({type:'house:update',owner:'other',house:{...house,wall:'#4499aa',trim:'#ffeeaa'}});
    checkColors(mesh,'#4499aa','#ffeeaa');assert.equal(mounts,1,'color update does not restart the stream player');
});
test('floor-plan grid and pointer mapping use the same room coordinates at every upgrade size',()=>{
    const {F}=runtime();
    for(const sizeTier of [0,1,2]) {
        const house={sizeTier},size=F.roomSize(house),plan=F.floorPlan(house);
        assert(plan.left>=24);assert(plan.top>=24);
        for(let x=-size.width/2;x<=size.width/2;x+=.5) {
            const point=F.planPoint(plan,plan.cx+x*plan.scale,plan.cy);
            assert(Math.abs(point.x-x)<1e-9);assert.equal(point.z,0);
        }
        for(let z=-size.depth/2;z<=size.depth/2;z+=.5) {
            const point=F.planPoint(plan,plan.cx,plan.cy+z*plan.scale);
            assert(Math.abs(point.z-z)<1e-9);assert.equal(point.x,0);
        }
        const raw=F.planPoint(plan,plan.cx+1.375*plan.scale,plan.cy+.125*plan.scale);
        assert(Math.abs(raw.x-1.375)<1e-9);assert(Math.abs(raw.z-.125)<1e-9,'cursor does not lose precise joint offsets');
    }
});
test('adjustable walls fill non-three-unit spans, keep exact joints, and retain lengths through saves and storage',()=>{
    const {F,H}=runtime();let house={...empty(),inventory:[{id:'a',type:'room_wall'},{id:'b',type:'room_wall'},{id:'c',type:'room_wall'},{id:'d',type:'room_wall'}]};
    for(const [id,z,length] of [['a',-3.5,3],['b',-.5,3],['c',2.5,3],['d',4.5,1]]) {
        const result=F.place(house,id,{x:-3,z,rot:Math.PI/2,length});assert(result.ok,result.error);house=result.house;
    }
    const last=house.furniture.find(v=>v.id==='d');assert.equal(last.length,1);assert.equal(last.z,4.5);
    const saved=H.restoreSave(JSON.parse(JSON.stringify(house)));assert.equal(saved.furniture.length,4);assert.equal(saved.furniture.find(v=>v.id==='d').length,1);
    let stored=F.store(saved,'d');assert(stored.ok);assert.equal(stored.house.inventory[0].length,1);
    const normalized=H.normalize(stored.house);assert.equal(normalized.inventory[0].length,1);
    let placed=F.place(normalized,'d',{x:-3,z:4.5,rot:Math.PI/2});assert(placed.ok);assert.equal(placed.house.furniture.find(v=>v.id==='d').length,1);
    const shortened=F.move(placed.house,'d',{x:-3,z:4.25,rot:Math.PI/2,length:.5});assert(shortened.ok);
    const mesh=F.makeMesh('room_wall',{wall:'#eeeeee',trim:'#aaaaaa'},{length:1.25});
    assert(Math.abs(mesh.geometry.boundingBox.max.x-mesh.geometry.boundingBox.min.x-1.25)<1e-6);
    assert.equal(F.wallLength({length:Infinity}),3);assert.equal(F.wallLength({length:999}),6);assert.equal(F.wallLength({length:-1}),.5);
});
test('rectangle builder creates complete rooms with usable doorways, atomic pricing and reusable grouped pieces',()=>{
    const {F,H}=runtime();
    for(const side of ['front','back','left','right']) {
        const house={...empty(),sizeTier:2,furniture:[{id:'seat',type:'chair',x:-5,z:-3,rot:0,support:null}]};
        const before=JSON.stringify(house),start={x:-9,z:-7},end={x:-1,z:1};
        const built=F.buildRoom(house,100000,start,end,side,'room-test');assert(built.ok,built.error);
        assert.equal(JSON.stringify(house),before,'preview/build is pure');assert.equal(built.money,100000-built.price);
        assert.equal(built.items.filter(v=>v.type==='room_doorway').length,1);
        assert(built.items.every(v=>v.roomId==='room-test'));
        const door=built.items.find(v=>v.type==='room_doorway');assert(!F.collision(built.items,door.x,door.z),'door passage stays open');
        for(const item of built.items)assert.equal(F.validate(built.house.furniture,item,built.house),'');
        const saved=H.restoreSave(JSON.parse(JSON.stringify(built.house)));assert.equal(saved.furniture.length,built.house.furniture.length);assert.equal(saved.furniture.filter(v=>v.roomId==='room-test').length,built.items.length);
        const stored=F.storeRoom(saved,'room-test');assert(stored.ok);assert.equal(stored.house.furniture.length,1);assert.equal(stored.house.furniture[0].id,'seat');
        const rebuilt=F.buildRoom(stored.house,0,end,start,side,'room-rebuilt');assert(rebuilt.ok,rebuilt.error);assert.equal(rebuilt.price,0,'reuse all purchased pieces');assert.equal(rebuilt.house.inventory.length,0);
        const poor=F.buildRoom(house,built.price-1,start,end,side,'poor');assert(!poor.ok);assert.match(poor.error,/money/);assert.equal(JSON.stringify(house),before);
        const overlapping=F.buildRoom(built.house,100000,start,end,side,'overlap');assert(!overlapping.ok);
    }
});
test('room drawing rejects small, out-of-bounds, blocked exits and full houses without partial changes',()=>{
    const {F}=runtime();const house=empty(),before=JSON.stringify(house);
    assert(!F.buildRoom(house,100000,{x:-5,z:-4},{x:-2,z:-1}).ok);
    assert(!F.buildRoom(house,100000,{x:-10,z:-4},{x:-1,z:1}).ok);
    assert(!F.buildRoom(house,100000,{x:0,z:0},{x:4,z:5}).ok,'main exit area stays clear');
    const full={...house,furniture:Array.from({length:30},(_,i)=>({id:'x'+i,type:'room_wall',x:0,z:0,rot:0}))};
    assert(!F.buildRoom(full,100000,{x:-6,z:-5},{x:-2,z:-1}).ok);
    const small=F.buildRoom(house,100000,{x:-6,z:-5},{x:-2,z:-1},'front','small');assert(small.ok,small.error);
    assert.equal(JSON.stringify(house),before);
    assert(!F.storeRoom({...small.house,inventory:Array.from({length:300},(_,i)=>({id:'s'+i,type:'chair'}))},'small').ok);
});
test('dragging a room previews without charging, Build saves and syncs the whole room, and Store removes the group',()=>{
    const {ctx,F,T,sent,saves}=runtime();ctx.innerWidth=1200;T.enter('owner',empty());T.openFurniture();
    const all=()=>{const out=[];const walk=node=>{out.push(node);node.children?.forEach(walk);};walk(ctx.document.body);return out;};
    const find=text=>all().find(v=>v.textContent?.startsWith(text));
    const canvas=all().find(v=>v.width===660);assert(canvas);
    const plan=F.floorPlan({});
    const event=(x,z)=>({clientX:plan.cx+x*plan.scale,clientY:plan.cy+z*plan.scale,pointerId:1,preventDefault(){}});
    canvas.onpointerdown(event(-6,-5));canvas.onpointermove(event(-2,-1));canvas.onpointerup(event(-2,-1));
    assert.equal(saves(),0);assert.equal(ctx.saveState.money,40000);
    const build=find('Build room · $');assert(build&&!build.disabled,'rectangle can be confirmed');build.onclick();
    assert.equal(saves(),1);assert(ctx.saveState.money<40000);assert(ctx.saveState.house.furniture.length>0);
    const update=sent.filter(v=>v.type==='house:update').at(-1);assert(update.house.furniture.every(v=>v.roomId));
    find('Store whole room 1').onclick();assert.equal(ctx.saveState.house.furniture.length,0);assert(ctx.saveState.house.inventory.length>0);assert.equal(saves(),2);
});
test('kitchen fixtures snap flush to perimeter and partition walls and preserve precise positions',()=>{
    const {F,H}=runtime();
    for(const sizeTier of [0,1,2])for(const type of ['kitchen_counter','kitchen_island','fridge','stove','sink'])for(const rot of [0,Math.PI/2]) {
        const house={...empty(),sizeTier,inventory:[{id:'fixture',type}]},size=F.roomSize(house),fp=F.footprint({type,x:0,z:0,rot});
        const placed=F.place(house,'fixture',{x:-2,z:-size.depth/2+fp.d/2+.3,rot});assert(placed.ok,placed.error);
        const item=placed.house.furniture[0];assert(Math.abs(item.z-fp.d/2+size.depth/2)<1e-6,'fixture touches back wall');
        const restored=H.restoreSave(JSON.parse(JSON.stringify(placed.house)));assert.equal(restored.furniture[0].z,item.z);assert.equal(restored.furniture[0].rot,item.rot);
        const moved=F.move(placed.house,'fixture',{x:-size.width/2+fp.w/2+.3,z:-1,rot});assert(moved.ok);assert(Math.abs(moved.house.furniture[0].x-fp.w/2+size.width/2)<1e-6,'rotated fixture touches side wall');
    }
    const wall={id:'wall',type:'room_wall',length:6,x:0,z:0,rot:0,support:null};
    const house={...empty(),furniture:[wall],inventory:[{id:'counter',type:'kitchen_counter'}]};
    const preview=F.snapToWall(house.furniture,{id:'counter',type:'kitchen_counter',x:0,z:-.8,rot:0,support:null},house);
    const placed=F.place(house,'counter',preview);assert(placed.ok);assert.equal(placed.house.furniture[1].z,-.625);
    assert(!F.overlap(F.footprint(wall),F.footprint(placed.house.furniture[1])));
    assert.equal(H.normalize(placed.house).furniture[1].z,-.625,'partition alignment survives save/sync normalization');
    assert(F.validate(house.furniture,{id:'bad',type:'stove',x:0,z:0,rot:0},house),'still reject overlapping a wall');
    assert(!F.place({...empty(),inventory:[{id:'sink',type:'sink'}]},'sink',{x:0,z:3,rot:0}).ok,'main entrance remains protected');
});
test('furniture shop category tabs filter items, preserve panel scroll, and still buy owned furniture',()=>{
    const {ctx,F,T}=runtime();ctx.innerWidth=1200;T.enter('owner',empty());T.openFurniture();
    const all=()=>{const out=[];const walk=node=>{out.push(node);node.children?.forEach(walk);};walk(ctx.document.body);return out;};
    const exact=text=>all().find(v=>v.textContent===text);
    const buys=()=>all().filter(v=>v.textContent?.startsWith('Buy '));
    exact('Shop').onclick();
    assert.equal(all().filter(v=>v.attributes?.role==='tab').length,F.catalogSections.length);
    assert.equal(F.catalogSections.reduce((sum,section)=>sum+section.items.length,0),F.catalog.length,'every item belongs to a category');
    const panel=all().find(v=>v.id==='house-menu').firstElementChild;panel.scrollTop=90;
    exact('Dining & kitchen').onclick();assert.equal(panel.scrollTop,90);
    const kitchen=F.catalogSections.find(v=>v.name==='Dining & kitchen');assert.equal(buys().length,kitchen.items.length);
    assert(buys().every(button=>kitchen.items.some(info=>button.textContent.startsWith('Buy '+info.name+' ·'))));
    assert.equal(exact('Dining & kitchen').attributes['aria-selected'],'true');assert.equal(exact('Classics').attributes['aria-selected'],'false');
    ctx.innerWidth=640;exact('Bedroom').onclick();assert(all().find(v=>v.className==='house-shop-shell').style.cssText.includes('grid-template-columns:minmax(0,1fr)'));
    exact('Dining & kitchen').onclick();const counter=buys().find(v=>v.textContent.startsWith('Buy Kitchen counter'));assert(counter&&!counter.disabled);counter.onclick();
    assert(ctx.saveState.house.inventory.some(v=>v.type==='kitchen_counter'));
    const styles=all().find(v=>v.textContent?.includes('.house-item-list > *'));assert(styles);assert(styles.textContent.includes('flex-shrink:0'));assert(styles.textContent.includes('overflow-x:hidden'));assert(styles.textContent.includes('overscroll-behavior:contain'));
});
test('size-based budgets separate furniture from construction, preserve 280 placed items and 300 storage items',()=>{
    const {F,H}=runtime();
    for(const [sizeTier,furniture,rooms] of [[0,75,30],[1,125,50],[2,200,80]]) {
        const house={...empty(),sizeTier};assert.equal(F.limits(house).furniture,furniture);assert.equal(F.limits(house).rooms,rooms);
        house.furniture=Array.from({length:furniture},(_,i)=>({id:'f'+i,type:'books',x:0,z:0,rot:0}));
        house.inventory=[{id:'extra',type:'books'},{id:'wall',type:'room_wall'}];
        assert(!F.place(house,'extra',{x:3,z:-3}).ok);
        assert(F.place(house,'wall',{x:3,z:-3}).ok,'furniture budget does not consume wall budget');
        house.furniture=Array.from({length:rooms},(_,i)=>({id:'r'+i,type:'room_wall',x:0,z:0,rot:0}));
        assert(!F.place(house,'wall',{x:3,z:-3}).ok);assert(F.place(house,'extra',{x:3,z:-3}).ok);
    }
    const furniture=[];
    for(let i=0;i<200;i++)furniture.push({id:'f'+i,type:'books',x:-11+(i%40)*.5,z:Math.floor(i/40)*.5,rot:0});
    for(let i=0;i<80;i++)furniture.push({id:'w'+i,type:'room_wall',length:.5,x:-11+(i%20),z:-8+Math.floor(i/20)*.5,rot:0});
    const house=H.normalize({...empty(),sizeTier:2,furniture,inventory:Array.from({length:301},(_,i)=>({id:'s'+i,type:'chair'}))});
    assert.equal(house.furniture.length,280);assert.equal(house.inventory.length,300);
    assert.equal(H.restoreSave(JSON.parse(JSON.stringify(house))).furniture.length,280);
    assert(!F.buy(house,100000,'chair','overflow').ok);
    assert.equal(H.normalize({...house,inventory:[...house.inventory,{id:'third',type:'chair'}]}).inventory.length,300);
    const tvs=H.normalize({...empty(),furniture:[0,1,2].map(i=>({id:'tv'+i,type:'stream_tv',x:-4+i*3,z:-2,rot:0}))});assert.equal(tvs.furniture.length,2);
});
test('incremental sync keeps untouched TV and furniture meshes while adding, moving, removing and recoloring items',()=>{
    const {ctx,H,T}=runtime();let mounts=0;ctx.window.attachHouseTv=()=>{mounts++;};
    const house=H.normalize({...empty(),furniture:[{id:'tv',type:'stream_tv',x:-3,z:-2,rot:0},{id:'chair',type:'chair',x:2,z:-2,rot:0}]});T.enter('other',house);
    const group=H.renderScene.getObjectByName('houseFurnitureGroup'),tv=group.children.find(m=>m.userData.furnitureId==='tv'),chair=group.children.find(m=>m.userData.furnitureId==='chair');
    const next=H.normalize({...house,furniture:[house.furniture[0],{...house.furniture[1],x:3},{id:'plant',type:'plant',x:0,z:-2,rot:0}]});
    const patch=ctx.window.HouseProtocol.diffHouse(house,next);assert.equal(patch.upsert.length,2);assert(!patch.upsert.some(v=>v.id==='tv'));
    H.handleHost({type:'house:update',owner:'other',patch});assert.equal(group.children.find(m=>m.userData.furnitureId==='tv'),tv);assert.equal(group.children.find(m=>m.userData.furnitureId==='chair'),chair);assert.equal(chair.position.x,3);assert.equal(mounts,1);
    const removed=H.normalize({...next,furniture:next.furniture.filter(v=>v.id!=='plant')});H.handleHost({type:'house:update',owner:'other',patch:ctx.window.HouseProtocol.diffHouse(next,removed)});assert.equal(group.children.length,2);assert.equal(mounts,1);
});
test('host coalesces rapid edits, sends only changed items to authorized visitors, and retains the final edit',()=>{
    const {ctx,H}=runtime();let now=10000;const inbox=[],Protocol=ctx.window.HouseProtocol;
    const router=new Protocol.HouseRouter({now:()=>now,online:()=>true,name:id=>id,token:()=> 'token',deliver:(id,msg)=>inbox.push({id,msg})});
    const base=H.normalize({...empty(),furniture:[{id:'chair',type:'chair',x:-2,z:0,rot:0}]});
    router.receive('guest',{type:'house:request',owner:'owner'});const request=inbox.find(v=>v.id==='owner').msg;
    router.receive('owner',{type:'house:decision',requestId:request.requestId,accept:true,house:base});
    const edit=x=>router.receive('owner',{type:'house:update',house:{...base,furniture:[{...base.furniture[0],x}]}});
    edit(-1);edit(0);edit(1);edit(2);assert.equal(inbox.filter(v=>v.msg.patch).length,1);assert.equal(router.queuedUpdates.size,1);
    now+=250;router.prune();const updates=inbox.filter(v=>v.msg.patch);assert.equal(updates.length,2);assert(updates.every(v=>v.id==='guest'));assert.equal(updates[1].msg.patch.upsert[0].x,2);assert.equal(router.queuedUpdates.size,0);
    let reconstructed=base;for(const update of updates)reconstructed=Protocol.applyHousePatch(reconstructed,update.msg.patch);assert.equal(reconstructed.furniture[0].x,2);
    now+=250;edit(2);assert.equal(inbox.filter(v=>v.msg.patch).length,2,'identical snapshots do not broadcast');
    edit(3);router.disconnect('owner');now+=250;router.prune();assert.equal(router.queuedUpdates.size,0);
});
test('interior perimeter, placeable walls and doorway sections share taller height and clear the doubled TV',()=>{
    const {F,T}=runtime();assert.equal(F.INTERIOR_HEIGHT,6.4);
    assert(F.INTERIOR_HEIGHT>F.byId.wall_tv.mountY+F.byId.wall_tv.h/2);
    for(const sizeTier of [0,1,2]){
        const room=T.makeRoom({...empty(),sizeTier,wall:'#eeeeee',floor:'#998877',trim:'#554433'});
        const panels=[];room.traverse(mesh=>{if(mesh.geometry?.type==='PlaneGeometry'&&mesh.geometry.parameters.height===F.INTERIOR_HEIGHT)panels.push(mesh);});assert.equal(panels.length,4);
        for(const panel of panels)assert.equal(panel.position.y,F.INTERIOR_HEIGHT/2);
    }
    for(const type of ['room_wall','room_doorway']){
        assert.equal(F.byId[type].h,F.INTERIOR_HEIGHT);
        const mesh=F.makeMesh(type);assert(Math.abs(mesh.geometry.boundingBox.max.y-F.INTERIOR_HEIGHT)<1e-5);assert(Math.abs(mesh.geometry.boundingBox.min.y)<1e-5);
    }
    assert(!F.collision([{id:'door',type:'room_doorway',x:0,z:0,rot:0}],0,0),'doorway remains walkable');
});
test('all 72 new household items can be purchased, placed, saved and stored in their category',()=>{
    const {F,H}=runtime(),added=F.catalog.slice(78,150);assert.equal(added.length,72);
    assert.equal(new Set(F.catalogSections.map(v=>v.name)).size,F.catalogSections.length,'category tabs stay unique');
    for(const info of added){
        const purchased=F.buy({...empty(),sizeTier:2},100000,info.id,'new-item');assert(purchased.ok,info.id);assert.equal(purchased.money,100000-info.price);
        const placed=F.place(purchased.house,'new-item',{x:0,z:-2,rot:0});assert(placed.ok,info.id+': '+placed.error);
        const restored=H.restoreSave(JSON.parse(JSON.stringify(placed.house)));assert.equal(restored.furniture[0].type,info.id);
        const stored=F.store(restored,'new-item');assert(stored.ok);assert.equal(stored.house.inventory[0].type,info.id);
        assert(F.catalogSections.some(section=>section.name===info.section&&section.items.includes(info)),info.id+' appears in its shop category');
    }
    for(const type of ['microwave','coffee_machine','toaster','kettle','fruit_bowl','plate_stack','desktop_computer','record_player']){
        const house={...empty(),inventory:[{id:'counter',type:'kitchen_counter'},{id:'decor',type}]};
        const counter=F.place(house,'counter',{x:-2,z:-2});assert(counter.ok);
        const decorated=F.place(counter.house,'decor',{x:0,z:0,rot:0,support:'counter'});assert(decorated.ok,type+' fits on counter');assert.equal(F.resolve(decorated.house.furniture,decorated.house.furniture[1]).y,1.4);
    }
});
test('all item previews share one renderer, cache images and display in shop cards without playing media',()=>{
    const {ctx,F,T}=runtime();let contexts=0,renders=0;
    ctx.THREE={...THREE,WebGLRenderer:class {
        constructor(){contexts++;this.domElement={toDataURL:()=> 'data:image/png;base64,preview'+renders};}
        setPixelRatio(){}setSize(){}setClearColor(){}dispose(){}
        render(scene,camera){renders++;assert.equal(scene.children.length,1);assert(camera.isPerspectiveCamera);assert(scene.children[0].isMesh);}
    }};
    ctx.document.createElementNS=()=>({});ctx.innerWidth=1200;
    for(const item of F.catalog)assert(F.thumbnail(item.id,{wall:'#ffccaa',trim:'#554433'}).startsWith('data:image/png'));
    assert.equal(contexts,1);assert.equal(renders,154);
    F.thumbnail('chair');F.thumbnail('chair');assert.equal(renders,154,'cached thumbnails do not render again');
    F.thumbnail('room_wall',{wall:'#112233',trim:'#445566'},{length:1});assert.equal(renders,155,'custom wall dimensions/color get a matching preview');
    T.enter('owner',empty());T.openFurniture();
    const all=()=>{const nodes=[];const walk=v=>{nodes.push(v);v.children?.forEach(walk);};walk(ctx.document.body);return nodes;};
    all().find(v=>v.textContent==='Shop').onclick();
    const cards=all().filter(v=>v.textContent?.startsWith('Buy '));assert(cards.length>0);
    for(const card of cards){const preview=card.children.find(v=>v.className==='house-item-preview');assert(preview);assert.equal(preview.width,88);assert(preview.src.startsWith('data:image/png'));}
    assert.equal(contexts,1);
});
test('new household furniture uses model-specific landing parts and rotated seats while tall decor remains solid',()=>{
    const {F,H,T}=runtime();
    for(const type of ['velvet_sofa','linen_loveseat','reading_chair','leather_ottoman','entry_bench','dressing_stool','rustic_bed','mint_bed','canopy_bed','glass_coffee_table','breakfast_table','butcher_block','luggage_trunk','washing_machine','dishwasher','white_dresser']){
        const info=F.byId[type],item={id:'test',type,x:0,z:0,rot:Math.PI/2,support:null};
        const height=F.standHeight(info);assert(Number.isFinite(height),type+' has a landing surface');
        T.enter('owner',{...empty(),furniture:[item]});
        assert(!H.canStand({x:30000,z:30000,y:0}),type+' is solid at ground level');
        assert(H.standableTopAt(30000,30000,0)===-Infinity,type+' does not lift a grounded player');
        const top=H.standableTopAt(30000,30000,height+.1);assert(Number.isFinite(top),type+' can be landed on');assert(Math.abs(top-height)<.001,type+' lands at its seat/table height');
        assert(H.canStand({x:30000,z:30000,y:top}),type+' supports standing after landing');H.leave();
    }
    const info=F.byId.velvet_sofa,item={id:'sofa',type:info.id,x:0,z:0,rot:Math.PI/2,support:null};T.enter('owner',{...empty(),furniture:[item]});
    const seat=info.h*.5,backX=30000-info.d*.36;
    assert(!H.canStand({x:backX,z:30000,y:seat}),'couch back is not passable at cushion height');
    assert(Math.abs(H.standableTopAt(backX,30000,info.h)-info.h*.83)<1e-6,'back has its own taller landing height');H.leave();
    T.enter('owner',{...empty(),furniture:[{id:'bed',type:'canopy_bed',x:0,z:0,rot:0,support:null}]});
    assert(!H.canStand({x:30000+F.byId.canopy_bed.w*.46,z:30000+F.byId.canopy_bed.d*.46,y:1}),'canopy posts remain solid above mattress height');H.leave();
    for(const type of ['fiddle_leaf','olive_tree','floor_lamp','walnut_wardrobe','easel','guitar_stand'])assert.equal(F.standHeight(F.byId[type]),undefined,type+' is not an arbitrary platform');
});
test('all catalog models have no remaining coplanar overlap area after geometry cleanup',()=>{
    const {F}=runtime();
    const area=positions=>{let result=0;for(let i=0;i<positions.length;i+=9){const a=new THREE.Vector3().fromArray(positions,i),b=new THREE.Vector3().fromArray(positions,i+3),c=new THREE.Vector3().fromArray(positions,i+6);result+=b.sub(a).cross(c.sub(a)).length()/2;}return result;};
    for(const item of F.catalog){
        const mesh=F.makeMesh(item.id),p=Array.from(mesh.geometry.attributes.position.array),c=Array.from(mesh.geometry.attributes.color.array),clean=F.cleanCoplanarFaces(p,c);
        assert(Math.abs(area(p)-area(clean.positions))<.00002,item.id+' still contains coplanar face overlap');
        assert(mesh.geometry.attributes.position.count/3<=300,item.id+' stays within triangle budget');mesh.geometry.dispose();mesh.material.dispose();
    }
    const quad=(left,right)=>[left,0,0,right,0,0,right,1,0,left,0,0,right,1,0,left,1,0];
    const positions=[...quad(0,1),...quad(.5,1.5)],colors=positions.map((v,i)=>i<18?0:1),clean=F.cleanCoplanarFaces(positions,colors);
    assert(Math.abs(area(clean.positions)-1.5)<1e-7,'partially overlapping detail faces are cut to the visible union');
});
test('overlapping rugs receive stable distinct depth offsets without moving their physical surfaces',()=>{
    const {H,T}=runtime();T.enter('owner',{...empty(),furniture:[{id:'rug-b',type:'rug',x:0,z:0,rot:0},{id:'rug-a',type:'navy_rug',x:0,z:0,rot:0}]});
    const group=H.renderScene.getObjectByName('houseFurnitureGroup'),a=group.children.find(v=>v.userData.furnitureId==='rug-a'),b=group.children.find(v=>v.userData.furnitureId==='rug-b');
    assert(a.material.polygonOffset&&b.material.polygonOffset);assert.notEqual(a.material.polygonOffsetUnits,b.material.polygonOffsetUnits);assert.notEqual(a.renderOrder,b.renderOrder);assert.equal(a.position.y,b.position.y);
});
test('assembled house perimeter, entrance trim and snapped room joints have no coplanar overlap area',()=>{
    const {F,H,T}=runtime();const built=F.buildRoom({...empty()},100000,{x:-6,z:-5},{x:-2,z:-1},'front','audit-room');assert(built.ok,built.error);T.enter('owner',built.house);
    const room=H.renderScene;room.updateMatrixWorld(true);const positions=[],colors=[];
    room.traverse(mesh=>{
        if(!mesh.geometry)return;const geometry=mesh.geometry,attr=geometry.attributes.position,count=geometry.index?geometry.index.count:attr.count;
        for(let i=0;i<count;i++){const index=geometry.index?geometry.index.getX(i):i,p=new THREE.Vector3().fromBufferAttribute(attr,index).applyMatrix4(mesh.matrixWorld);positions.push(p.x-30000,p.y,p.z-30000);colors.push(1,1,1);}
    });
    const area=values=>{let result=0;for(let i=0;i<values.length;i+=9){const a=new THREE.Vector3().fromArray(values,i),b=new THREE.Vector3().fromArray(values,i+3),c=new THREE.Vector3().fromArray(values,i+6);result+=b.sub(a).cross(c.sub(a)).length()/2;}return result;};
    const cleaned=F.cleanCoplanarFaces(positions,colors);assert(Math.abs(area(positions)-area(cleaned.positions))<.0001,'joined trim and walls do not cover each other with coplanar faces');
});
test('all shower instances use a moderately larger model and matching placement footprint',()=>{
    const {F,H}=runtime();const shower=F.byId.shower;assert.equal(shower.w,1.8);assert.equal(shower.d,1.8);assert.equal(shower.h,3.2);
    const mesh=F.makeMesh('shower'),bounds=mesh.geometry.boundingBox;assert(bounds.max.y>3.1);assert(bounds.max.x-bounds.min.x>1.7);assert(bounds.max.z-bounds.min.z>1.6);
    const oldSave=H.restoreSave({...empty(),furniture:[{id:'existing-shower',type:'shower',x:-3,z:-2,rot:0}]});assert.equal(oldSave.furniture.length,1);assert.equal(F.footprint(oldSave.furniture[0]).w,1.8);
    const purchased=F.buy(empty(),2000,'shower','new-shower');assert(purchased.ok);assert(F.place(purchased.house,'new-shower',{x:-3,z:-2}).ok);
});
test('recolored catch displays survive placement, storage, presets and visitor patches',()=>{
    const {F,H,ctx}=runtime();let house=H.normalize({...empty(),inventory:[{id:'tank',type:'aquarium',color:'#aa3377',displayOwned:true,displayCatch:{name:'Bluegill',color:'#4e7e9e',size:2.4,zone:'lake',tierName:'Gold'}}]});
    const placed=F.place(house,'tank',{x:-2,z:-2});assert(placed.ok);house=H.normalize(placed.house);assert.equal(house.furniture[0].color,'#aa3377');assert.equal(house.furniture[0].displayCatch.size,2.4);
    const mesh=F.makeMesh('aquarium',house,house.furniture[0]);assert(mesh.geometry.attributes.position.count/3<=300);
    const saved=H.savePreset(house,'Display room');assert(saved.ok);const stored=F.store(saved.house,'tank');assert(stored.ok);assert.equal(H.restoreSave(stored.house).inventory[0].displayCatch.name,'Bluegill');
    const loaded=H.restorePreset(stored.house,0);assert(loaded.ok);assert.equal(loaded.house.furniture[0].color,'#aa3377');assert.equal(loaded.house.inventory.length,0);
    const patch=ctx.window.HouseProtocol.diffHouse(house,loaded.house);const remote=ctx.window.HouseProtocol.applyHousePatch(house,patch);assert.equal(remote.furniture[0].displayCatch.name,'Bluegill');
    assert.equal(F.itemMetadata({color:'url(bad)'}).color,undefined);
});
test('collection rewards require catches, grant once, unlock exclusive furniture and include collector cosmetics',()=>{
    const {F,H}=runtime();let house=H.normalize(empty());const journal={Bluegill:['normal'],'Yellow Perch':['normal'],'Common Carp':['normal']};
    assert(!F.claimCollection(house,{},'lake').ok);assert(!F.buy(house,10000,'collection_lake_bench','locked').ok);
    const claimed=F.claimCollection(house,journal,'lake');assert(claimed.ok);assert.equal(claimed.title,'lake_collector');assert.equal(claimed.house.inventory.length,1);assert(!F.claimCollection(claimed.house,journal,'lake').ok);
    house=H.restoreSave(JSON.parse(JSON.stringify(claimed.house)));assert(house.collections.includes('lake'));assert(F.buy(house,10000,'collection_lake_bench','copy').ok);
    assert(!F.claimCollection({...H.normalize(empty()),inventory:Array.from({length:300},(_,i)=>({id:'x'+i,type:'chair'}))},journal,'lake').ok);
});
test('five layout presets rearrange owned items without duplication or restoring old TV sessions',()=>{
    const {F,H}=runtime();let house=H.normalize({...empty(),furniture:[{id:'chair',type:'chair',x:-2,z:-2,rot:0},{id:'tv',type:'stream_tv',x:2,z:-2,rot:0,stream:{provider:'youtube',videoId:'M7lc1UVf-VE'}}]});
    for(let i=0;i<5;i++){const result=H.savePreset(house,'Layout '+i);assert(result.ok);house=result.house;}
    assert(!H.savePreset(house,'Overflow').ok);assert.equal(house.presets[0].furniture.find(v=>v.id==='tv').stream,undefined);
    house=H.restoreSave(JSON.parse(JSON.stringify(house)));house=F.store(house,'chair').house;house=F.store(house,'tv').house;
    const restored=H.restorePreset(house,0);assert(restored.ok);assert.equal(restored.house.furniture.length,2);assert.equal(restored.house.inventory.length,0);assert.equal(restored.house.furniture.find(v=>v.id==='tv').stream,undefined);
    assert(!H.restorePreset({...house,inventory:house.inventory.filter(v=>v.id!=='chair')},0).ok,'cannot create missing items');
    assert.equal(new Set(restored.house.furniture.map(v=>v.id)).size,2);
});
test('no-HUD mode hides house and tournament widgets even when they refresh',()=>{
    const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),ui=fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8'),tournaments=fs.readFileSync(path.join(__dirname,'../tournaments.js'),'utf8');
    assert(html.includes('body.hud-hidden #house-status,body.hud-hidden #tournament-hud {display:none!important;}'));
    assert(ui.includes("classList.toggle('hud-hidden', !hudVisible)"));assert(tournaments.includes("panel.id='tournament-hud'"));
});
test('house menus apply furniture paint and catch displays, claim titles, and save a named layout',()=>{
    const {ctx,T}=runtime();ctx.innerWidth=1200;ctx.saveState.inventory=[{name:'Bluegill',color:'#4e7e9e',size:2,zone:'lake'}];ctx.saveState.unlockedTitles=['none'];ctx.saveState.journal={Bluegill:['normal'],'Yellow Perch':['normal'],'Common Carp':['normal']};
    T.enter('owner',{...empty(),furniture:[{id:'tank',type:'aquarium',x:-2,z:-2,rot:0}]});
    const all=()=>{const list=[];const walk=v=>{list.push(v);v.children?.forEach(walk);};walk(ctx.document.body);return list;};const button=name=>all().find(v=>v.textContent===name);
    T.openFurniture();const selection=all().find(v=>v.attributes?.['aria-label']==='Select placed furniture');selection.value='tank';selection.onchange();button('Change color').onclick();
    const paint=all().find(v=>v.type==='color');paint.value='#bb3388';button('Apply color').onclick();assert.equal(ctx.saveState.house.furniture[0].color,'#bb3388');
    ctx.interactTarget=null;ctx.canSell=false;ctx.player.position.set(29998,0,29999);ctx.window.Housing.tick();assert.equal(ctx.interactTarget,'house-display');ctx.window.Housing.interact();
    const fish=all().find(v=>v.children?.some(c=>c.textContent==='Bluegill · size 2'));fish.value='0';button('Display selected catch').onclick();assert.equal(ctx.saveState.house.furniture[0].displayCatch.name,'Bluegill');assert.equal(ctx.saveState.inventory.length,0);
    button('Customize').onclick();button('Fishing collections').onclick();button('Claim Lakeside Life').onclick();assert(ctx.saveState.unlockedTitles.includes('lake_collector'));assert(ctx.saveState.house.inventory.some(v=>v.type==='collection_lake_bench'));
    button('Back').onclick();button('Saved house layouts').onclick();const input=all().find(v=>v.placeholder==='Layout name');input.value='Cozy aquarium';button('Save current layout').onclick();assert.equal(ctx.saveState.house.presets[0].name,'Cozy aquarium');
});
test('catch displays use the actual fish texture generator and guests cannot change them',()=>{
    const {ctx,F,H,T}=runtime();const calls=[];ctx.createFishTexture=(name,color)=>{calls.push({name,color});return new THREE.Texture();};
    for(const type of ['aquarium','catch_plaque']){
        const mesh=F.makeMesh(type,{}, {displayCatch:{name:'Golden Rainbow Trout',color:'#ffd45b',size:2}}),sprite=mesh.getObjectByName('displayCatchSprite');
        assert(sprite);assert.equal(sprite.userData.fishName,'Golden Rainbow Trout');assert(sprite.material.map.isTexture);assert(sprite.material.transparent);assert(sprite.position.z>(type==='aquarium'?.45:.1));
    }
    assert.equal(calls.length,2);assert.equal(calls[0].name,'Golden Rainbow Trout');
    ctx.interactTarget=null;ctx.canSell=false;ctx.saveState.inventory=[];ctx.innerWidth=1200;
    T.enter('other',{...empty(),furniture:[{id:'tank',type:'aquarium',x:-2,z:-2,rot:0,displayCatch:{name:'Bluegill',color:'#4e7e9e',size:1}}]});ctx.player.position.set(29998,0,29999);H.tick();assert.equal(ctx.interactTarget,'house-display');H.interact();
    const all=[];const walk=v=>{all.push(v);v.children?.forEach(walk);};walk(ctx.document.body);assert(!all.some(v=>v.textContent==='Display selected catch'));assert(all.some(v=>v.textContent?.includes('Bluegill')));
});
test('R cycles every wall mount across four walls without a wall dropdown and saves front placements',()=>{
    const {ctx,F,H,T}=runtime();ctx.innerWidth=1200;
    for(const type of ['wall_tv','catch_plaque']){
        T.enter('owner',{...empty(),inventory:[{id:'mount',type}]});T.openFurniture();T.startPlacement('mount',false);
        const all=()=>{const list=[];const walk=v=>{list.push(v);v.children?.forEach(walk);};walk(ctx.document.body);return list;};
        for(const wall of ['right','front','left','back']){T.rotateFurniture();assert(all().some(v=>v.textContent?.startsWith('Wall: '+wall+' · Press R')));}
        assert(!all().some(v=>v.attributes?.['aria-label']==='Wall for the TV'));H.leave();
        const placed=F.place({...empty(),inventory:[{id:'mount',type}]},'mount',{wall:'front',x:0,z:0});assert(placed.ok,placed.error);
        const restored=H.restoreSave(placed.house);assert.equal(restored.furniture[0].wall,'front');assert.equal(restored.furniture[0].rot,Math.PI);assert(restored.furniture[0].z>0);
    }
});
test('catch transfers consume only current inventory specimens, preserve stats and return fish once without preset duplication',()=>{
    const {F,H}=runtime();let house=H.normalize({...empty(),furniture:[{id:'tank',type:'aquarium',x:-2,z:-2,rot:0}]});
    const fish={name:'Golden Rainbow Trout',color:'#ffd45b',size:2.25,sizeLabel:'MASSIVE',rarity:'Legendary',tierId:'shining',tierName:'Shining',zone:'ocean',price:19000,basePrice:14000,drain:115,drainRate:90};
    const result=F.transferCatch(house,[fish],'tank',0);assert(result.ok);assert.equal(result.fishInventory.length,0);assert.equal(result.house.furniture[0].displayCatch.price,19000);assert(result.house.furniture[0].displayOwned);
    assert(!F.transferCatch(result.house,[],'tank',0).ok,'cannot reuse a removed inventory fish');
    house=H.savePreset(result.house,'Fish room').house;assert.equal(house.presets[0].furniture[0].displayCatch,undefined);
    const returned=F.transferCatch(house,[],'tank');assert(returned.ok);assert.equal(returned.fishInventory.length,1);assert.equal(returned.fishInventory[0].price,19000);assert.equal(returned.fishInventory[0].tierId,'shining');
    const again=F.transferCatch(returned.house,returned.fishInventory,'tank');assert.equal(again.fishInventory.length,1);
    const restored=H.restorePreset(returned.house,0);assert(restored.ok);assert.equal(restored.house.furniture[0].displayCatch,undefined,'layout cannot restore fish after withdrawal');
    const legacy=H.restoreSave({...house,furniture:[{...house.furniture[0],displayOwned:false}]});assert.equal(legacy.furniture[0].displayCatch,undefined,'old copy-only specimens must be redeposited');
    const replacement=F.transferCatch(result.house,[{...fish,name:'Bluegill',price:10}],'tank',0);assert(replacement.ok);assert.equal(replacement.fishInventory.length,1);assert.equal(replacement.fishInventory[0].name,fish.name);assert.equal(replacement.house.furniture[0].displayCatch.name,'Bluegill');
});
test('display sprites include a visible stats card',()=>{
    const {ctx,F}=runtime();ctx.createFishTexture=()=>new THREE.Texture();
    const mesh=F.makeMesh('catch_plaque',{}, {displayCatch:{name:'Bluegill',color:'#4e7e9e',size:2,price:100,rarity:'Rare',tierName:'Shining',zone:'lake'}});
    assert(mesh.getObjectByName('displayCatchStats'));assert(mesh.getObjectByName('displayCatchSprite'));
});
