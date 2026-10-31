const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const ctx=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../tournaments.js'),'utf8'),ctx);const {Tournament,HOUR}=ctx.window.TournamentRules;
test('host counts valid casts once, rejects forged, fast, stale and unknown catches',()=>{let now=10000;const t=new Tournament(()=>now,n=>n==='Trout');const msg=(type,token='a',fish='Trout')=>({type:'tournament:'+type,hour:t.hour,token,fish});assert(!t.receive('a','Alice',msg('catch')));t.receive('a','Alice',msg('cast'));assert(!t.receive('a','Alice',msg('catch')));now+=3000;t.receive('a','Alice',msg('cast','b'));now+=3000;assert(t.receive('a','Alice',msg('catch','b')));assert(!t.receive('a','Alice',msg('catch','b')));t.receive('b','Bob',msg('cast'));now+=3000;assert(!t.receive('b','Bob',msg('catch','a','fake')));assert.equal(t.rank()[0].count,1);now=HOUR;t.tick();assert.equal(t.pending.get('a'),5);assert(!t.result.canceled);assert.equal(t.rank().length,0);t.tick();assert.equal(t.pending.get('a'),5);});
test('tournament menu shows ten places and announces each round only once',()=>{
    const element=()=>({style:{},children:[],textContent:'',append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];}});
    const ids=Object.fromEntries(['tournament-status','tournament-standings','tournament-winners'].map(id=>[id,element()]));
    const announcements=[],toasts=[];let tick;
    const context=vm.createContext({window:{},document:{createElement:element,body:element(),getElementById:id=>ids[id]},setInterval:fn=>{tick=fn;},Date,crypto:{randomUUID:()=> 'test'},myPeerId:'me',currentRoomId:'room',isHost:false,hostConn:{open:true},showToast:t=>toasts.push(t),displayChatMessage:(name,text)=>announcements.push(text),saveState:{money:0},saveGame(){}});
    vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../tournaments.js'),'utf8'),context);
    const packet={type:'tournament:state',hour:1,remaining:60000,mine:3,leaders:[{id:'me',name:'<Alice>',count:3}],previous:[]};
    context.window.Tournaments.host(packet);context.window.Tournaments.host(packet);
    assert.equal(announcements.length,1);assert.equal(ids['tournament-standings'].children.length,10);
    assert.equal(ids['tournament-standings'].children[0].children[1].textContent,'<Alice> (you)');
    assert.match(ids['tournament-status'].textContent,/Your catches: 3/);
    const next={...packet,hour:2,mine:0,leaders:[],previous:[{name:'Alice',count:3,prize:5000}]};
    context.window.Tournaments.host(next);context.window.Tournaments.host(next);
    assert.equal(announcements.length,3);assert.match(announcements[1],/Round finished/);assert.match(ids['tournament-winners'].textContent,/Alice/);
    context.hostConn.open=false;tick();assert.match(ids['tournament-status'].textContent,/Start playing/);
});
test('every participant earns per catch with no minimums, including players outside the top ten',()=>{
    for(const counts of [[1],[5,5],[3,3,3],Array(16).fill(1),[1,6,2,3],[]]){
        let now=10000;const t=new Tournament(()=>now,()=>true);
        counts.forEach((count,index)=>{for(let n=0;n<count;n++){
            const id=String(index),token=id+'-'+n;
            assert(t.receive(id,id,{type:'tournament:cast',hour:0,token}));now+=3000;
            assert(t.receive(id,id,{type:'tournament:catch',hour:0,token,fish:'Trout'}));
        }});
        const ranked=t.rank().map(v=>v.id);
        const expected=(count,i)=>count*5+(counts.length>=3?([5000,2500,1000][ranked.indexOf(String(i))]||0):0);
        now=HOUR;t.tick();assert.equal(t.result.canceled,false);assert.equal(t.pending.size,counts.length);
        counts.forEach((count,i)=>assert.equal(t.pending.get(String(i)),expected(count,i)));
        t.tick();counts.forEach((count,i)=>assert.equal(t.pending.get(String(i)),expected(count,i)));
    }
});
test('offline solo play counts catches and pays exactly once at the hourly boundary',()=>{
    let now=10000,tick,saves=0,serial=0;class Clock extends Date{static now(){return now;}}
    const element=()=>({style:{},children:[],textContent:'',append(...v){this.children.push(...v);},replaceChildren(){this.children=[];}});
    const nodes=Object.fromEntries(['tournament-status','tournament-standings','tournament-winners'].map(id=>[id,element()]));nodes['lobby-screen']={style:{display:'none'}};
    const context=vm.createContext({window:{},Date:Clock,document:{body:element(),createElement:element,getElementById:id=>nodes[id]},setInterval:fn=>{tick=fn;},crypto:{randomUUID:()=> 'solo-'+(++serial)},myPeerId:null,currentRoomId:null,isHost:false,hostConn:null,clientConns:{},player:{},FISH_TYPES:[{name:'Trout'}],RAIN_FISH:[],VOID_FISH:[],LAVA_FISH:[],saveState:{money:0,displayName:'Solo'},saveGame(){saves++;},showToast(){},displayChatMessage(){}});
    vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../tournaments.js'),'utf8'),context);
    tick();context.window.Tournaments.cast();now+=3000;context.window.Tournaments.caught({name:'Trout'});tick();assert.match(nodes['tournament-status'].textContent,/Your catches: 1/);assert.match(nodes['tournament-status'].textContent,/Reward so far: \$5/);
    now=HOUR;tick();assert.equal(context.saveState.money,5);assert.equal(saves,1);tick();assert.equal(context.saveState.money,5);assert.equal(saves,1);
});
test('podium projections activate only after three valid participants and settle once',()=>{
    let now=10000;const t=new Tournament(()=>now,()=>true);
    const catchOne=id=>{const token=id+'-'+now;t.receive(id,id,{type:'tournament:cast',hour:0,token});now+=3000;assert(t.receive(id,id,{type:'tournament:catch',hour:0,token,fish:'Trout'}));};
    catchOne('first');catchOne('second');assert.equal(t.snapshot('first').reward,5);assert.equal(t.snapshot('second').reward,5);
    t.receive('spectator','Spectator',{type:'tournament:cast',hour:0,token:'no-catch'});assert.equal(t.snapshot('first').players,2);
    catchOne('third');assert.equal(t.snapshot('first').reward,5005);assert.equal(t.snapshot('second').reward,2505);assert.equal(t.snapshot('third').reward,1005);
    catchOne('fourth');assert.equal(t.snapshot('fourth').reward,5);
    now=HOUR;t.tick();assert.equal(t.pending.get('first'),5005);assert.equal(t.pending.get('third'),1005);assert(!t.pending.has('spectator'));t.tick();assert.equal(t.pending.get('first'),5005);
});

