// Hollowtide 2026. Catalog entries persist; catches and purchases are date-gated.
(function(){
 const EVENT='hollowtide2026',START=Date.parse('2026-10-28T00:00:00-04:00'),END=Date.parse('2026-11-09T00:00:00-05:00');
 const active=(now=Date.now())=>Number.isFinite(now)&&now>=START&&now<END;
 const fish=[
  {name:"Jack-o'-Carp",shape:'carp',color:'#ee8c2d',rarity:'Uncommon',drain:26,price:100,embers:8,weight:26,detail:'jack'},
  {name:'Ghost Koi',shape:'carp',color:'#d9f4e5',rarity:'Rare',drain:36,price:220,embers:12,weight:19,detail:'ghost'},
  {name:'Vampire Gar',shape:'pike',color:'#704a87',rarity:'Rare',drain:42,price:260,embers:14,weight:16,detail:'fangs'},
  {name:'Candy Corn Guppy',shape:'guppy',color:'#f2b33c',rarity:'Uncommon',drain:22,price:80,embers:8,weight:25,detail:'candy'},
  {name:'Witchfin Betta',shape:'betta',color:'#9b6fd4',rarity:'Epic',drain:56,price:450,embers:22,weight:8,detail:'witch'},
  {name:'Bonefin Trout',shape:'trout',color:'#514958',rarity:'Rare',drain:40,price:250,embers:14,weight:15,detail:'bones'},
  {name:'Lantern Angler',shape:'angler',color:'#e7a143',rarity:'Epic',drain:62,price:600,embers:26,weight:6,detail:'lantern'},
  {name:'Harvest Moon Ray',shape:'ray',color:'#473b78',rarity:'Legendary',drain:76,price:1400,embers:40,weight:2,detail:'moon'}
 ].map(f=>({...f,event:EVENT,condition:EVENT,zone:'any',chance:0}));
 const rewards=[
  {kind:'hat',id:'ht_witch',name:'Ember Witch Hat',type:'witch',color:'#a354cb',cost:65,description:'A violet witch hat with an ember-orange band.'},
  {kind:'hat',id:'ht_crown',name:'Harvest Crown',type:'crown',color:'#efad4b',cost:110,description:'A crown for the ruler of the pumpkin patch.'},
  {kind:'hat',id:'ht_cap',name:'Jack-o-Lantern Cap',type:'cap',color:'#e97e30',cost:35,description:'A pumpkin-orange cap with a carved grin.'},
  {kind:'shirt',id:'ht_hoodie',name:'Ghostlight Hoodie',type:'hoodie',color:'#d7ecdd',secondary:'#8b63b2',cost:60,description:'A soft mint hoodie bearing a little ghost.'},
  {kind:'shirt',id:'ht_coat',name:'Midnight Harvest Coat',type:'coat',color:'#3c294d',secondary:'#ef9d42',cost:90,description:'Midnight purple with golden harvest accents.'},
  {kind:'pants',id:'ht_ghost_pants',name:'Ghostlight Joggers',type:'ghost',color:'#d7ecdd',secondary:'#8b63b2',cost:45,description:'Mint joggers with violet ghosts, made to match the Ghostlight Hoodie.'},
  {kind:'pants',id:'ht_harvest_pants',name:'Midnight Harvest Trousers',type:'harvest',color:'#3c294d',secondary:'#ef9d42',cost:70,description:'Midnight-purple trousers with harvest-gold piping to match the Harvest Coat.'},
  {kind:'pants',id:'ht_pumpkin_pants',name:'Pumpkin Patch Jeans',type:'pumpkin',color:'#342d40',secondary:'#e97e30',cost:40,description:'Dark jeans with pumpkin patches to pair with your Jack-o-Lantern Cap.'},
  {kind:'pants',id:'ht_witch_pants',name:'Witching Stripe Joggers',type:'stripes',color:'#a354cb',secondary:'#3c294d',cost:55,description:'Violet and midnight stripes to complete your witch outfit.'},
  {kind:'collar',id:'ht_bell',name:'Witching Bell',type:'bell',color:'#8f59b0',cost:45,description:'A violet collar with a brass bell.'},
  {kind:'collar',id:'ht_bow',name:'Cobweb Bow',type:'bow',color:'#d6d0e0',cost:45,description:'A pale bow for your haunted best.'},
  {kind:'rod',id:'ht_rod',name:'Soulfire Caster',color:'#aa72d8',reel:'#efa34a',cost:120,description:'A violet rod with glowing orange wraps.'},
  {kind:'bobber',id:'ht_pumpkin',name:'Grinning Gourd',color:0xe78631,model:'sphere',eventModel:'pumpkin',cost:35,description:'A tiny pumpkin for the water.'},
  {kind:'bobber',id:'ht_lantern',name:'Ghostlight Lantern',color:0xa5e5b5,model:'lantern',eventModel:'lantern',cost:60,description:'Guide lost fish home with a mint lantern.'},
  {kind:'title',id:'ht_keeper',name:'Lantern Keeper',text:'Lantern Keeper',color:'#b5e6b5',cost:80,description:'Carry a light into the dark.'},
  {kind:'title',id:'ht_legend',name:'Hollowtide Legend',text:'Hollowtide Legend',color:'#efb46b',cost:160,description:'A gilded title for devoted festival anglers.'}
 ].map(r=>({...r,event:EVENT,price:0}));
 const fields={hat:['unlockedHats','currentHat'],shirt:['unlockedShirts','currentShirt'],pants:['unlockedPants','currentPants'],collar:['unlockedCollars','currentCollar'],rod:['unlockedRods','currentRod'],bobber:['unlockedBobbers','currentBobber'],title:['unlockedTitles','currentTitle']};
 const lists={hat:HAT_TYPES,shirt:SHIRT_TYPES,pants:PANTS_TYPES,collar:COLLAR_TYPES,rod:ROD_TYPES,bobber:BOBBER_TYPES,title:TITLE_TYPES};
 for(const f of fish){FISH_TYPES.push(f);FISH_NAME_MAP.set(f.name,f);}
 for(const r of rewards){lists[r.kind].push(r);if(r.kind==='title')TITLE_MAP.set(r.id,r);}
 let vendor=null,stall=null,configured=false,lastTick=0,announced=false,lastEnabled=null;
 function data(){if(!saveState[EVENT])restore({});return saveState[EVENT];}
 function restore(saved){const value=saved[EVENT]||{};const integer=n=>Number.isSafeInteger(n)&&n>=0?Math.min(n,1e9):0;
  saveState[EVENT]={embers:integer(value.embers),catches:integer(value.catches),discovered:[...new Set((Array.isArray(value.discovered)?value.discovered:[]).filter(n=>fish.some(f=>f.name===n)))],collectionClaimed:value.collectionClaimed===true};
 }
 function roll(chance,choice,now=Date.now()){
  if(!active(now)||!Number.isFinite(chance)||chance<0||chance>=.14||!Number.isFinite(choice)||choice<0||choice>=1)return null;
  let pick=choice*fish.reduce((sum,f)=>sum+f.weight,0);for(const f of fish){if(pick<f.weight)return f;pick-=f.weight;}return fish[fish.length-1];
 }
 function caught(catchData){
  if(!active()||!catchData||catchData.name==='Old Boot'||!FISH_NAME_MAP.has(catchData.name)||catchData.hollowtideAwarded)return 0;
  const eventFish=fish.find(f=>f.name===catchData.name),d=data();let earned=eventFish?eventFish.embers:2;let discovery=false;
  if(eventFish&&!d.discovered.includes(eventFish.name)){d.discovered.push(eventFish.name);earned+=15;discovery=true;}
  if(d.discovered.length===fish.length&&!d.collectionClaimed){d.collectionClaimed=true;earned+=100;}
  catchData.hollowtideAwarded=true;d.embers=Math.min(1e9,d.embers+earned);d.catches++;showToast('+'+earned+' Soul Embers'+(discovery?' · New haunted catch!':''),'halloween');return earned;
 }
 function near(){return active()&&vendor?.visible&&player&&!(window.Housing&&Housing.inside)&&player.position.distanceTo(vendor.position)<4;}
 function buy(id){const reward=rewards.find(r=>r.id===id);if(!reward||!near())return false;const [owned,current]=fields[reward.kind];
  if(saveState[owned].includes(id))return false;const d=data();if(d.embers<reward.cost){showToast('You need more Soul Embers. Go fishing!');return false;}
  d.embers-=reward.cost;saveState[owned].push(id);saveState[current]=id;saveGame();if(typeof updateLocalVisuals==='function')updateLocalVisuals();updateCharacterPreview();showToast(reward.name+' unlocked!','halloween');render();return true;
 }
 function equip(id){const r=rewards.find(r=>r.id===id);if(!r||!saveState[fields[r.kind][0]].includes(id))return;saveState[fields[r.kind][1]]=id;saveGame();if(typeof updateLocalVisuals==='function')updateLocalVisuals();updateCharacterPreview();render();}
 function open(){if(!near())return;if(typeof controls!=='undefined')for(const key of ['forward','backward','left','right','jump'])controls[key]=false;document.exitPointerLock();document.getElementById('halloween-overlay').hidden=false;render();}
 function close(){document.getElementById('halloween-overlay').hidden=true;}
 function preview(reward){
  if(reward.kind==='title')return null;
  if(['hat','shirt','collar','pants'].includes(reward.kind)&&typeof window.createCharacterThumbnail==='function'){
   const key={hat:'currentHat',shirt:'currentShirt',collar:'currentCollar',pants:'currentPants'}[reward.kind];
   const canvas=window.createCharacterThumbnail({[key]:reward.id},reward.kind==='hat'?'head':'full',96,128,'halloween');
   canvas.classList.add('halloween-preview');return canvas;
  }
  if(reward.kind==='bobber'&&typeof drawBobberIcon==='function'){
   const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;canvas.className='halloween-preview';drawBobberIcon(canvas.getContext('2d'),reward,96);return canvas;
  }
  if(reward.kind==='rod'&&typeof createRodTexture==='function'){
   const texture=createRodTexture(reward.id);if(!texture)return null;const canvas=document.createElement('canvas');canvas.width=96;canvas.height=112;canvas.className='halloween-preview';const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
   const width=texture.image.width,height=texture.image.height,scale=Math.min(96/width,112/height);ctx.drawImage(texture.image,(96-width*scale)/2,(112-height*scale)/2,width*scale,height*scale);texture.dispose();return canvas;
  }
  return null;
 }
 function render(){
  const d=data(),wallet=document.getElementById('halloween-wallet');if(!wallet)return;wallet.textContent=d.embers.toLocaleString()+' Soul Embers';
  document.getElementById('halloween-progress').textContent=d.discovered.length+' / 8 haunted fish discovered · '+(d.collectionClaimed?'Collection bonus claimed!':'Find all eight for 100 bonus Embers.');
  const grid=document.getElementById('halloween-rewards');grid.replaceChildren();
  for(const reward of rewards){const owned=saveState[fields[reward.kind][0]].includes(reward.id),equipped=saveState[fields[reward.kind][1]]===reward.id,card=document.createElement('article');card.className='halloween-card';
   const tag=document.createElement('small');tag.textContent=reward.kind.toUpperCase()+' · EXCLUSIVE';card.appendChild(tag);
   const art=preview(reward);if(art)card.appendChild(art);const title=document.createElement('h3');title.textContent=reward.name;card.appendChild(title);const desc=document.createElement('p');desc.textContent=reward.description;card.appendChild(desc);
   const button=document.createElement('button');button.textContent=equipped?'Equipped':owned?'Equip':reward.cost+' Soul Embers';button.disabled=equipped||(!owned&&(!near()||d.embers<reward.cost));button.onclick=()=>owned?equip(reward.id):buy(reward.id);card.appendChild(button);grid.appendChild(card);
  }
  const journal=document.getElementById('halloween-fish');journal.replaceChildren();for(const f of fish){const p=document.createElement('div');p.className='halloween-fish-card';p.textContent=(d.discovered.includes(f.name)?'✓ ':'? ')+f.name+' · '+f.rarity+' · '+f.embers+' Embers';if(typeof createFishTexture==='function'){const tex=createFishTexture(f.name,f.color),canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;canvas.className='halloween-fish-preview';canvas.getContext('2d').drawImage(tex.image,0,0,64,64);tex.dispose();p.prepend(canvas);}journal.appendChild(p);}
 }
 function spawn(scene){
  if(vendor){vendor.parent?.remove(vendor);if(typeof disposeCharacterBody==='function'){const body=vendor.getObjectByName('playerSprite');if(body){disposeCharacterBody(body);vendor.remove(body);}disposeCharacterBody(vendor);}}
  if(stall){stall.parent?.remove(stall);if(typeof disposeCharacterBody==='function')disposeCharacterBody(stall);}
  vendor=createPlayerMesh('#b97235','Morrow · Lantern Keeper','ht_witch','#bcebb1','fox');
  replaceCharacterBody(vendor,{color:'#b97235',belly:'#f3d5a0',eye:'#bbe7a9',species:'fox',hat:'ht_witch',shirt:'ht_coat',pants:'ht_harvest_pants',collar:'ht_bell'});
  vendor.getObjectByName('rod').visible=false;const spawn=getDefaultNpcSpawns().halloween;vendor.position.set(spawn.x,0,spawn.z);vendor.lookAt(0,0,0);scene.add(vendor);
  const custom=window.CUSTOM_LEVEL&&window.Level,placement=custom?window.CUSTOM_LEVEL.npcs.find(n=>n.type==='halloween'):null;configured=!custom||!!placement;
  if(placement){vendor.position.set(placement.x,window.Level.sampleHeight(window.CUSTOM_LEVEL,placement.x,placement.z),placement.z);vendor.rotation.set(0,Number(placement.rot)||0,0);}
  stall=new THREE.Group();stall.position.copy(vendor.position);scene.add(stall);
  for(const side of [-1,1]){if(window.Bobbers3D){const pumpkin=Bobbers3D.build({id:'pumpkin',color:0xe89032});pumpkin.scale.setScalar(2);pumpkin.position.set(side*1.3,.15,0);stall.add(pumpkin);}}
  const light=new THREE.PointLight(0xffa252,.8,7);light.position.set(0,1,0);stall.add(light);vendor.visible=stall.visible=active()&&configured;return vendor;
 }
 function tick(now=Date.now()){
  if(vendor?.visible&&typeof camera!=='undefined')updateSpriteDirection(vendor,camera.position);
  if(now-lastTick<750)return;lastTick=now;const enabled=active(now);
  const changed=lastEnabled!==null&&lastEnabled!==enabled;lastEnabled=enabled;if(vendor){vendor.visible=enabled&&configured;stall.visible=vendor.visible;}
  const hud=document.getElementById('halloween-hud');if(hud){hud.hidden=!enabled||!player;hud.textContent='Embers: '+data().embers.toLocaleString();}
  if(!enabled){const overlay=document.getElementById('halloween-overlay');if(overlay)overlay.hidden=true;}
  if(changed){
   if(document.getElementById('shop-overlay')?.style.display==='flex'&&typeof renderShop==='function')renderShop();
   if(!enabled){
    if(typeof interactTarget!=='undefined'&&interactTarget==='halloween'){interactTarget=null;const prompt=document.getElementById('npc-prompt');if(prompt)prompt.style.display='none';}
    if(player)showToast('Hollowtide has ended. Equip your owned Hollowtide 2026 cosmetics in the regular shop.','halloween');
   }
  }
  if(enabled&&player&&!announced){announced=true;showToast(window.CUSTOM_LEVEL?'Hollowtide is here! Earn Soul Embers by fishing. Custom maps can place Morrow from the editor’s NPC list.':'Hollowtide is here! Earn Soul Embers by fishing. Find Morrow on the east shore through Nov 8.','halloween');}
 }
 function prompt(player,prompt,button){if(near()){interactTarget='halloween';prompt.textContent='PRESS '+(saveState.keybinds.interact||'KeyE').replace('Key','')+' · MORROW’S HOLLOWTIDE STALL';prompt.style.display='block';if(button)button.textContent='FESTIVAL';}}
 window.Halloween={EVENT,START,END,active,fish,rewards,fields,restore,roll,caught,buy,equip,spawn,tick,prompt,open,close,get vendor(){return vendor;}};
})();
