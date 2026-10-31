const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const rules=require('../character-studio.js'),source=fs.readFileSync('character-studio.js','utf8');
function setup(){
 const nodes=new Map();let saved=0,rebuilt=0;
 class Element{
  constructor(tag='div',id=''){this.tagName=tag;this.id=id;this.items=[];this.attributes={};this.dataset={};this.style={setProperty(){}};this.value='';this.textContent='';this.hidden=false;this.open=false;}
  get children(){return this.items;}get lastElementChild(){return this.items.at(-1);}get nextSibling(){return this.parentNode?.items[this.parentNode.items.indexOf(this)+1]||null;}
  append(...els){for(const el of els){if(el.parentNode)el.parentNode.items=el.parentNode.items.filter(x=>x!==el);el.parentNode=this;this.items.push(el);if(el.id)nodes.set(el.id,el);}}
  insertBefore(el,next){if(el.parentNode)el.parentNode.items=el.parentNode.items.filter(x=>x!==el);el.parentNode=this;const i=this.items.indexOf(next);if(i<0)this.items.push(el);else this.items.splice(i,0,el);}
  before(el){this.parentNode.insertBefore(el,this);}replaceChildren(...els){this.items=[];this.append(...els);}setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,fn){this['on'+k]=fn;}focus(){}showModal(){this.open=true;}close(){this.open=false;}
  getContext(){return {drawImage(){},fillText(){}};}
  querySelector(selector){if(selector==='.studio-inspector')return this.inspector||(this.inspector=new Element());return this.items.find(x=>x.tagName==='button');}
  querySelectorAll(selector){if(selector==='[data-view]')return [];return [];}
  set innerHTML(html){this.items=[];for(const m of html.matchAll(/id="([^"]+)"/g)){const el=new Element('div',m[1]);nodes.set(el.id,el);this.append(el);}}
 }
 const el=id=>{if(!nodes.has(id))nodes.set(id,new Element('div',id));return nodes.get(id);};
 const wardrobe=el('wardrobe'),legacy=el('legacy');wardrobe.append(el('character-preview'));legacy.append(el('protogen-logo-row'));el('protogen-logo-row').append(el('protogen-logo-button'));
 const state={money:500,wood:23,currentEars:'cat',currentEyes:'standard',currentNose:'cat',currentMisc:'none',currentTail:'cat',currentHair:'none',species:'cat',catColor:'#ff6347',bellyColor:'#fff',eyeColor:'#000',currentHat:'none',currentShirt:'none',currentPants:'none',currentCollar:'none',bodyPaint:'',model3D:true,savedOutfits:[],unlockedHats:['none'],unlockedShirts:['none'],unlockedPants:['none'],unlockedCollars:['none']};
 const types=(...ids)=>ids.map(id=>({id,name:id==='none'?'None':id[0].toUpperCase()+id.slice(1)}));
 const c=vm.createContext({window:{ShopCharacterPreview:{setView(){}},ProtogenLogo:{syncButton(){el('protogen-logo-row').hidden=state.currentMisc!=='protogen_visor';}}},document:{getElementById:el,createElement:t=>new Element(t),createComment:()=>new Element('comment'),body:el('body'),activeElement:new Element()},saveState:state,player:{},saveGame(){saved++;},updateLocalVisuals(){rebuilt++;},populatePartSelectors(){},createSpeciesTexture:()=>({image:{width:192,height:282},dispose(){}}),EAR_TYPES:types('none','cat','fox'),EYE_TYPES:types('standard','dragon'),NOSE_TYPES:types('cat','protogen'),HAIR_TYPES:types('none','bob'),TAIL_TYPES:types('none','cat'),MISC_TYPES:types('none','protogen_visor'),HAT_TYPES:types('none','red'),SHIRT_TYPES:types('none','stripes'),PANTS_TYPES:types('none'),COLLAR_TYPES:types('none'),saveCurrentOutfit(){state.savedOutfits.push({id:1,name:'Favorite',ears:state.currentEars});},loadOutfit(){state.currentEars='fox';},deleteOutfit(){state.savedOutfits=[];}});
 vm.runInContext(source,c);const api=c.window.CharacterStudio;api.open();
 const category=id=>el('studio-nav').children.find(n=>n.dataset.category===id).onclick();
 const choice=name=>el('studio-choices').children.find(n=>n.attributes['aria-label']===name);
 return {c,api,state,el,wardrobe,legacy,category,choice,counters:()=>({saved,rebuilt})};
}
test('appearance history cannot revert money, unlocks, resources or other game progress',()=>{
 const snapshot=rules.snapshot({currentEars:'fox',money:1000,wood:25,unlockedHats:['none'],protogenLogo:'logo'});assert.equal(snapshot.currentEars,'fox');assert.equal(snapshot.protogenLogo,'logo');for(const key of ['money','wood','unlockedHats'])assert(!Object.hasOwn(snapshot,key));
});
test('studio opens with the original preview, applies presets, undoes/redoes and restores the preview on Done',()=>{
 const s=setup();assert(s.el('character-studio').open);assert.equal(s.el('character-preview').parentNode,s.el('studio-model'));assert.equal(s.el('studio-choices').children.length,6);
 s.choice('Protogen').onclick();assert.equal(s.state.currentMisc,'protogen_visor');assert.equal(s.state.currentNose,'protogen');assert.equal(s.state.money,500);assert(s.counters().saved);
 s.el('studio-undo').onclick();assert.equal(s.state.currentMisc,'none');s.el('studio-redo').onclick();assert.equal(s.state.currentMisc,'protogen_visor');
 s.api.close();assert(!s.el('character-studio').open);assert.equal(s.el('character-preview').parentNode,s.wardrobe);
});
test('feature cards filter by name and Extras retain conditional sign editing',()=>{
 const s=setup();s.category('ears');assert.equal(s.el('studio-choices').children.length,3);s.el('studio-search').oninput({target:{value:'fox'}});assert.equal(s.el('studio-choices').children.length,1);s.choice('Fox').onclick();assert.equal(s.state.currentEars,'fox');
 s.category('extras');assert.equal(s.el('protogen-logo-row').parentNode,s.el('studio-controls'));assert(s.el('protogen-logo-row').hidden);s.choice('Protogen_visor').onclick();assert(!s.el('protogen-logo-row').hidden);
 s.category('hair');assert.equal(s.el('protogen-logo-row').parentNode,s.legacy);
});
test('clothes only offer owned cosmetics and never purchase from the editing screen',()=>{
 const s=setup();s.category('clothes');assert.equal(s.el('studio-choices').children.length,1);assert.equal(s.state.money,500);s.state.unlockedHats.push('red');s.api.refresh();assert(s.choice('Red'));s.choice('Red').onclick();assert.equal(s.state.currentHat,'red');assert.equal(s.state.money,500);
});
test('color edits support custom values, reset, and history without re-rendering the shop',()=>{
 const s=setup();s.category('ears');const block=s.el('studio-controls').children[0],top=block.children[0],input=top.children.find(e=>e.tagName==='input');input.value='#abcdef';input.onchange();assert.equal(s.state.earsColor,'#abcdef');s.el('studio-undo').onclick();assert(!s.state.earsColor);
});
test('creator assets deploy together, the shop uses 3D previews only, and gameplay ignores studio input',()=>{
 for(const file of ['index.html','.cpanel.yml','deploy.ps1']){const text=fs.readFileSync(file,'utf8');assert(text.includes('character-studio.js'));assert(text.includes('character-studio.css'));}
 const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('ui.js','utf8');for(const id of ['preview-3d','misc-select','protogen-logo-row'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.equal((html.match(/id="preview-2d"/g)||[]).length,0);
 assert(ui.includes("getElementById('character-studio')?.open"));
});
test('all starter species use valid existing parts rather than unknown placeholder choices',()=>{
 const core=fs.readFileSync('core.js','utf8'),names=['EAR_TYPES','EYE_TYPES','NOSE_TYPES','MISC_TYPES','TAIL_TYPES'];
 const catalogs=names.map(name=>{const text=core.match(new RegExp('const '+name+' = (\\[[\\s\\S]*?\\n\\]);'))[1];return vm.runInNewContext(text);});
 for(const starter of rules.STARTERS)for(let i=0;i<5;i++)assert(catalogs[i].some(x=>x.id===starter[i+2]),starter[0]+'/'+names[i]);
});
test('3D style cards receive each candidate appearance without changing the saved character',()=>{
 const s=setup(),jobs=[];s.c.window.createCharacterThumbnail=(values,focus,width,height,scope)=>{jobs.push({values,focus,width,height,scope});return s.c.document.createElement('canvas');};
 s.category('ears');assert.equal(jobs.length,3);const fox=jobs.find(j=>j.values.currentEars==='fox');assert(fox);assert.equal(fox.focus,'head');assert.equal(fox.width,128);assert.equal(fox.height,128);assert.equal(fox.scope,'studio');assert.equal(s.state.currentEars,'cat');
});
