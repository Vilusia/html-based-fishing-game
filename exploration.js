// Shared, host-authoritative exploration finds on the home map and ocean islands.
(function(){
    'use strict';
    const REFRESH=15*60*1000,RANGE=3;
    const TYPES={pouch:{name:'Lost coin pouch',min:50,max:125},bottle:{name:'Drift bottle',min:100,max:225},cache:{name:'Treasure cache',min:250,max:600}};
    function random(seed){let value=2166136261;for(const ch of String(seed))value=Math.imul(value^ch.charCodeAt(0),16777619);return ()=>{let t=value+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
    function generate(seed,cycle,anchors,sample,clear){
        const rand=random(seed+':'+cycle),finds=[];
        for(const anchor of anchors)for(let n=0;n<(anchor.count||1);n++)for(let attempt=0;attempt<80;attempt++){
            const a=rand()*Math.PI*2,r=Math.sqrt(rand())*anchor.radius,dx=Math.cos(a)*r*(anchor.xScale||1),dz=Math.sin(a)*r*(anchor.zScale||1),rot=anchor.rotation||0;
            const x=anchor.x+dx*Math.cos(rot)-dz*Math.sin(rot),z=anchor.z+dx*Math.sin(rot)+dz*Math.cos(rot),y=sample(x,z);
            if(!Number.isFinite(y)||!clear(x,y,z)||finds.some(f=>Math.hypot(f.x-x,f.z-z)<6))continue;
            const hx=sample(x+.6,z),hz=sample(x,z+.6);
            if(!Number.isFinite(hx)||!Number.isFinite(hz)||Math.abs(hx-y)>.6||Math.abs(hz-y)>.6)continue;
            const roll=rand(),type=roll<(anchor.offshore?.28:.12)?'cache':roll<.55?'bottle':'pouch',spec=TYPES[type];
            const bonus=anchor.offshore?100:0,amount=spec.min+Math.floor(rand()*(spec.max-spec.min+1))+bonus;
            finds.push({id:cycle+':'+finds.length,type,x,y:y+.06,z,amount});break;
        }
        return finds;
    }
    class Finds {
        constructor(env){this.env=env;this.session=env.session;this.cycle=0;this.revision=0;this.nextAt=env.now()+REFRESH;this.available=new Map(env.generate(0).map(f=>[f.id,f]));this.pending=new Map();}
        tick(){if(this.env.now()<this.nextAt)return false;this.cycle++;this.nextAt=this.env.now()+REFRESH;this.available=new Map(this.env.generate(this.cycle).map(f=>[f.id,f]));this.revision++;return true;}
        claim(peer,id){
            this.tick();const find=this.available.get(id),pos=this.env.position(peer);
            if(!find||!pos||![pos.x,pos.y,pos.z].every(Number.isFinite)||Math.hypot(find.x-pos.x,find.z-pos.z)>RANGE||Math.abs(find.y-pos.y)>3)return false;
            this.available.delete(id);this.revision++;
            const queue=this.pending.get(peer)||[];queue.push({id:this.session+':'+find.id,amount:find.amount,name:TYPES[find.type].name});this.pending.set(peer,queue);return true;
        }
        ack(peer,id){const queue=this.pending.get(peer);if(!queue?.some(v=>v.id===id))return false;const rest=queue.filter(v=>v.id!==id);if(rest.length)this.pending.set(peer,rest);else this.pending.delete(peer);return true;}
        snapshot(peer){return {type:'explore:state',session:this.session,revision:this.revision,nextAt:this.nextAt,finds:[...this.available.values()],award:this.pending.get(peer)?.[0]||null};}
    }
    window.ExplorationRules={Finds,generate,random,TYPES,REFRESH};
    if(typeof document==='undefined')return;
    let authority=null,key=null,level=null,world=null,root=null,state=null,lastSync=-Infinity,lastTick=-Infinity,target=null;
    const meshes=new Map(),limits=new Map();
    const me=()=>myPeerId||'solo-player',hosting=()=>isHost||!hostConn?.open;
    const peers=()=>[me(),...Object.keys(clientConns).filter(id=>clientConns[id]?.open)];
    function active(){return !!player&&document.getElementById('lobby-screen')?.style.display==='none';}
    function dispose(mesh){const mats=new Set();mesh.traverse(m=>{m.geometry?.dispose();if(m.material)mats.add(m.material);});mats.forEach(m=>m.dispose());mesh.parent?.remove(mesh);}
    function clear(){for(const mesh of meshes.values())dispose(mesh);meshes.clear();root?.parent?.remove(root);root=null;target=null;state=null;}
    function position(id){
        if(id===me())return isInVoid||isInLavaWorld||window.Housing?.inside?null:player?.position;
        const p=otherPlayers[id],shared=window.Boats?.authoritativePresence(id);
        if(!p||Date.now()-p.lastSeen>5000||p.lastData?.houseOwner)return null;
        return shared||p.lastData?.pos||null;
    }
    function anchors(){
        const lay=window.CUSTOM_LEVEL?window.customOcean:window.Ocean?.layout(),out=[];
        if(window.CUSTOM_LEVEL){
            const lv=window.CUSTOM_LEVEL,rand=random('authored:'+lv.size+':'+lv.grid);
            for(let i=0;i<1200&&out.length<10;i++){
                const index=Math.floor(rand()*lv.heights.length);if(lv.heights[index]<=lv.seaLevel+.5)continue;
                const p=window.Level.cellCenter(lv,index%lv.grid,Math.floor(index/lv.grid));
                if(out.some(v=>Math.hypot(v.x-p.x,v.z-p.z)<12))continue;
                out.push({x:p.x,z:p.z,radius:Math.min(10,lv.size/lv.grid*.4)});
            }
        }else out.push({x:0,z:0,radius:ISLAND_RADIUS-12,count:10});
        for(const isl of lay?.islands||[])out.push({x:isl.x,z:isl.z,radius:isl.radius*.6,xScale:isl.xScale,zScale:isl.zScale,rotation:isl.rotation,count:isl.radius>=35?2:1,offshore:true});
        return out;
    }
    function accessible(x,y,z){
        if(!window.Ocean?.inBounds(x,z,3)||waterSurfaceAt(x,z)!==null)return false;
        for(const c of treeColliders)if(Math.hypot(c.x-x,c.z-z)<(c.radius||.8)+1.5)return false;
        for(const c of staticColliders)if(staticColliderHits(c,{x,y,z},1.2,2))return false;
        return true;
    }
    function ensure(){
        if(!active())return false;
        const next=String(currentRoomId||'solo')+':'+hosting();
        if(key!==next||level!==window.CUSTOM_LEVEL||world!==scene){clear();authority=null;key=next;level=window.CUSTOM_LEVEL;world=scene;limits.clear();lastSync=-Infinity;lastTick=-Infinity;root=new THREE.Group();root.name='explorationFinds';scene.add(root);}
        if(hosting()&&!authority){
            const session=crypto.randomUUID(),locations=anchors();
            authority=new Finds({session,now:Date.now,position,generate:cycle=>generate(session,cycle,locations,getTerrainHeight,accessible)});
        }
        return true;
    }
    function model(find){
        const g=new THREE.Group(),mats=new Map();
        const mat=c=>{if(!mats.has(c))mats.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.85,flatShading:true}));return mats.get(c);};
        const box=(w,h,d,c,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);g.add(m);return m;};
        if(find.type==='cache'){
            box(.7,.4,.48,'#775237',0,.2,0);box(.74,.15,.52,'#aa774a',0,.47,0);
            for(const x of [-.23,.23])box(.065,.56,.54,'#d8b75e',x,.28,0);box(.13,.14,.05,'#f0d47c',0,.38,.28);
        }else if(find.type==='bottle'){
            const m=new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,.4,6),mat('#67a99e'));m.position.y=.22;g.add(m);box(.12,.11,.12,'#a97c4f',0,.47,0);box(.17,.18,.03,'#eedca3',0,.25,.12);
        }else{
            const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.23,0),mat('#b9874c'));m.position.y=.2;m.scale.y=1.15;g.add(m);box(.2,.06,.18,'#60482f',0,.42,0);box(.12,.12,.03,'#f6d378',0,.22,.21);
        }
        const glint=new THREE.Mesh(new THREE.OctahedronGeometry(.075),new THREE.MeshBasicMaterial({color:'#ffdb7c'}));glint.position.y=.85;glint.name='findGlint';g.add(glint);
        g.position.set(find.x,find.y,find.z);g.userData.find=find;return g;
    }
    function accept(msg){
        if(msg?.type!=='explore:state'||!active())return;
        if(!ensure())return;
        const award=msg.award;
        if(award&&typeof award.id==='string'&&award.id.length<=200&&Number.isSafeInteger(award.amount)&&award.amount>0&&award.amount<=1000){
            const receipts=Array.isArray(saveState.explorationReceipts)?saveState.explorationReceipts:[],fresh=!receipts.includes(award.id);
            if(fresh){saveState.money+=award.amount;saveState.explorationReceipts=[...receipts,award.id].slice(-500);const s=saveState.explorationStats||{finds:0,money:0};s.finds++;s.money+=award.amount;saveState.explorationStats=s;}
            try{
                if(saveGame()===false)throw Error('Find reward not saved yet.');
                if(hosting())authority?.ack(me(),award.id);else hostConn.send({type:'explore:ack',id:award.id});
                if(fresh)showToast('Exploration find: +$'+award.amount+'!');
            }catch(e){console.warn('Exploration reward will be retried:',e);}
        }
        if(state?.session===msg.session&&msg.revision<state.revision)return;
        if(state?.session!==msg.session){for(const mesh of meshes.values())dispose(mesh);meshes.clear();}
        state=msg;
        const visible=new Set();
        for(const find of (msg.finds||[]).slice(0,120)){
            if(!TYPES[find.type]||typeof find.id!=='string'||![find.x,find.y,find.z].every(Number.isFinite))continue;
            visible.add(find.id);if(!meshes.has(find.id)){const mesh=model(find);meshes.set(find.id,mesh);root.add(mesh);}
        }
        for(const [id,mesh] of meshes)if(!visible.has(id)){dispose(mesh);meshes.delete(id);}
    }
    function publish(id){try{const msg=authority.snapshot(id);if(id===me())accept(msg);else if(clientConns[id]?.open)clientConns[id].send(msg);}catch(e){console.warn('Exploration state will be retried:',e);}}
    function publishAll(){for(const id of peers())publish(id);}
    function client(id,msg){
        if(!isHost||!clientConns[id]?.open||!otherPlayers[id]||!ensure())return;
        if(!['explore:claim','explore:sync','explore:ack'].includes(msg.type))return;
        if(msg.type==='explore:ack'){authority.ack(id,msg.id);return;}
        const now=Date.now(),budget=id+':'+msg.type,before=limits.get(budget)??-Infinity;
        if(now-before<(msg.type==='explore:sync'?1000:200))return;limits.set(budget,now);
        const refreshed=authority.tick();
        if(msg.type==='explore:claim'&&authority.claim(id,msg.id))publishAll();else if(refreshed)publishAll();else publish(id);
    }
    function interact(){
        if(!target||!position(me()))return false;
        const id=target;
        if(hosting()){if(authority?.claim(me(),id))publishAll();else publish(me());}
        else if(hostConn?.open)hostConn.send({type:'explore:claim',id});
        return true;
    }
    function prompt(el,button){
        target=null;if(!position(me())||!state||el.style.display!=='none')return;
        let best=RANGE;
        for(const [id,mesh] of meshes){const d=player.position.distanceTo(mesh.position);if(d<best){best=d;target=id;}}
        if(target){const find=meshes.get(target).userData.find;interactTarget='exploration';el.textContent='PRESS E TO SEARCH '+TYPES[find.type].name.toUpperCase();el.style.display='block';if(button)button.textContent='SEARCH';}
    }
    function tick(){
        if(!active()){if(key!==null){clear();authority=null;key=null;}return;}
        if(!ensure())return;const now=Date.now();
        if(now-lastTick>=2000){lastTick=now;if(hosting()){const changed=authority.tick();if(changed||!state)publishAll();else for(const id of peers())if(authority.pending.has(id))publish(id);}}
        if(!hosting()&&now-lastSync>=5000){lastSync=now;try{hostConn.send({type:'explore:sync'});}catch(e){console.warn('Exploration sync will retry:',e);}}
        const outdoors=!!position(me());
        for(const mesh of meshes.values()){mesh.visible=outdoors&&player.position.distanceToSquared(mesh.position)<120*120;const glint=mesh.getObjectByName('findGlint');if(mesh.visible&&glint){glint.rotation.y=now*.001;glint.position.y=.85+Math.sin(now*.003+mesh.position.x)*.07;}}
    }
    window.Exploration={tick,prompt,interact,client,host:accept,nearest(pos){let best=null,d=Infinity;for(const m of meshes.values()){const n=m.position.distanceToSquared(pos);if(n<d){best=m.position;d=n;}}return best;}};
})();
