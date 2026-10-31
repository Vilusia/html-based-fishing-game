// Purchasable emotes, configurable wheel and clock-independent peer playback.
(function(){
 const catalog=[{id:'wave',name:'Wave',price:100,duration:3,mark:'HELLO'},{id:'cheer',name:'Cheer',price:250,duration:3,mark:'YAY!'},{id:'bow',name:'Bow',price:250,duration:2.5,mark:'THANKS'},{id:'spin',name:'Spin',price:400,duration:2.5,mark:'TWIRL'},{id:'dance',name:'Dance',price:500,duration:5,mark:'DANCE'}];

 catalog.push(...[{"id":"clap","name":"Applause","price":200,"duration":3,"mark":"CLAP","description":"Clap for a great catch."},{"id":"shrug","name":"Shrug","price":150,"duration":3,"mark":"WHO KNOWS","description":"A little shoulder shrug."},{"id":"point","name":"Point","price":200,"duration":3,"mark":"LOOK!","description":"Point something out to your friends."},{"id":"salute","name":"Salute","price":300,"duration":3,"mark":"AHOY","description":"A crisp lakeside salute."},{"id":"facepalm","name":"Facepalm","price":300,"duration":3,"mark":"OOPS","description":"For the fish that got away."},{"id":"laugh","name":"Laugh","price":250,"duration":4,"mark":"HAHA","description":"Have a hearty laugh."},{"id":"cry","name":"Sob","price":250,"duration":4,"mark":"SNIFF","description":"Wipe away a few dramatic tears."},{"id":"shiver","name":"Shiver","price":200,"duration":3,"mark":"BRRR","description":"Shake off the cold."},{"id":"stretch","name":"Stretch","price":250,"duration":4,"mark":"STRETCH","description":"Loosen up after a long fishing session."},{"id":"yawn","name":"Yawn","price":200,"duration":4,"mark":"YAAWN","description":"Cover a big sleepy yawn."},{"id":"flex","name":"Flex","price":400,"duration":4,"mark":"STRONG","description":"Show off both arms."},{"id":"heart","name":"Heart","price":500,"duration":4,"mark":"LOVE","description":"Bring your hands together in front of you."},{"id":"disco","name":"Disco","price":750,"duration":5,"mark":"GROOVE","description":"Point up and groove to your own beat."},{"id":"robot","name":"Robot","price":750,"duration":5,"mark":"BEEP","description":"Dance with stiff mechanical arm movements."},{"id":"sway","name":"Sway","price":350,"duration":5,"mark":"CHILL","description":"A relaxed side-to-side dance."},{"id":"happyhop","name":"Happy Hops","price":500,"duration":4,"mark":"WOO!","description":"Bounce with excitement."},{"id":"stomp","name":"Stomp","price":350,"duration":3,"mark":"HMPH","description":"Stamp and shake your fists."},{"id":"tiptoe","name":"Sneaky Steps","price":600,"duration":5,"mark":"SHHH","description":"A sneaky little dance in place."},{"id":"peekaboo","name":"Peekaboo","price":500,"duration":4,"mark":"BOO!","description":"Hide your face, then surprise everyone."},{"id":"airplane","name":"Airplane","price":600,"duration":5,"mark":"WHEEE","description":"Spread your arms and bank from side to side."}]);
 let active=null,serial=0,assignSlot=-1,editing=false,selectedSlot=0,segments=[],slotButtons=[],centerName=null,centerHint=null;
 const actors=new Map();
 const find=id=>catalog.find(e=>e.id===id);
 function restoreSave(data){
  const owned=Array.isArray(data.unlockedEmotes)?data.unlockedEmotes.filter(id=>find(id)):[];
  saveState.unlockedEmotes=[...new Set(owned)];
  saveState.emoteWheel=Array.from({length:5},(_,i)=>owned.includes(data.emoteWheel?.[i])?data.emoteWheel[i]:null);
 }
 function buy(id){const item=find(id);if(!item||saveState.unlockedEmotes.includes(id))return;
  if(saveState.money<item.price){showToast('Not enough money!');return;}
  saveState.money-=item.price;saveState.unlockedEmotes.push(id);const empty=saveState.emoteWheel.indexOf(null);if(empty>=0)saveState.emoteWheel[empty]=id;
  saveGame();renderShop();
 }
 function assign(slot,id){if(!Number.isInteger(slot)||slot<0||slot>=5||(id!==null&&!saveState.unlockedEmotes.includes(id)))return;saveState.emoteWheel[slot]=id;saveGame();renderWheel();}
 function close(){document.getElementById('emote-overlay').hidden=true;assignSlot=-1;editing=false;document.body?.classList?.remove('emote-wheel-open');}
 function toggle(){const overlay=document.getElementById('emote-overlay');if(!overlay.hidden){close();return;}if(!player)return;document.exitPointerLock();assignSlot=-1;editing=false;selectedSlot=0;overlay.hidden=false;document.body?.classList?.add('emote-wheel-open');renderWheel();slotButtons[0]?.focus?.();}
 function play(id){const item=find(id);if(!item||!saveState.unlockedEmotes.includes(id)||!player)return;
  if((typeof isSitting!=='undefined'&&isSitting)||window.Boats?.isAboard()||isDiving||isProne||isSailing||isGuitarActive||isGloveActive||fishingState!=='idle'){showToast('Finish your current action before emoting.');return;}
  active={id,token:String(++serial),start:performance.now(),x:player.position.x,z:player.position.z};close();if(typeof sendUpdate==='function')sendUpdate();
 }
 function networkState(){if(!active)return null;const elapsed=(performance.now()-active.start)/1000;if(elapsed>=find(active.id).duration){active=null;return null;}return {id:active.id,token:active.token,elapsed};}
 const symbols={wave:'👋',cheer:'🙌',bow:'🙇',spin:'↻',dance:'♫',clap:'👏',shrug:'🤷',point:'☞',salute:'🫡',facepalm:'🤦',laugh:'😆',cry:'😢',shiver:'❄',stretch:'↔',yawn:'🥱',flex:'💪',heart:'♡',disco:'🪩',robot:'🤖',sway:'≈',happyhop:'↑',stomp:'!',tiptoe:'🤫',peekaboo:'👀',airplane:'✈'};
 function sectorPath(index){const point=(r,a)=>{const angle=a*Math.PI/180;return [200+r*Math.cos(angle),200+r*Math.sin(angle)].join(',');},a=index*72-124,b=index*72-56;return 'M'+point(194,a)+' A194,194 0 0 1 '+point(194,b)+' L'+point(90,b)+' A90,90 0 0 0 '+point(90,a)+' Z';}
 function highlight(slot){selectedSlot=slot;const item=find(saveState.emoteWheel[slot]);for(let i=0;i<5;i++){segments[i]?.classList?.toggle('is-selected',i===slot);slotButtons[i]?.setAttribute('aria-current',String(i===slot));}if(centerName)centerName.textContent=item?.name||'Empty slot';if(centerHint)centerHint.textContent=editing?'Choose a slot to edit':'Slot '+(slot+1);}
 function moveSelection(step){highlight((selectedSlot+step+5)%5);slotButtons[selectedSlot]?.focus?.();}
 function select(slot=selectedSlot){if(!Number.isInteger(slot)||slot<0||slot>=5)return;const id=saveState.emoteWheel[slot];if(editing||!find(id))edit(slot);else play(id);}
 function renderWheel(){
  const wheel=document.getElementById('emote-wheel');wheel.replaceChildren();segments=[];slotButtons=[];
  document.getElementById('emote-panel')?.classList?.toggle('is-assigning',assignSlot>=0);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 400 400');svg.setAttribute('class','emote-ring');svg.setAttribute('aria-hidden','true');
  for(let i=0;i<5;i++){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',sectorPath(i));path.setAttribute('class','emote-segment');path.onpointerenter=()=>highlight(i);path.onclick=()=>select(i);segments.push(path);svg.appendChild(path);}wheel.appendChild(svg);
  for(let i=0;i<5;i++){const slot=document.createElement('div');slot.className='emote-slot';const angle=(i*72-90)*Math.PI/180;slot.style.left=(50+35*Math.cos(angle))+'%';slot.style.top=(50+35*Math.sin(angle))+'%';
   const button=document.createElement('button'),item=find(saveState.emoteWheel[i]);button.type='button';button.className='emote-play';button.setAttribute('aria-label','Slot '+(i+1)+': '+(item?.name||'Empty')+(editing?', assign emote':', play emote'));
   const icon=document.createElement('span');icon.className='emote-symbol';icon.setAttribute('aria-hidden','true');icon.textContent=item?symbols[item.id]||'✦':'+';button.appendChild(icon);
   const label=document.createElement('span');label.className='emote-slot-label';label.textContent=(i+1)+' · '+(item?.name||'Empty');button.appendChild(label);button.onclick=()=>select(i);button.onpointerenter=button.onfocus=()=>highlight(i);slot.appendChild(button);slotButtons.push(button);wheel.appendChild(slot);
  }
  const center=document.createElement('div');center.className='emote-center';centerName=document.createElement('strong');centerHint=document.createElement('small');center.appendChild(centerName);center.appendChild(centerHint);
  const editButton=document.createElement('button');editButton.type='button';editButton.className='emote-edit-toggle';editButton.textContent=editing?'Done':'Edit wheel';editButton.setAttribute('aria-pressed',String(editing));editButton.onclick=()=>{editing=!editing;assignSlot=-1;renderWheel();};center.appendChild(editButton);wheel.appendChild(center);highlight(selectedSlot);
  const choices=document.getElementById('emote-choices');choices.replaceChildren();choices.hidden=assignSlot<0;
  if(assignSlot>=0){const label=document.createElement('p');label.textContent='Assign slot '+(assignSlot+1);choices.appendChild(label);
   const owned=catalog.filter(e=>saveState.unlockedEmotes.includes(e.id));if(!owned.length){const hint=document.createElement('p');hint.textContent='Buy emotes in the boutique to fill your wheel.';choices.appendChild(hint);}
   for(const item of owned){const b=document.createElement('button');b.type='button';b.textContent=item.name;b.onclick=()=>{const slot=assignSlot;assignSlot=-1;assign(slot,item.id);};choices.appendChild(b);}
   const clear=document.createElement('button');clear.type='button';clear.textContent='Clear slot';clear.onclick=()=>{const slot=assignSlot;assignSlot=-1;assign(slot,null);};choices.appendChild(clear);
   const back=document.createElement('button');back.type='button';back.textContent='Back';back.onclick=()=>{assignSlot=-1;renderWheel();};choices.appendChild(back);
  }
 }
 function edit(slot){assignSlot=slot;selectedSlot=slot;editing=true;renderWheel();}
 function renderShopItems(container){for(const item of catalog){const owned=saveState.unlockedEmotes.includes(item.id),entry=document.createElement('div');entry.className='grid-entry';
  const art=document.createElement('div');art.className='emote-art';art.textContent=item.mark;entry.appendChild(art);
  const name=document.createElement('strong');name.textContent=item.name;entry.appendChild(name);
  const desc=document.createElement('div');desc.className='item-desc';desc.textContent=(item.description?item.description+' ':'')+item.duration+' second animation';entry.appendChild(desc);
  const button=document.createElement('button');button.textContent=owned?'Owned':'$'+item.price;button.disabled=owned;button.onclick=()=>buy(item.id);entry.appendChild(button);container.appendChild(entry);
 }const help=document.createElement('p');help.className='emote-shop-help';help.textContent='Open the emote wheel with C or the Emotes button. Use Edit wheel to fill each slot.';container.appendChild(help);}
 function finish(owner,state){const body=owner.getObjectByName('playerSprite');if(body){window.Character3D?.animateEmote(body,null,0);body.rotation.set(0,0,0);body.position.y=1.46875;}
  for(const [name,visible] of state.hidden){const item=owner.getObjectByName(name);if(item){const data=state.presence;item.visible=data&&name==='rod'?(!data.guitar&&!data.glove&&!data.heldFish&&!data.handsEmpty&&(!data.tool||data.tool==='rod')):data&&name==='heldFishSprite'?!!data.heldFish&&!data.guitar&&!data.glove:visible;}}
  owner.userData.emoting=false;owner.userData.finishedEmote=state.id+':'+state.token;actors.delete(owner);
 }
 function tickActor(owner,payload,now,presence){
  const item=payload&&find(payload.id);let state=actors.get(owner);if(state)state.presence=presence;
  const valid=item&&typeof payload.token==='string'&&payload.token.length<=64&&Number.isFinite(payload.elapsed)&&payload.elapsed>=0&&payload.elapsed<item.duration;
  if(!valid){if(state)finish(owner,state);return;}
  if(owner.userData.finishedEmote===item.id+':'+payload.token)return;
  if(!state||state.token!==payload.token||state.id!==payload.id){if(state)finish(owner,state);state={id:item.id,token:payload.token,start:now-payload.elapsed*1000,hidden:new Map(),presence};actors.set(owner,state);}
  const time=(now-state.start)/1000;if(time>=item.duration){finish(owner,state);return;}
  const body=owner.getObjectByName('playerSprite');if(!body)return;owner.userData.emoting=true;
  for(const name of ['rod','heldFishSprite','guitarMesh','gloveMesh','axe','pickaxe','axeMesh','pickaxeMesh']){const held=owner.getObjectByName(name);if(held){if(!state.hidden.has(name))state.hidden.set(name,held.visible);held.visible=false;}}
  const fade=Math.max(0,Math.min(1,time*6,(item.duration-time)*6)),beat=Math.sin(time*7);
  if(body.userData.is3D)window.Character3D?.animateEmote(body,item.id,time,fade);
  let yaw=0,pitch=0,roll=0,height=0;
  switch(item.id){
   case 'spin':yaw=time/item.duration*Math.PI*4;break;
   case 'bow':pitch=Math.sin(time/item.duration*Math.PI)*.75;break;
   case 'dance':roll=beat*.12;height=beat*.06;break;
   case 'cheer':height=Math.abs(beat)*.12;break;
   case 'shrug':roll=Math.sin(time*3)*.04;height=.025;break;
   case 'point':yaw=-.12;break;
   case 'salute':pitch=-.04;break;
   case 'facepalm':pitch=.18;break;
   case 'laugh':pitch=.12+Math.sin(time*12)*.06;roll=Math.sin(time*12)*.025;break;
   case 'cry':pitch=.25;roll=Math.sin(time*8)*.04;break;
   case 'shiver':roll=Math.sin(time*25)*.035;break;
   case 'stretch':pitch=-.12;height=.035;break;
   case 'yawn':pitch=-.13*Math.sin(time/item.duration*Math.PI);break;
   case 'flex':yaw=Math.sin(time*2)*.08;break;
   case 'heart':roll=Math.sin(time*2)*.06;break;
   case 'disco':roll=beat*.14;yaw=Math.sin(time*3.5)*.18;height=Math.abs(beat)*.04;break;
   case 'robot':yaw=Math.round(Math.sin(time*3)*3)*.1;roll=Math.round(Math.sin(time*5)*2)*.04;break;
   case 'sway':roll=Math.sin(time*2.5)*.16;yaw=Math.sin(time*2.5)*.12;break;
   case 'happyhop':height=Math.abs(Math.sin(time*6))*.3;roll=Math.sin(time*3)*.08;break;
   case 'stomp':pitch=.12;height=Math.abs(Math.sin(time*9))*.045;roll=Math.sin(time*4.5)*.1;break;
   case 'tiptoe':height=.09+Math.abs(Math.sin(time*8))*.045;pitch=.1;yaw=Math.sin(time*4)*.14;break;
   case 'peekaboo':pitch=Math.cos(time*4)>.0?.13:-.06;break;
   case 'airplane':roll=Math.sin(time*2.5)*.25;yaw=Math.sin(time*1.25)*.35;pitch=-.05;break;
  }
  body.rotation.set(pitch*fade,yaw*fade,roll*fade);body.position.y=1.46875+height*fade;
  // Retained 2D renderer uses the same synchronized timing and whole-body gestures.
  if(!body.userData.is3D){
   if(item.id==='wave')body.rotation.z=Math.sin(time*10)*.15*fade;
   if(item.id==='clap')body.rotation.z=Math.sin(time*10)*.04*fade;
  }
 }
 function tick(){const now=performance.now();if(active&&player&&(Math.hypot(player.position.x-active.x,player.position.z-active.z)>.025||(typeof isSitting!=='undefined'&&isSitting)||window.Boats?.isAboard()||isDiving||isProne||isSailing||playerVelocity.y!==0||fishingState!=='idle'||isGuitarActive||isGloveActive))active=null;
  if(player)tickActor(player,networkState(),now);
  const live=new Set(player?[player]:[]);for(const peer of Object.values(otherPlayers)){live.add(peer.mesh);tickActor(peer.mesh,peer.lastData?.emote,now,peer.lastData);}for(const [owner,state] of actors)if(!live.has(owner))finish(owner,state);
 }
 window.Emotes={catalog,restoreSave,buy,assign,play,toggle,close,select,moveSelection,networkState,tick,renderShopItems};
})();
