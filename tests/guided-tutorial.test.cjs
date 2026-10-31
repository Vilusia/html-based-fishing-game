const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const THREE=require('../vendor/three.min.js');
const rules=require('../guided-tutorial.js');
const source=fs.readFileSync(require.resolve('../guided-tutorial.js'),'utf8');
test('walkthrough covers every map NPC and every written guide topic',()=>{
 const world=fs.readFileSync(require.resolve('../worldgen.js'),'utf8');
 const catalog=world.slice(world.indexOf('const NPC_TYPES = ['),world.indexOf('function npcType'));
 for(const m of catalog.matchAll(/id:\s*["']([^"']+)/g))assert(rules.steps.some(s=>s.target===m[1]),m[1]);
 assert.equal(new Set(rules.steps.map(s=>s.id)).size,rules.steps.length);
 for(const id of ['move','look','jump','sit','charge','cast','bite','reel','catch','sell','flowers','wood','mining','cook','find','place','house','boat','sail','players','chat','emotes','tournament','events','maps','settings'])assert(rules.steps.some(s=>s.id===id),id);
});
test('saved progress rejects invalid indexes and event flags without completing a run',()=>{
 assert.equal(rules.normalize({index:99999}).index,rules.steps.length-1);
 assert.equal(rules.normalize({index:-4}).index,0);
 assert.deepEqual(rules.normalize({paused:true,events:{catch:true,sold:'true',money:true},skipped:['bogus','cast']}),{index:0,paused:true,events:{catch:true},skipped:['cast']});
});
test('direction indicator remains inside portrait and landscape viewports, including behind-camera targets',()=>{
 for(const [w,h]of [[390,844],[844,390],[1280,720]])for(const behind of [false,true])for(const [x,y]of [[0,0],[999999,42],[-999999,-999999],[12,999999]]){
  const m=rules.marker(x,y,behind,w,h);assert(Number.isFinite(m.angle));assert(m.x>=35&&m.x<=w-35);assert(m.y>=79&&m.y<=h-79);
 }
});
function fixture(){
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,style:{display:'none'},hidden:false,value:'',disabled:false,textContent:'',dataset:{},classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k]??null;},append(){},removeAttribute(){},firstElementChild:{style:{}},lastElementChild:{textContent:'',style:{}},set innerHTML(v){this.html=v;for(const m of v.matchAll(/id="([^"]+)"/g))el(m[1]);}});return elements.get(id);}
 el('lobby-screen').style.display='flex';el('guided-tour');
 const ctx={window:{},document:{getElementById:id=>elements.get(id)||null,body:{append(){}},createElement:()=>el('new-'+elements.size)},THREE,player:{position:new THREE.Vector3(40,0,0),rotation:{y:0}},camera:new THREE.PerspectiveCamera(),cameraRotationY:0,cameraRotationX:0,isInVoid:false,isInLavaWorld:false,isSitting:false,isSailing:false,saveState:{skills:{},tutorialDone:false},saveGame(){},getComputedStyle:e=>({display:e.style.display||'block'}),getTerrainHeight:()=>0,waterSurfaceAt:()=>null,equippedToolFromSave:()=> 'rod',showToast(){},performance:{now:()=>ctx.time+=200},time:0,innerWidth:390,innerHeight:844};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,el,api:ctx.window.GuidedTutorial};
}
test('starts only after entering a game, checks actual movement, pauses and resumes without losing progress',()=>{
 const {ctx,el,api}=fixture();api.tick();assert.equal(ctx.saveState.tutorialProgress,undefined);
 el('lobby-screen').style.display='none';api.tick();api.next();api.tick();assert.equal(ctx.saveState.tutorialProgress.index,1);assert.equal(el('guided-tour').dataset.ready,'false');
 api.next();assert.equal(ctx.saveState.tutorialProgress.index,1);
 ctx.player.position.x+=4;api.tick();assert.equal(el('guided-tour').dataset.ready,'true');api.next();assert.equal(ctx.saveState.tutorialProgress.index,2);
 api.pause();assert.equal(ctx.saveState.tutorialDone,false);assert.equal(ctx.saveState.tutorialProgress.paused,true);
 api.resume();assert.equal(ctx.saveState.tutorialProgress.index,2);assert.equal(ctx.saveState.tutorialProgress.paused,false);
});
test('real fishing events survive fast catches, chapter changes and reload; absent NPCs are skippable',()=>{
 const {ctx,el,api}=fixture();el('lobby-screen').style.display='none';api.tick();
 for(const name of ['charge','cast','bite','reel','catch'])api.event(name);
 el('tour-chapter').value='Fishing';el('tour-chapter').onchange();api.tick();assert.equal(el('guided-tour').dataset.ready,'true','missing Fisher does not block');
 const p=ctx.saveState.tutorialProgress;assert.equal(p.events.catch,true);
 api.pause();api.resume();assert.equal(ctx.saveState.tutorialProgress.events.catch,true);
 api.resume(true);assert.deepEqual(Object.keys(ctx.saveState.tutorialProgress.events),[]);
});
test('walkthrough is a right-side quest list with automatic progression',()=>{
 assert(source.includes('class="tour-head"'));
 assert(source.includes('id="tour-progress-bar"'));
 assert(source.includes('id="tour-steps"'));
 assert(source.includes('tour-step-current'));
 assert(source.includes('function shortText('));
 assert(source.includes("$('guided-tour-text').textContent=shortText(s.text)"));
 assert(source.includes("$('tour-details-toggle').onclick"));
 assert(source.includes("box.dataset.ready='true'"));
 assert.equal(source.includes('id="tour-next"'),false);
 assert.equal(source.includes('id="tour-primary"'),false);
 const css=fs.readFileSync(require.resolve('../guided-tutorial.css'),'utf8');
 assert(css.includes('right:14px'));
 assert(css.includes('.tour-head'));
 assert(css.includes('#tour-progress-bar'));
 assert(css.includes('.tour-steps'));
 assert(css.includes('.tour-step-current'));
 assert(css.includes('@keyframes tour-in'));
});
test('tracker expands details and collapses back to a small header',()=>{
 const {el,api}=fixture();el('lobby-screen').style.display='none';api.tick();
 assert.equal(el('tour-details').hidden,true);
 el('tour-details-toggle').onclick();assert.equal(el('tour-details').hidden,false);assert.equal(el('tour-details-toggle').getAttribute('aria-expanded'),'true');
 el('tour-minimize').onclick();assert.equal(el('tour-body').hidden,true);assert.equal(el('tour-minimize').textContent,'+');
 el('tour-minimize').onclick();assert.equal(el('tour-body').hidden,false);assert.equal(el('tour-minimize').textContent,'−');
});
test('read and completed objectives advance without pressing a button',()=>{
 const {ctx,el,api}=fixture();el('lobby-screen').style.display='none';api.tick();
 assert.equal(ctx.saveState.tutorialProgress.index,0);
 for(let i=0;i<40&&ctx.saveState.tutorialProgress.index===0;i++)api.tick();
 assert.ok(ctx.saveState.tutorialProgress.index>0,'the intro should auto-advance');
});
test('text-only steps get a centered automatic notice',()=>{
 assert(source.includes("id='tutorial-brief'"));
 assert(source.includes("const show=!!s&&s.goal==='read'"));
 assert(source.includes("$('tutorial-brief-text').textContent=s.text"));
 const css=fs.readFileSync(require.resolve('../guided-tutorial.css'),'utf8');
 assert(css.includes('#tutorial-brief{'));
 assert(css.includes('#tutorial-brief[hidden]'));
 assert(css.includes('@keyframes tutorial-brief-in'));
 assert.equal(source.includes('Hollowtide'),false);
});
test('tutorial actions are recorded before first tick and while paused',()=>{
 const {ctx,api}=fixture();
 api.event('catch');
 assert.equal(ctx.saveState.tutorialProgress.events.catch,true);
 ctx.saveState.tutorialProgress.paused=true;
 api.event('cast');
 assert.equal(ctx.saveState.tutorialProgress.events.cast,true);
});
test('hiding the HUD also hides the quest tracker and tutorial callouts',()=>{
 const css=fs.readFileSync(require.resolve('../guided-tutorial.css'),'utf8');
 assert(css.includes('body.hud-hidden #guided-tour'));
 assert(css.includes('body.hud-hidden #tutorial-brief'));
 assert(css.includes('body.hud-hidden #tutorial-arrow'));
});
test('quest card measures the tournament HUD so anchor ads cannot overlap it',()=>{
 assert(source.includes('function positionTour()'));
 assert(source.includes("document.getElementById('tournament-hud')"));
 assert(source.includes("style.position!=='fixed'"));
 assert(source.includes('innerHeight-rect.top+10'));
 assert(source.includes('if(box.style.bottom!==value)box.style.bottom=value'));
 assert(source.includes('positionTour();'));
});
test('real game wiring includes all fishing events, mobile resume and deployment assets',()=>{
 const ui=fs.readFileSync(require.resolve('../ui.js'),'utf8');
 for(const e of ['charge','cast','bite','reel','catch','sold','fisher'])assert(ui.includes(`GuidedTutorial?.event('${e}')`));
 assert(fs.readFileSync(require.resolve('../mobile-ui.js'),'utf8').includes("['Tutorial',()=>window.GuidedTutorial?.resume()]"));
 for(const file of ['../index.html','../.cpanel.yml','../deploy.ps1']){const s=fs.readFileSync(require.resolve(file),'utf8');assert(s.includes('guided-tutorial.js'));assert(s.includes('guided-tutorial.css'));}
});