test('departures remove current scores and casts, and rejoining cannot duplicate the old entry',()=>{
 let now=10000;const t=new Tournament(()=>now,()=>true);
 const catchOne=(id,token)=>{assert(t.receive(id,'Alice',{type:'tournament:cast',hour:0,token}));now+=3000;assert(t.receive(id,'Alice',{type:'tournament:catch',hour:0,token,fish:'Trout'}));};
 catchOne('old-peer','first');assert.equal(t.snapshot('old-peer').players,1);
 t.receive('old-peer','Alice',{type:'tournament:cast',hour:0,token:'abandoned'});assert(t.remove('old-peer'));assert.equal(t.snapshot('old-peer').players,0);assert.equal(t.snapshot('old-peer').totalFish,0);assert(!t.casts.has('old-peer'));
 now+=3000;assert(!t.receive('old-peer','Alice',{type:'tournament:catch',hour:0,token:'abandoned',fish:'Trout'}));assert.equal(t.remove('old-peer'),false);
 catchOne('new-peer','next');assert.equal(t.rank().length,1);assert.equal(t.rank()[0].id,'new-peer');assert.equal(t.rank()[0].count,1);
});
test('closed connections are pruned before podium eligibility and hourly payouts',()=>{
 let now=10000;const t=new Tournament(()=>now,()=>true);
 for(const id of ['host','staying','leaving']){t.receive(id,id,{type:'tournament:cast',hour:0,token:id});now+=3000;t.receive(id,id,{type:'tournament:catch',hour:0,token:id,fish:'Trout'});}
 assert.equal(t.snapshot('host').reward,5005);t.syncConnected(['host','staying']);assert.equal(t.snapshot('host').players,2);assert.equal(t.snapshot('host').reward,5);
 now=HOUR;t.tick();assert.equal(t.pending.get('host'),5);assert.equal(t.pending.get('staying'),5);assert(!t.pending.has('leaving'));assert.equal(t.previous.length,2);
});
test('host disconnect callback publishes cleanup immediately and handles a new peer ID',()=>{
 let now=10000,tick;class Clock extends Date{static now(){return now;}}
 const el=()=>({style:{},append(){},replaceChildren(){}}),nodes={'lobby-screen':{style:{display:'none'}}};const messages=[];
 const conns={old:{open:true,send:msg=>messages.push(msg)},observer:{open:true,send:msg=>messages.push(msg)}};
 const context=vm.createContext({window:{},Date:Clock,document:{body:el(),createElement:el,getElementById:id=>nodes[id]},setInterval:fn=>tick=fn,crypto:{randomUUID:()=> 'local'},myPeerId:'host',currentRoomId:'room',isHost:true,hostConn:null,clientConns:conns,otherPlayers:{old:{lastData:{name:'Alice'}},observer:{lastData:{name:'Observer'}}},player:{},FISH_TYPES:[{name:'Trout'}],RAIN_FISH:[],VOID_FISH:[],LAVA_FISH:[],saveState:{money:0,displayName:'Host'},saveGame(){},showToast(){},displayChatMessage(){}});
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../tournaments.js'),'utf8'),context);tick();const api=context.window.Tournaments;
 api.client('old',{type:'tournament:cast',hour:0,token:'one'});now+=3000;api.client('old',{type:'tournament:catch',hour:0,token:'one',fish:'Trout'});tick();assert.equal(messages.at(-1).players,1);
 api.onPlayerLeft('old');assert.equal(messages.at(-1).players,0);conns.old.open=false;delete context.otherPlayers.old;
 conns.rejoined={open:true,send:msg=>messages.push(msg)};context.otherPlayers.rejoined={lastData:{name:'Alice'}};api.client('rejoined',{type:'tournament:cast',hour:0,token:'two'});now+=3000;api.client('rejoined',{type:'tournament:catch',hour:0,token:'two',fish:'Trout'});tick();assert.equal(messages.at(-1).players,1);assert.equal(messages.at(-1).leaders[0].id,'rejoined');
});
