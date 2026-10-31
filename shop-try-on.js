// Try-on state belongs only to the preview; equipped/save/network data stays untouched.
(function(){
    const FIELDS={hat:'currentHat',shirt:'currentShirt',pants:'currentPants',collar:'currentCollar'};
    function state(base,patch){const copy={...base};for(const [key,value]of Object.entries(patch||{}))if(FIELDS[key])copy[FIELDS[key]]=value;return copy;}
    if(typeof module==='object'&&module.exports)module.exports={state,FIELDS};
    if(typeof window==='undefined')return;
    let active=null,queued=false;
    function labels(){
        const status=document.getElementById('shop-preview-status'),title=document.getElementById('shop-preview-title');
        if(status){status.hidden=!active;status.textContent=active?'Trying on: '+active.label+' · preview only':'';}
        if(title){title.hidden=!active?.title?.text;title.textContent=active?.title?.text?'< '+active.title.text+' >':'';title.style.color=active?.title?.color||'';}
    }
    function redraw(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(document.getElementById('shop-overlay')?.style.display==='flex'&&!document.getElementById('character-studio')?.open)window.updateCharacterPreview?.();});}
    function clear(render=true){const had=!!active;active=null;labels();if(had&&render)redraw();}
    function bind(entry,patch,label,title=null){
        entry.tabIndex=0;
        const show=()=>{if(document.getElementById('character-studio')?.open)return;active={entry,patch:{...patch},label,title};labels();redraw();};
        entry.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')show();});
        entry.addEventListener('pointerleave',()=>{if(active?.entry===entry&&!entry.contains(document.activeElement))clear();});
        entry.addEventListener('focusin',show);
        entry.addEventListener('focusout',e=>{if(active?.entry===entry&&!entry.contains(e.relatedTarget)&&!entry.matches(':hover'))clear();});
    }
    window.ShopTryOn={bind,clear,state:base=>state(base,active?.patch)};
})();
