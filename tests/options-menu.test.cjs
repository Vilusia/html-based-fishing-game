const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
test('Escape menu keeps existing controls and groups them in accessible bounded tabs',()=>{
    for(const id of ['volume-slider','sfx-slider','midi-slider','voice-slider','screen-slider','mic-select','btn-music-toggle','btn-midi-toggle','btn-titles-toggle','btn-fps-counter','render-scale','btn-debug-toggle','import-file','keybinds-container'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' remains unique');
    assert.equal((html.match(/id="btn-models-3d"/g)||[]).length,0);
    for(const tab of ['audio','display','controls','save','session']){assert(html.includes('id="options-tab-'+tab+'"'));assert(html.includes('id="options-section-'+tab+'"'));}
    assert(html.includes('class="settings-footer"'));assert(html.includes('Resume game'));assert(html.includes('overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain'));
    for(const handler of ['changeVolume','changeSFXVolume','changeMidiVolume','changeVoiceVolume','changeScreenVolume','changeAudioInput','exportSaveFile','deleteSave','respawnPlayer','leaveGame','resetKeybinds'])assert(html.includes(handler+'('));
});
test('settings tabs support keyboard navigation, mobile controls and reopening the previous section',()=>{
    const node=()=>({style:{display:'none'},attributes:{},setAttribute(k,v){this.attributes[k]=v;},focus(){this.focused=true;}}),nodes={};
    for(const tab of ['audio','display','controls','save','session']){nodes['options-tab-'+tab]=node();nodes['options-section-'+tab]=node();}
    for(const id of ['mobile-controls-note','keybinds-container','btn-reset-keybinds','options-overlay','volume-slider'])nodes[id]=node();
    let renders=0,removed=0;const context={isMobile:false,saveState:{masterVolume:.7},document:{getElementById:id=>nodes[id],removeEventListener(){removed++;},exitPointerLock(){}},handleRebind(){},renderKeybinds(){renders++;}};context.window=context;
    for(const name of ['populateAudioInputs','updateMusicUI','updateMidiUI','updateTitleUI','updateCharacterModelUI','updatePerformanceUI','updateDebugUI'])context[name]=()=>{};
    vm.createContext(context);vm.runInContext(source.slice(source.indexOf('const OPTIONS_TABS='),source.indexOf('window.toggleShop =',source.indexOf('const OPTIONS_TABS='))),context);
    context.toggleOptions();assert.equal(nodes['options-overlay'].style.display,'flex');assert.equal(nodes['volume-slider'].value,.7);assert.equal(nodes['options-section-audio'].hidden,false);
    context.setOptionsTab('display');assert.equal(nodes['options-section-audio'].hidden,true);assert.equal(nodes['options-tab-display'].attributes['aria-selected'],'true');
    let prevented=false;context.handleOptionsTabKey({key:'ArrowRight',preventDefault(){prevented=true;}});assert(prevented);assert.equal(nodes['options-section-controls'].hidden,false);assert(nodes['options-tab-controls'].focused);assert(renders>0);
    context.toggleOptions();context.toggleOptions();assert.equal(nodes['options-section-controls'].hidden,false);
    context.isMobile=true;context.setOptionsTab('controls');assert.equal(nodes['keybinds-container'].hidden,true);assert.equal(nodes['mobile-controls-note'].hidden,false);assert(removed>0);
});
