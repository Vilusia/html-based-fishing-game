// The written guide remains available; these objectives use real gameplay, never grant items.
(function () {
    'use strict';
    const steps = [];
    const add = (id, chapter, title, text, goal = 'read', target = null, panel = null) => steps.push({id, chapter, title, text, goal, target, panel});
    add('welcome','Getting started','Your lakeside adventure','Follow the objectives and the blue direction arrow. Complete an action, then Continue. You can pause, revisit a chapter, or skip a task you cannot do yet. Purchases and optional activities are never required.');
    add('move','Getting started','Take a walk','Walk a few steps. Desktop: use your movement keys (WASD by default). Mobile: drag the bottom-left joystick.', 'move');
    add('look','Getting started','Look around','Desktop: drag the world / use your camera controls. Mobile: drag the world away from the buttons; pinch to zoom. Turn your view a little.', 'look');
    add('jump','Getting started','Jump and slide','Jump once (Space, or Jump on mobile). Double-tap Jump while airborne for a belly slide. Jump again to get up.', 'jump');
    add('sit','Getting started','Take a seat','Try sitting, then stand before walking on. Desktop: X by default. Mobile: Gear → Sit / stand.', 'sit');
    add('guide','Getting started','Meet the Tutorial guide','Follow the arrow to the ? NPC. Use Interact (E by default), or the mobile action button. This NPC opens the full written guide, which stays available alongside this walkthrough. Close each NPC menu before walking to the next stop.', 'npc','tutorial','tutorial-overlay');
    add('fisher','Fishing','Meet Old Fisher','Find Old Fisher and interact for fishing tips and the start of his quest chain. Progress keeps track of quests and rewards.', 'npc','fisher','fisher');
    add('shore','Fishing','Find somewhere to fish','Follow the arrow to a low shore. Stand on land beside water, with room to cast. If this map has no suitable shore, skip and try fishing on another map.', 'near','shore');
    add('rod','Fishing','Equip your rod','Select the rod in the hotbar. On mobile open Gear and tap the rod slot. Tools must be equipped before use.', 'rod');
    add('charge','Fishing','Aim and charge','Face the water. Hold your action / primary mouse button to charge a cast. Mobile: hold Fish. The cast marker must land in water. The Face water button below can help you aim.', 'charge','water');
    add('cast','Fishing','Release your cast','Release to throw the line into water. If it fails, turn toward the lake or move nearer the edge and try again.', 'cast','water');
    add('bite','Fishing','Wait for a bite','Leave the line in the water until the bite prompt appears. Acting too early cancels the cast. When a fish bites, press the action button promptly.', 'bite','water');
    add('reel','Fishing','Hook and reel','After the bite, press Action to hook the fish. Hold and release to keep the fish inside the green reeling zone. Mobile uses the same Fish / Reel button.', 'reel');
    add('catch','Fishing','Land your first fish','Keep reeling until the catch completes. If the fish escapes, cast again. Fishing XP grows your reeling zone; harder fish need better control and gear.', 'catch');
    add('inventory','Fishing','Inspect your catch','Open Inventory to see your fish and resources. Desktop: use the menu / Inventory. Mobile: Bag or Menu → Inventory.', 'panel',null,'inventory-overlay');
    add('zones','Fishing','Different waters, different catches','Lake, pond, ocean, cave, summit, Void and Lava waters have different fish. Time of day and weather affect some catches. Rare golden fish are valuable; you can keep special catches for house displays.');
    add('merchant','Shops & NPCs','Visit the Merchant','Follow the arrow and interact to open the Merchant. Sell fish and gathered resources for money. Keep any fish you want to cook, trade, or display.', 'npc','merchant','merchant-ui');
    add('sell','Shops & NPCs','Sell a catch','Use a fish Sell button at the Merchant to earn money. Selling is permanent: choose a fish you want to part with. Skip if you prefer to keep all your catches.', 'sold','merchant');
    add('shop','Shops & NPCs','Visit the Stylist / Shop','Interact with the Shop NPC. Browse rods, bobbers, tools, hats and other customization. Prices use game money. Buy only what you want; opening the shop completes this task.', 'npc','stylist','shop-overlay');
    add('bait','Shops & NPCs','Visit the Bait Shop','Interact with the Bait Shop. Bait helps target catches; select your purchased bait before fishing and watch your remaining supply. No purchase is required here.', 'npc','bait','bait-shop-overlay');
    add('scratch','Shops & NPCs','Meet Lucky Lou','Interact with Lucky Lou, the scratch dealer. Scratch cards cost game money and have random prizes; a prize is not guaranteed. Browsing is enough.', 'npc','scratch','scratch-overlay');
    add('captain','Shops & NPCs','Meet Captain Finn','Visit Captain Finn at the dock and interact. His menu sells and launches shared boats with passenger seats. The owner controls launching; players can board together. No boat purchase is required.', 'npc','boatmaster');
    add('guard','Shops & NPCs','Find the Inferno Guard','Walk up to the Inferno Guard. He sells access to the Lava world, where special fish and local Merchant, Shop and Bait NPCs await. Read the price before buying; this walkthrough does not require unlocking it.', 'near','lava');
    add('morrow','Shops & NPCs','Meet Morrow','Visit the seasonal vendor and interact while the event is active. Seasonal fish, embers, collection rewards and cosmetics may be available. If Morrow is absent or the event has ended, this step moves on automatically.', 'npc','halloween','halloween-overlay');
    add('ghost','Shops & NPCs','The elusive Ghost Cat','Ghost Cat is a rare encounter rather than a permanent shop. Explore and watch for unusual visitors; you do not have to wait for a rare spawn to finish this guide.');
    add('skills','Skills & gathering','Check your skills','Open Skills to inspect Fishing, Lumberjack, Mining, Floristry, Cooking, Trading and Sailing progress. Activities earn their own XP and unlock improvements.', 'panel',null,'skills-ui');
    add('flowers','Skills & gathering','Pick a flower','Walk up to a pickable flower and interact. Flowers can be sold and build Floristry XP. Only available flowers count; picked flowers need time to return.', 'floristry','flower');
    add('wood','Skills & gathering','Try woodcutting','Equip an owned axe and use it on a tree to earn wood and Lumberjack XP. Buy an axe from the Shop when you can afford it; skip this task until then.', 'lumberjack','tree');
    add('mining','Skills & gathering','Try mining','Equip an owned pickaxe and use it on a mineable rock to collect resources and Mining XP. Tools come from the Shop; skip if you do not own one yet.', 'mining','rock');
    add('cooking','Skills & gathering','Open Cooking','Open Cooking from the menu (mobile: Menu → Cooking). Choose an eligible fish and review the recipe and ingredient costs. Cooking changes the fish you use.', 'panel',null,'cooking-ui');
    add('cook','Skills & gathering','Try a recipe','If you have ingredients, start a recipe and follow the timing prompts. Successful cooking improves fish value; mistakes can burn it. Complete an attempt, or skip to save your ingredients.', 'cooking');
    add('progress','Progress & collections','Follow your goals','Open Progress. Browse quests, bounties and achievements and claim earned rewards. Old Fisher’s quest chain gives you longer-term fishing goals.', 'panel',null,'progress-overlay');
    add('journal','Progress & collections','Your fishing journal','Open Journal and browse fish entries and Collections. Fill out your discoveries across different waters, weather and times of day; check what you still need.', 'panel',null,'journal-overlay');
    add('find','Exploration','Search for treasure','Follow the arrow to a shared exploration find and interact to search it. The first collector gets money; it disappears for everyone. Finds refresh periodically on default and custom maps.', 'find','find');
    add('worlds','Exploration','Explore further','Explore islands by boat, look for cave and summit waters, and watch for Void portals. Special worlds have their own fish. Return to the main island before continuing the NPC route; you can skip tasks on maps without those features.');
    add('props','Building & home','Open your Props menu','Desktop: I by default. Mobile: Gear → Place props. Browse outdoor props, including bushes. Most decorations need a one-time unlock; once owned, placement is free. One player home per player; placement limits keep rooms running smoothly.', 'panel',null,'props-ui');
    add('place','Building & home','Place a decoration','Choose an owned prop, aim at a valid spot and place it using the on-screen prompt (mobile: Place). Use Undo for mistakes. Respect other players’ space. Skip if you are saving for your first unlock.', 'prop');
    add('house','Building & home','Enter your home','Place your player home from Props if you do not have one. Approach its entrance and interact to enter. Use the exit to return outside. Skip if you are not ready for a house.', 'home','house');
    add('decorate','Building & home','Make it yours','Inside your own house, Customize offers upgrades, layout, colors, walls and doors. Buy and arrange furniture, set up TVs or stream queues, and display favorite catches. Review prices before buying. Visitors follow your home permissions.');
    add('boat','Boats','Take to the water','Board a shared boat at the dock, or equip an owned personal rowboat from Misc tools. Sail to islands and fish offshore. Captain Finn manages shared boats; the personal rowboat is separate. Skip if you do not have boat access.', 'boat','boatmaster');
    add('sail','Boats','Go for a short sail','Move your boat a few steps using movement controls / the mobile joystick. Shared-boat passengers ride with the driver; use its boarding and exit prompts at safe locations.', 'sail');
    add('players','Social & tools','Meet your neighbors','Open Players from the menu to see who is here. Player actions include trading and house visits where allowed. Trades require both players’ approval: check both offers before accepting.', 'panel',null,'player-list-overlay');
    add('chat','Social & tools','Chat and voice','Desktop: Enter opens text chat; V uses voice with your selected voice mode. Mobile: Chat and Menu audio controls. Microphone permission is optional. You can mute voice and adjust volumes in settings; never share private information.');
    add('emotes','Social & tools','Try your emote wheel','Open the emote wheel (C by default; mobile: Gear → Emotes). Choose an owned emote to express yourself; the wheel can be customized. Browsing is enough.', 'panel',null,'emote-overlay');
    add('toys','Social & tools','Show off and play','F shows an owned fish; mobile has a Show fish action. Guitar, glove and meow tools have their own actions in Gear or the hotbar. Equip owned tools first. You can place and undo props without leaving the game.');
    add('tournament','Events','Check the tournament','Open Tournament from the menu. Hourly fishing tournaments track eligible catches while active. Check the timer and results for prize money; you do not have to wait for a tournament to finish this guide.', 'panel',null,'tournament-overlay');
    add('events','Events','Seasonal adventures','Seasonal events run on their advertised dates. Visit Morrow for event progress and rewards, catch seasonal fish, and use the event collection to track discoveries. Seasonal content is optional and may be unavailable outside the event.');
    add('maps','Maps & settings','Find your next lake','The main menu lets you host or join public or private rooms and filter the server browser by tags. Hosts can load custom maps. The level editor builds terrain, fishing zones, NPC placements, caves and docks; generated oceans surround custom islands.');
    add('settings','Maps & settings','Make yourself comfortable','Settings has key bindings, audio, graphics, camera and character options. Mobile has Gear and Menu sheets, joystick movement, drag-to-look and pinch zoom in either orientation. The written guide covers every chapter here and can be reopened anytime.');
    add('finish','Maps & settings','Ready for your own adventure','You have reached the end! Continue to finish, or revisit any chapter. Skipped activities can be practiced later by restarting the walkthrough from Settings, the written guide, or the mobile Menu.');

    const chapters = [...new Set(steps.map(s => s.chapter))];
    function normalize(p) {
        return {index:Math.max(0,Math.min(steps.length-1,Number.isInteger(p?.index)?p.index:0)), paused:p?.paused===true,
            events:Object.fromEntries(Object.entries(p?.events||{}).filter(([k,v])=>['charge','cast','bite','reel','catch','sold','fisher'].includes(k)&&v===true)),
            skipped:Array.isArray(p?.skipped)?p.skipped.filter(s=>steps.some(x=>x.id===s)).slice(0,steps.length):[]};
    }
    // Screen-space direction works for targets on screen, off screen and behind the camera.
    function marker(x,y,behind,width,height) {
        if(behind){x=-x;y=-y;if(Math.abs(x)+Math.abs(y)<.01)y=-1;}
        const halfX=Math.max(1,width/2-36),halfY=Math.max(1,height/2-80),scale=Math.max(1,Math.abs(x)/halfX,Math.abs(y)/halfY);
        return {x:width/2+x/scale,y:height/2+y/scale,angle:Math.atan2(y,x)*180/Math.PI+90};
    }
    const rules={steps,chapters,normalize,marker};
    if(typeof module==='object'&&module.exports)module.exports=rules;
    if(typeof window==='undefined'||typeof document==='undefined')return;
    window.GuidedTutorialRules=rules;
    let progress=null, box=null, brief=null, arrow=null, baseline=null, shore=null, shoreKey='', last=0, ready=false, stepReadyAt=0, minimized=false, detailsOpen=false, wasActive=false, stepItems=[], chapterGroups=[];
    const $=id=>document.getElementById(id);
    function shortText(text){
        const match=String(text||'').match(/^.*?[.!?](?=\s|$)/);
        return (match?match[0]:String(text||'')).trim();
    }
    function syncBrief(s){
        if(!brief)return;
        const show=!!s&&s.goal==='read';
        brief.hidden=!show;
        if(box)box.classList.toggle('tour-briefing',show);
        if(!show)return;
        $('tutorial-brief-kicker').textContent=s.chapter+' · Auto continues';
        $('tutorial-brief-title').textContent=s.title;
        $('tutorial-brief-text').textContent=s.text;
    }
    function positionTour(){
        if(!box||box.hidden)return;
        const hud=document.getElementById('tournament-hud');
        if(!hud){box.style.bottom='';return;}
        const style=getComputedStyle(hud);
        // The mobile sheet renders the tournament inline; only a fixed HUD can
        // push the quest card upward.
        if(hud.hidden||style.display==='none'||style.visibility==='hidden'||style.position!=='fixed'){
            box.style.bottom='';
            return;
        }
        const rect=hud.getBoundingClientRect();
        if(!rect.height)return;
        // Anchor ads change --game-anchor-space and move the tournament HUD.
        // Measure the real rect so the card clears it in every layout.
        const next=Math.max(12,Math.round(innerHeight-rect.top+10));
        const value=next+'px';
        if(box.style.bottom!==value)box.style.bottom=value;
    }
    function visible(id){const el=$(id);return !!el&&!el.hidden&&getComputedStyle(el).display!=='none';}
    function active(){return typeof player!=='undefined'&&!!player&&$('lobby-screen')?.style.display==='none';}
    function outside(){return !window.Housing?.inside&&!isInVoid&&!isInLavaWorld;}
    function persist(){saveState.tutorialProgress=normalize(progress);saveGame();}
    function event(name){
        if(saveState.tutorialDone)return;
        if(!progress)progress=normalize(saveState.tutorialProgress);
        if(!progress.events[name]){progress.events[name]=true;persist();}
    }
    function snapshot(){return {pos:player.position.clone(),yaw:cameraRotationY,pitch:cameraRotationX,props:saveState.propsPlaced||0,finds:saveState.explorationStats?.finds||0,xp:Object.fromEntries(['floristry','lumberjack','mining','cooking'].map(k=>[k,saveState.skills?.[k]?.xp||0]))};}
    function npc(type){
        if(!outside())return null;
        if(window.CUSTOM_LEVEL&&type!=='lava'&&!window.CUSTOM_LEVEL.npcs?.some(n=>n.type===type))return null;
        const meshes={merchant:typeof npcMerchant!=='undefined'?npcMerchant:null,stylist:typeof npcStylist!=='undefined'?npcStylist:null,bait:typeof npcBait!=='undefined'?npcBait:null,tutorial:typeof npcTutorial!=='undefined'?npcTutorial:null,fisher:typeof npcFisher!=='undefined'?npcFisher:null,lava:typeof npcLavaKeeper!=='undefined'?npcLavaKeeper:null,scratch:typeof npcScratch!=='undefined'?npcScratch:null,boatmaster:window.Boats?.captain,halloween:window.Halloween?.vendor};
        const mesh=meshes[type];return mesh&&mesh.visible!==false?mesh:null;
    }
    function findShore(){
        if(!outside())return null;
        const key=String(window.CUSTOM_LEVEL?.seed||'default')+':'+Math.round(player.position.x/80)+':'+Math.round(player.position.z/80);
        if(key===shoreKey)return shore;shoreKey=key;shore=null;
        for(const r of [0,6,12,24,40,65,100,160,260])for(let i=0;i<24;i++){
            const x=player.position.x+Math.sin(i*Math.PI/12)*r,z=player.position.z+Math.cos(i*Math.PI/12)*r;
            if(waterSurfaceAt(x,z)!==null)continue;
            const y=getTerrainHeight(x,z);
            for(let j=0;j<12;j++){const wx=x+Math.sin(j*Math.PI/6)*7,wz=z+Math.cos(j*Math.PI/6)*7,w=waterSurfaceAt(wx,wz);if(w!==null&&Math.abs(y-w)<2.5){shore={land:new THREE.Vector3(x,y,z),water:new THREE.Vector3(wx,w,wz)};return shore;}}
        }return null;
    }
    function target(step){
        if(!step.target)return null;
        if(step.target==='shore'||step.target==='water'){const s=findShore();return s?(step.target==='shore'?s.land:s.water):null;}
        if(step.target==='find')return outside()?window.Exploration?.nearest(player.position):null;
        if(step.target==='house'){if(!outside())return null;return Object.values(typeof props==='object'?props:{}).find(p=>p.userData?.propData?.type==='house'&&(p.userData.propData.owner===myPeerId||p.userData.propData.placer===myDeviceID))?.position||null;}
        if(['flower','tree','rock'].includes(step.target)){
            if(!outside())return null;const list=step.target==='flower'?(typeof pickableFlowers!=='undefined'?pickableFlowers:[]):(typeof treeMeshes!=='undefined'?treeMeshes:[]);
            let best=null,d=Infinity;for(const m of list){if(!m.visible||m.userData?.isPicked||m.userData?.isStump)continue;if(step.target==='tree'&&!m.userData?.isTree||step.target==='rock'&&!m.userData?.isRock)continue;const dist=m.position.distanceToSquared(player.position);if(dist<d){d=dist;best=m.position;}}return best;
        }
        return npc(step.target)?.position||null;
    }
    function done(step,t){
        if(step.goal==='read')return true;
        if(progress.events[step.goal])return true;
        if(step.goal==='panel')return visible(step.panel);
        if(step.goal==='near')return !!t&&player.position.distanceTo(t)<6;
        if(step.goal==='npc')return !!t&&player.position.distanceTo(t)<9&&(step.panel==='fisher'?progress.events.fisher:step.panel?visible(step.panel):step.target==='boatmaster'?visible('boat-dock-menu'):false);
        if(step.goal==='move')return player.position.distanceTo(baseline.pos)>3;
        if(step.goal==='look')return Math.abs(cameraRotationY-baseline.yaw)+Math.abs(cameraRotationX-baseline.pitch)>.25;
        if(step.goal==='jump')return player.position.y>getTerrainHeight(player.position.x,player.position.z)+.4;
        if(step.goal==='sit')return isSitting;
        if(step.goal==='rod')return equippedToolFromSave()==='rod';
        if(baseline.xp[step.goal]!==undefined)return (saveState.skills?.[step.goal]?.xp||0)>baseline.xp[step.goal];
        if(step.goal==='find')return (saveState.explorationStats?.finds||0)>baseline.finds;
        if(step.goal==='prop')return (saveState.propsPlaced||0)>baseline.props;
        if(step.goal==='home')return !!window.Housing?.inside;
        if(step.goal==='boat')return isSailing||!!window.Boats?.isAboard();
        if(step.goal==='sail')return (isSailing||window.Boats?.isAboard())&&player.position.distanceTo(baseline.pos)>5;
        return false;
    }
    function buildStepList(){
        const list=$('tour-steps');if(!list)return;
        stepItems=[];chapterGroups=[];
        let chapter='',groupList=null,group=null;
        for(let i=0;i<steps.length;i++){
            const s=steps[i];
            if(s.chapter!==chapter){
                chapter=s.chapter;
                group=document.createElement('li');group.className='tour-chapter-group';group._chapter=chapter;
                const heading=document.createElement('div');heading.className='tour-chapter-name';heading.textContent=chapter;group.append(heading);
                groupList=document.createElement('ol');groupList.className='tour-chapter-list';group.append(groupList);list.append(group);
                chapterGroups.push(group);
            }
            const item=document.createElement('li');item.className='tour-step';
            const mark=document.createElement('span');mark.className='tour-mark';mark.textContent='○';
            const body=document.createElement('div');body.className='tour-step-body';
            const title=document.createElement('span');title.className='tour-step-title';title.textContent=s.title;
            body.append(title);item.append(mark,body);
            item._mark=mark;item._chapter=chapter;
            stepItems.push(item);groupList.append(item);
        }
    }
    function syncStepList(){
        if(!stepItems.length||!progress)return;
        const chapter=steps[progress.index].chapter;
        for(const group of chapterGroups)group.hidden=group._chapter!==chapter;
        for(let i=0;i<stepItems.length;i++){
            const item=stepItems[i],done=i<progress.index,current=i===progress.index;
            item.classList.toggle('tour-step-done',done);
            item.classList.toggle('tour-step-current',current);
            item.classList.toggle('tour-step-ready',current&&ready);
            item.classList.toggle('tour-step-future',i>progress.index);
            item._mark.textContent=done?'✓':current?(ready?'✓':'●'):'○';
            if(current)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
        }
        const current=stepItems[progress.index];
        if(current&&typeof current.scrollIntoView==='function')current.scrollIntoView({block:'nearest'});
    }
    function init(){
        if(box)return;box=$('guided-tour');if(!box)return;document.body.append(box);box.removeAttribute('style');box.hidden=true;
        box.onclick=e=>e.target.closest?.('button')?.blur();
        box.innerHTML='<header class="tour-head"><div class="tour-heading"><span class="tour-kicker" id="tour-counter"></span><strong id="tour-title"></strong></div><div class="tour-actions"><button type="button" class="tour-icon" id="tour-details-toggle" aria-label="Show step details" aria-expanded="false">?</button><button type="button" class="tour-icon" id="tour-pause" aria-label="Pause tutorial">Ⅱ</button><button type="button" class="tour-icon" id="tour-minimize" aria-label="Collapse tutorial" aria-expanded="true">−</button></div></header><div class="tour-progress" aria-hidden="true"><span id="tour-progress-bar"></span></div><div id="tour-body"><div class="tour-now"><span class="tour-now-label">Do this</span><p id="guided-tour-text"></p></div><p id="tour-objective" role="status" aria-live="polite"></p><button type="button" class="tour-link" id="tour-face" hidden>Face water</button><div id="tour-details" hidden><p id="tour-detail-text"></p><label class="tour-chapter">Chapter <select id="tour-chapter" aria-label="Tutorial chapter"></select></label></div><ol id="tour-steps" class="tour-steps" aria-label="Tutorial steps"></ol><footer><span id="tour-auto-status">Auto-advances when complete</span><button type="button" class="tour-link" id="tour-skip">Skip</button></footer></div>';
        const select=$('tour-chapter');chapters.forEach(c=>{const o=document.createElement('option');o.textContent=c;o.value=c;select.append(o);});select.onchange=()=>enter(steps.findIndex(s=>s.chapter===select.value));
        function syncDetails(){
            $('tour-details').hidden=!detailsOpen;
            $('tour-details-toggle').setAttribute('aria-expanded',String(detailsOpen));
            $('tour-details-toggle').setAttribute('aria-label',detailsOpen?'Hide step details':'Show step details');
        }
        $('tour-minimize').onclick=()=>{minimized=!minimized;$('tour-body').hidden=minimized;box.classList.toggle('tour-min',minimized);$('tour-minimize').textContent=minimized?'+':'−';$('tour-minimize').setAttribute('aria-expanded',String(!minimized));};
        $('tour-details-toggle').onclick=()=>{detailsOpen=!detailsOpen;syncDetails();};
        $('tour-pause').onclick=pause;
        $('tour-skip').onclick=()=>{progress.skipped.push(steps[progress.index].id);advance();};
        $('tour-face').onclick=()=>{const s=findShore();if(s){const h=Math.atan2(s.water.x-player.position.x,s.water.z-player.position.z);player.rotation.y=h;cameraRotationY=h+Math.PI;}};
        buildStepList();
        arrow=document.createElement('div');arrow.id='tutorial-arrow';arrow.hidden=true;arrow.innerHTML='<span>▲</span><small></small>';document.body.append(arrow);
        brief=document.createElement('div');brief.id='tutorial-brief';brief.hidden=true;brief.setAttribute('role','status');brief.setAttribute('aria-live','polite');
        brief.innerHTML='<span class="tutorial-brief-kicker" id="tutorial-brief-kicker"></span><h3 id="tutorial-brief-title"></h3><p id="tutorial-brief-text"></p><span class="tutorial-brief-note">Continuing automatically</span>';
        document.body.append(brief);
    }
    function enter(index){progress.index=index;baseline=snapshot();ready=false;stepReadyAt=0;shoreKey='';persist();render();}
    function render(){
        const s=steps[progress.index],position=progress.index+1;
        box.classList.remove('tour-ready');
        box.dataset.ready='false';
        $('tour-objective').textContent='Complete the objective and the guide advances automatically.';
        $('tour-auto-status').textContent='Auto-advances when complete';
        $('tour-counter').textContent=s.chapter+' · '+position+' / '+steps.length;
        $('tour-title').textContent=s.title;
        $('guided-tour-text').textContent=shortText(s.text);
        $('tour-detail-text').textContent=s.text;
        $('tour-progress-bar').style.width=((position/steps.length)*100).toFixed(2)+'%';
        $('tour-chapter').value=s.chapter;
        $('tour-face').hidden=!['shore','water'].includes(s.target);
        syncBrief(s);
        syncStepList();
        positionTour();
    }
    function advance(){if(progress.index===steps.length-1){saveState.tutorialDone=true;progress.paused=true;persist();box.hidden=arrow.hidden=true;if(brief)brief.hidden=true;showToast('Tutorial complete! Replay it anytime from Settings or the guide.');return;}enter(progress.index+1);}
    function next(){if(ready)advance();}
    function pause(){if(!progress)return;progress.paused=true;persist();box.hidden=arrow.hidden=true;if(brief)brief.hidden=true;showToast('Tutorial paused. Resume from Settings, the written guide, or the mobile Menu.');}
    function resume(restart=false){
        init();if(!box||!active())return;
        if(restart||saveState.tutorialDone){progress=normalize(null);saveState.tutorialDone=false;}else progress=normalize(saveState.tutorialProgress);
        progress.paused=false;minimized=false;detailsOpen=false;stepReadyAt=0;
        $('tour-body').hidden=false;$('tour-details').hidden=true;
        $('tour-minimize').textContent='−';$('tour-minimize').setAttribute('aria-expanded','true');
        $('tour-details-toggle').setAttribute('aria-expanded','false');$('tour-details-toggle').setAttribute('aria-label','Show step details');
        box.classList.remove('tour-min','tour-ready');
        window.MobileUI?.close();if(visible('options-overlay'))window.toggleOptions?.();document.exitPointerLock?.();enter(progress.index);box.hidden=false;syncStepList();positionTour();
    }
    function tick(){
        if(!active()){if(box)box.hidden=true;if(arrow)arrow.hidden=true;if(brief)brief.hidden=true;wasActive=false;return;}
        if(!wasActive){wasActive=true;progress=normalize(saveState.tutorialProgress);if(!saveState.tutorialDone&&!progress.paused)resume();}
        if(!box||!progress||progress.paused||saveState.tutorialDone)return;box.hidden=false;
        const now=performance.now();if(now-last<100)return;last=now;
        positionTour();
        const s=steps[progress.index],t=target(s),unavailable=!!s.target&&!t;
        const complete=done(s,t)||unavailable;
        if(!ready&&complete){
            ready=true;
            stepReadyAt=now+(unavailable?1600:s.goal==='read'?Math.min(8000,2800+shortText(s.text).length*42):900);
            box.classList.add('tour-ready');
            box.dataset.ready='true';
            syncStepList();
        }
        if(ready&&stepReadyAt&&!detailsOpen&&now>=stepReadyAt){stepReadyAt=0;advance();return;}
        $('tour-objective').textContent=complete?(unavailable?'Not available on this map. Moving on automatically.':'Step complete. Moving on automatically.'):'Complete the objective and the guide advances automatically.';
        $('tour-auto-status').textContent=ready?(detailsOpen?'Complete — close Details to continue.':'Complete — moving on…'):'Auto-advances when complete';
        arrow.hidden=!t||minimized||visible('tutorial-overlay')||window.Housing?.inside;
        if(!arrow.hidden){const world=t.clone();world.y+=2;const view=world.clone().applyMatrix4(camera.matrixWorldInverse),p=world.project(camera),m=marker(p.x*innerWidth/2,-p.y*innerHeight/2,view.z>0,innerWidth,innerHeight);arrow.style.left=m.x+'px';arrow.style.top=m.y+'px';arrow.firstElementChild.style.transform=`rotate(${m.angle}deg)`;arrow.lastElementChild.style.left=(Math.max(100,Math.min(innerWidth-100,m.x))-m.x+18)+'px';arrow.lastElementChild.textContent=`${s.target==='water'?'Cast here':s.title.replace(/^(Meet|Visit|Find) /,'')} · ${Math.round(player.position.distanceTo(t))}m`;}
    }
    window.GuidedTutorial={tick,resume,pause,next,event};
})();
