const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('shop-try-on.js','utf8'),rules=require('../shop-try-on.js');
function setup(){
 const base=Object.freeze({currentHat:'none',currentShirt:'plain',currentPants:'none',currentCollar:'none',money:100,protogenLogo:'sign'}),frames=[],previews=[],nodes={'shop-overlay':{style:{display:'flex'}},'character-studio':{open:false},'shop-preview-status':{},'shop-preview-title':{style:{}}};
 const c=vm.createContext({window:{updateCharacterPreview(){previews.push(c.window.ShopTryOn.state(base));}},document:{getElementById:id=>nodes[id],activeElement:null},requestAnimationFrame:fn=>frames.push(fn)});vm.runInContext(source,c);
 function card(patch,label='Hat',title=null){const handlers={},entry={handlers,hover:false,addEventListener:(type,fn)=>handlers[type]=fn,contains:target=>target===entry||target===entry.child,matches:()=>entry.hover,child:{}};c.window.ShopTryOn.bind(entry,patch,label,title);return entry;}
 return {base,c,api:c.window.ShopTryOn,nodes,frames,previews,card,flush(){while(frames.length)frames.shift()();}};
}
test('try-on returns isolated cosmetic overrides and cannot spend money or alter saved appearance',()=>{
 const base=Object.freeze({currentHat:'none',money:100,protogenLogo:'logo'}),preview=rules.state(base,{hat:'red',money:0,currentHat:'hacked'});assert.equal(preview.currentHat,'red');assert.equal(preview.money,100);assert.equal(base.currentHat,'none');assert.equal(preview.protogenLogo,'logo');
});
test('hover shows candidate and mouse exit restores equipped look, without a purchase callback',()=>{
 const s=setup(),card=s.card({hat:'red'},'Red Cap');card.handlers.pointerenter({pointerType:'mouse'});s.flush();assert.equal(s.previews.at(-1).currentHat,'red');assert.equal(s.nodes['shop-preview-status'].hidden,false);assert.match(s.nodes['shop-preview-status'].textContent,/Red Cap.*preview only/);
 card.handlers.pointerleave();s.flush();assert.equal(s.previews.at(-1).currentHat,'none');assert.equal(s.nodes['shop-preview-status'].hidden,true);assert.equal(s.base.money,100);
});
test('fast pointer movements coalesce to the final item before rebuilding the preview',()=>{
 const s=setup(),a=s.card({hat:'red'}),b=s.card({hat:'blue'});a.handlers.pointerenter({pointerType:'mouse'});b.handlers.pointerenter({pointerType:'mouse'});a.handlers.pointerleave();assert.equal(s.frames.length,1);s.flush();assert.equal(s.previews.length,1);assert.equal(s.previews[0].currentHat,'blue');
});
test('keyboard focus previews cosmetics, child focus stays active, and leaving focus restores',()=>{
 const s=setup(),card=s.card({shirt:'stripes'});assert.equal(card.tabIndex,0);card.handlers.focusin();s.flush();assert.equal(s.previews.at(-1).currentShirt,'stripes');card.handlers.focusout({relatedTarget:card.child});s.flush();assert.equal(s.previews.at(-1).currentShirt,'stripes');card.handlers.focusout({relatedTarget:null});s.flush();assert.equal(s.previews.at(-1).currentShirt,'plain');
});
test('touch hover is ignored, studio blocks try-on, and closed shop does not rebuild a destroyed renderer',()=>{
 const s=setup(),card=s.card({hat:'red'});card.handlers.pointerenter({pointerType:'touch'});s.flush();assert.equal(s.previews.length,0);s.nodes['character-studio'].open=true;card.handlers.focusin();s.flush();assert.equal(s.previews.length,0);s.nodes['character-studio'].open=false;card.handlers.focusin();s.nodes['shop-overlay'].style.display='none';s.api.clear(false);s.flush();assert.equal(s.previews.length,0);
});
test('title try-on uses text-only preview labels and resets alongside the cosmetic',()=>{
 const s=setup(),card=s.card({},'Favorite title',{text:'<cool>',color:'#123456'});card.handlers.focusin();assert.equal(s.nodes['shop-preview-title'].textContent,'< <cool> >');assert.equal(s.nodes['shop-preview-title'].style.color,'#123456');s.api.clear(false);assert.equal(s.nodes['shop-preview-title'].hidden,true);
});
test('3D preview state and 3D shop cards drive try-on across every wearable category',()=>{
 const ui=fs.readFileSync('ui.js','utf8');assert(ui.includes('characterCfgFromSave(previewState)'));assert(ui.includes('window.createCharacterThumbnail'));assert(ui.includes("CharacterThumbnails?.cancel?.('shop')"));assert(!ui.includes('drawHat(tempCtx, previewState.currentHat'));
 for(const key of ['hat','shirt','pants','collar'])assert(new RegExp('ShopTryOn\\?\\.bind\\(entry,\\{'+key+':').test(ui));
 for(const file of ['index.html','.cpanel.yml','deploy.ps1'])assert(fs.readFileSync(file,'utf8').includes('shop-try-on.js'));
});
