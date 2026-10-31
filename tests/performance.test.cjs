const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../performance.js'),'utf8');
function setup(){let writes=0;const node={hidden:false,set textContent(v){this.text=v;writes++;}};const fail=()=>{throw new Error('Counter must not schedule or delay frames');};const context=vm.createContext({window:{},document:{getElementById:()=>node},requestAnimationFrame:fail,setTimeout:fail,setInterval:fail});vm.runInContext(source,context);return {perf:context.window.GamePerformance,node,writes:()=>writes};}
for(const hz of [30,60,120,144]){
    const {perf}=setup();
    for(let i=0;i<hz*2;i++){const now=i*1000/hz;perf.beginFrame(now);perf.finishFrame(now+3,{render:{calls:288,triangles:18238}},true);}
    assert(Math.abs(perf.state.fps-hz)<=2,'passive counter must report browser rate '+hz);
    assert(Math.abs(perf.state.workMs-3)<.001);
    assert.equal(perf.state.draws,288);
}
{
    const {perf,node,writes}=setup();perf.recordModelBuild();perf.recordModelBuild();
    for(let i=0;i<120;i++){const now=i*1000/60;perf.beginFrame(now);perf.finishFrame(now+2,{render:{calls:288,triangles:18238}},true);}
    assert(writes()<=4);assert.equal(perf.state.builds,2);assert(node.text.includes('Model builds: 2'));
}
const ui=fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8');
const entry=ui.slice(ui.indexOf('function animate('),ui.indexOf('// --- TIME & VISUALS ---',ui.indexOf('function animate(')));
assert(entry.includes('requestAnimationFrame(animate);'));assert(entry.includes('const dt = clock.getDelta();'));
assert(!entry.includes('if(!GamePerformance')&&!entry.includes('frameLimit'),'desktop rendering must use the original unrestricted animation loop');
console.log('PASS: passive 30/60/120/144 Hz telemetry, no timers or frame gating, model-build diagnostics and original desktop animation entry.');
