// Visual character editing reuses the game's cosmetics, saves and single preview.
(function(){
    'use strict';
    const FIELDS=['species','currentEars','currentEyes','currentNose','currentMisc','currentTail','currentHair','catColor','bellyColor','eyeColor','earsColor','noseColor','miscColor','tailColor','hairColor','handColor','footColor','tailAccentColor','protogenLogo','currentHat','currentShirt','currentPants','currentCollar','bodyPaint','bodyPaintBack','bodyPaintLeft','bodyPaintRight','bodyPaintHeadFront','bodyPaintHeadBack','bodyPaintHeadLeft','bodyPaintHeadRight','bodyPaintHeadTop','bodyPaintHeadBottom','bodyPaintArmLeft','bodyPaintArmRight','bodyPaintLegLeft','bodyPaintLegRight','bodyPaintColor','currentRod','currentTitle'];
    const CATEGORIES=[['body','Body','M8 5a4 4 0 1 0 8 0M5 22v-5a7 7 0 0 1 14 0v5'],['face','Face','M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z M12 9v6'],['ears','Ears','M4 16 3 2l8 8m2 0 8-8-1 14M6 21h12'],['hair','Hair','M4 20V9a8 8 0 0 1 16 0v11M4 10c7 1 8-7 8-7s1 7 8 7'],['tail','Tail','M5 21c14 2 18-12 10-16-6-3-9 4-4 6 5 2 4 5-1 6'],['extras','Extras','M12 2v20M2 12h20M5 5l14 14M19 5 5 19'],['clothes','Clothes','m8 3-6 4 3 5 3-2v12h8V10l3 2 3-5-6-4c0 4-8 4-8 0Z'],['looks','Looks','M5 3h14v19l-7-5-7 5Z']];
    const PALETTE=[['Snow','#ffffff'],['Cream','#f5dfb3'],['Sand','#c69b6e'],['Cocoa','#80563d'],['Slate','#73869c'],['Charcoal','#282d38'],['Black','#101019'],['Rose','#e887a8'],['Coral','#ef765c'],['Gold','#f3c650'],['Lime','#74ed43'],['Mint','#79d6b0'],['Sky','#72c7ef'],['Ocean','#4078c8'],['Lavender','#b79bea'],['Violet','#8059b8']];
    const STARTERS=[['cat','Cat','cat','standard','cat','none','cat'],['fox','Fox','fox','standard','dog','fox_cheeks','fox'],['bunny','Bunny','bunny','standard','cat','none','bunny'],['protogen','Protogen','protogen','protogen','protogen','protogen_visor','protogen'],['dragon','Dragon','dragon','dragon','dragon','dragon_wings','dragon'],['axolotl','Axolotl','none','standard','axolotl','axolotl_gills','axolotl']];
    function snapshot(state){return Object.fromEntries(FIELDS.map(k=>[k,state[k]]));}
    const rules={FIELDS,CATEGORIES,PALETTE,STARTERS,snapshot};
    if(typeof module==='object'&&module.exports)module.exports=rules;
    if(typeof window==='undefined')return;
    let modal=null,category='body',facePart='eyes',clothingPart='hats',history=[],future=[],query='',previewHome=null,logoHome=null,focusBefore=null;
    const $=id=>document.getElementById(id);
    const icon=path=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';
    function button(text,fn,className=''){const el=document.createElement('button');el.type='button';el.className=className;el.textContent=text;el.onclick=fn;return el;}
    function remember(){history.push(snapshot(saveState));if(history.length>30)history.shift();future=[];}
    function apply(values){remember();Object.assign(saveState,values);changed();}
    function changed(){saveGame();if(typeof player!=='undefined'&&player)updateLocalVisuals();populatePartSelectors();window.updateCharacterPreview?.();refresh();}
    function stashLogo(){const row=$('protogen-logo-row');if(row&&logoHome?.parentNode)logoHome.parentNode.insertBefore(row,logoHome.nextSibling);}
    function close(){if(!modal?.open)return;window.CharacterThumbnails?.cancel?.('studio');window.ShopCharacterPreview?.setPaintMode?.(false);paintStroke=null;if(paintPreviewTimer){clearTimeout(paintPreviewTimer);paintPreviewTimer=null;}window.__studioPaintUndress=false;stashLogo();const preview=$('character-preview');if(preview&&previewHome?.parentNode)previewHome.parentNode.insertBefore(preview,previewHome.nextSibling);modal.close();window.ShopCharacterPreview?.setView?.('full');window.renderShop?.();focusBefore?.focus();}
    function init(){
        if(modal)return;
        modal=document.createElement('dialog');modal.id='character-studio';modal.setAttribute('aria-labelledby','studio-title');
        modal.innerHTML='<header class="studio-header"><div class="studio-brand"><span>LAKESIDE · SAVES AS YOU GO</span><h2 id="studio-title">Character studio</h2></div><div class="studio-history"><button type="button" id="studio-undo">↶ <span>Undo</span></button><button type="button" id="studio-redo">↷ <span>Redo</span></button></div><button type="button" class="studio-done" id="studio-done">Done ✓</button></header><div class="studio-layout"><section class="studio-stage" aria-label="Character preview"><div class="studio-stage-title"><strong id="studio-name"></strong><span>LIVE PREVIEW</span></div><div id="studio-model"></div><div class="studio-camera" aria-label="Preview camera"><button type="button" data-view="front">Front</button><button type="button" data-view="left">Side</button><button type="button" data-view="back">Back</button><button type="button" data-view="full">Full body</button><button type="button" data-view="in" aria-label="Zoom in">＋</button><button type="button" data-view="out" aria-label="Zoom out">−</button></div><p class="studio-stage-help">Drag to turn · Arrow keys work too</p><div class="studio-save-note"><span>✓</span><div>Your changes save automatically.<small>Undo an edit anytime while the studio is open.</small></div></div></section><nav id="studio-nav" aria-label="Character features"></nav><section class="studio-inspector"><header><span id="studio-eyebrow">MAKE IT YOURS</span><h3 id="studio-section-title"></h3><p id="studio-section-help"></p></header><div id="studio-controls"></div><label class="studio-search" id="studio-search-wrap">Find a style<input id="studio-search" type="search" placeholder="Search by name…" autocomplete="off"></label><div id="studio-choices" aria-label="Feature choices"></div><p id="studio-empty" hidden>No styles match. Try another name.</p><p id="studio-status" role="status" aria-live="polite"></p></section></div>';
        document.body.append(modal);$('studio-done').onclick=close;$('studio-undo').setAttribute('aria-label','Undo last edit');$('studio-redo').setAttribute('aria-label','Redo edit');modal.addEventListener('cancel',e=>{e.preventDefault();close();});
        $('studio-undo').onclick=()=>{if(history.length){future.push(snapshot(saveState));Object.assign(saveState,history.pop());changed();}};
        $('studio-redo').onclick=()=>{if(future.length){history.push(snapshot(saveState));Object.assign(saveState,future.pop());changed();}};
        $('studio-search').oninput=e=>{query=e.target.value;renderChoices();};
        modal.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>window.ShopCharacterPreview?.setView?.(b.dataset.view));
        const preview=$('character-preview');previewHome=document.createComment('studio-preview-home');preview.before(previewHome);
        const logo=$('protogen-logo-row');if(logo){logoHome=document.createComment('studio-logo-home');logo.before(logoHome);}
        for(const [id,label,path]of CATEGORIES){const b=button('',()=>{category=id;query='';$('studio-search').value='';refresh();modal.querySelector('.studio-inspector').scrollTop=0;window.ShopCharacterPreview?.setView?.(['ears','face','hair','extras'].includes(id)?'face':id==='tail'?'back':'full');},'studio-nav-item');b.dataset.category=id;b.innerHTML=icon(path)+'<span>'+label+'</span>';$('studio-nav').append(b);}
    }
    function thumbnail(values,focus='full'){
        if(window.createCharacterThumbnail)return window.createCharacterThumbnail(values,focus,128,128,'studio');
        const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#afd9ed';ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText('◇',64,76);
        canvas.setAttribute('aria-hidden','true');return canvas;
    }
    function colorControl(host,label,key,reset=true){
        const block=document.createElement('div');block.className='studio-color-block';const top=document.createElement('div');top.className='studio-color-label';
        const text=document.createElement('strong');text.textContent=label;top.append(text);
        const input=document.createElement('input');input.type='color';input.value=saveState[key]||saveState.catColor||'#ffffff';input.setAttribute('aria-label',label+' custom color');input.onchange=()=>apply({[key]:input.value});top.append(input);if(reset)top.append(button('Reset',()=>apply({[key]:''}),'studio-reset'));block.append(top);
        const palette=document.createElement('div');palette.className='studio-palette';for(const [name,color]of PALETTE){const b=button('',()=>apply({[key]:color}),'studio-swatch');b.style.setProperty('--swatch',color);b.title=name;b.setAttribute('aria-label',label+': '+name);b.setAttribute('aria-pressed',String((saveState[key]||'').toLowerCase()===color));palette.append(b);}block.append(palette);host.append(block);
    }
    let paintColor=9,paintModeOn=true,mirrorPaint=true,paintBrushSize=1,paintStroke=null,paintPreviewTimer=null;
    function bodyPaintControl(host){
        const BP=window.BodyPaint;
        if(!BP||!saveState.model3D)return;
        const block=document.createElement('div');block.className='studio-paint-block';

        // Start with a short, visual explanation because the studio previously
        // dropped players into a grid of colors without saying how painting works.
        const hero=document.createElement('div');hero.className='studio-paint-hero';
        const eyebrow=document.createElement('span');eyebrow.className='studio-paint-eyebrow';eyebrow.textContent='PAINT MODE';
        const heading=document.createElement('strong');heading.textContent='Paint right on your character';
        const intro=document.createElement('p');intro.textContent='Choose a color, then drag directly across the 3D model.';
        const steps=document.createElement('ol');steps.className='studio-paint-steps';
        for(const text of ['Pick a color, custom color, or Eraser.','Drag on the model; use Front, Back and Side to reach every area.','Mirror copies each stroke to the opposite side.']){
            const item=document.createElement('li');item.textContent=text;steps.append(item);
        }
        const note=document.createElement('p');note.className='studio-paint-note';note.textContent='Clothes and hair hide while painting. Paint saves automatically and Undo is always available in the header.';
        hero.append(eyebrow,heading,intro,steps,note);block.append(hero);

        const top=document.createElement('div');top.className='studio-color-label';
        const title=document.createElement('strong');title.textContent='Color & tools';top.append(title);
        const custom=document.createElement('input');custom.type='color';custom.className='studio-paint-custom';custom.value=BP.normalizeColor(saveState.bodyPaintColor);custom.title='Custom color';custom.setAttribute('aria-label','Custom body paint color');
        custom.onchange=()=>{paintColor=-2;apply({bodyPaintColor:custom.value});};
        top.append(custom);
        const clear=button('Clear all',()=>{
            if(typeof confirm==='function'&&!confirm('Clear all body paint? You can still Undo this while the studio is open.'))return;
            apply({bodyPaint:'',bodyPaintBack:'',bodyPaintLeft:'',bodyPaintRight:'',bodyPaintHeadFront:'',bodyPaintHeadBack:'',bodyPaintHeadLeft:'',bodyPaintHeadRight:'',bodyPaintHeadTop:'',bodyPaintHeadBottom:'',bodyPaintArmLeft:'',bodyPaintArmRight:'',bodyPaintLegLeft:'',bodyPaintLegRight:''});
        },'studio-reset');top.append(clear);block.append(top);

        const modeRow=document.createElement('div');modeRow.className='studio-paint-mode-row';
        const mode=button('Painting: ON',()=>{paintModeOn=!paintModeOn;syncPaintMode();},'studio-paint-mode');
        const mirror=button('Mirror: ON',()=>{mirrorPaint=!mirrorPaint;syncMirror();},'studio-paint-view');
        modeRow.append(mode,mirror);block.append(modeRow);

        const status=document.createElement('p');status.className='studio-paint-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');block.append(status);

        const brushRow=document.createElement('div');brushRow.className='studio-paint-tools studio-paint-brush-row';
        const brushLabel=document.createElement('span');brushLabel.className='studio-paint-label';brushLabel.textContent='Brush';brushRow.append(brushLabel);
        const brushButtons=[];
        for(const [size,label] of [[1,'Fine'],[2,'Medium'],[3,'Wide']]){
            const b=button(label,()=>{paintBrushSize=size;syncBrush();},'studio-paint-view studio-paint-brush');
            brushButtons.push(b);brushRow.append(b);
        }
        brushRow.append(button('Undo stroke',()=>$('studio-undo').click(),'studio-paint-view studio-paint-undo'));
        block.append(brushRow);

        const viewRow=document.createElement('div');viewRow.className='studio-paint-tools';
        const viewLabel=document.createElement('span');viewLabel.className='studio-paint-label';viewLabel.textContent='View';viewRow.append(viewLabel);
        for(const [label,view] of [['Front','front'],['Back','back'],['Left','left'],['Right','right']]){
            const b=button(label,()=>{paintModeOn=true;window.ShopCharacterPreview?.setView?.(view);syncPaintMode();},'studio-paint-view');
            viewRow.append(b);
        }
        block.append(viewRow);

        const palette=document.createElement('div');palette.className='studio-paint-palette';
        const eraser=button('Eraser',()=>{paintColor=-1;syncPalette();},'studio-paint-eraser');
        palette.append(eraser);
        const swatches=[];
        PALETTE.forEach(([name,color],index)=>{
            const swatch=button('',()=>{paintColor=index;syncPalette();},'studio-paint-swatch');
            swatch.style.setProperty('--swatch',color);swatch.title=name;swatch.setAttribute('aria-label',name);swatches.push(swatch);palette.append(swatch);
        });
        function syncPalette(){
            eraser.setAttribute('aria-pressed',String(paintColor===-1));
            swatches.forEach((s,i)=>s.setAttribute('aria-pressed',String(i===paintColor)));
            custom.setAttribute('aria-pressed',String(paintColor===-2));
        }
        function syncMirror(){
            mirror.textContent=mirrorPaint?'Mirror: ON':'Mirror: OFF';
            mirror.setAttribute('aria-pressed',String(mirrorPaint));
        }
        function syncBrush(){
            brushButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i+1===paintBrushSize)));
        }
        function syncPaintMode(){
            mode.textContent=paintModeOn?'Painting: ON':'Start painting';
            mode.setAttribute('aria-pressed',String(paintModeOn));
            block.classList.toggle('studio-paint-active',paintModeOn);
            status.textContent=paintModeOn?'Painting is active. Drag on the model to draw.':'Painting is paused. Start painting when you are ready.';
            window.ShopCharacterPreview?.setPaintMode?.(paintModeOn,{down:paintDown,move:paintMove,up:paintUp});
            const changed=window.__studioPaintUndress!==paintModeOn;
            window.__studioPaintUndress=paintModeOn;
            if(changed)window.updateCharacterPreview?.();
        }
        function fieldFor(side){
            return {back:'bodyPaintBack',left:'bodyPaintLeft',right:'bodyPaintRight',headFront:'bodyPaintHeadFront',headBack:'bodyPaintHeadBack',headLeft:'bodyPaintHeadLeft',headRight:'bodyPaintHeadRight',headTop:'bodyPaintHeadTop',headBottom:'bodyPaintHeadBottom',armLeft:'bodyPaintArmLeft',armRight:'bodyPaintArmRight',legLeft:'bodyPaintLegLeft',legRight:'bodyPaintLegRight'}[side]||'bodyPaint';
        }
        function dataFor(side){return BP.normalize(saveState[fieldFor(side)])||'.'.repeat(BP.size);}
        function mirrorTarget(side){
            return {left:'right',right:'left',headLeft:'headRight',headRight:'headLeft',armLeft:'armRight',armRight:'armLeft',legLeft:'legRight',legRight:'legLeft'}[side]||side;
        }
        function brushCells(cells){
            const radius=paintBrushSize-1;
            if(radius<=0)return cells;
            const out=[],seen=new Set();
            for(const [cx,cy] of cells)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
                if(dx*dx+dy*dy>radius*radius)continue;
                const x=cx+dx,y=cy+dy;
                if(x<0||y<0||x>=BP.width||y>=BP.height)continue;
                const key=x+','+y;
                if(seen.has(key))continue;
                seen.add(key);out.push([x,y]);
            }
            return out;
        }
        function applyCells(side,cells){
            if(!cells.length)return;
            cells=brushCells(cells);
            const value=paintColor===-1?'.':paintColor===-2?'x':paintColor.toString(16);
            const jobs=[{side,flip:false}];
            if(mirrorPaint)jobs.push({side:mirrorTarget(side),flip:true});
            const fields={};let changed=false;
            for(const job of jobs){
                const field=fieldFor(job.side);
                if(!fields[field])fields[field]=dataFor(job.side).split('');
                const data=fields[field];
                for(const [x,y] of cells){
                    const i=y*BP.width+(job.flip?BP.width-1-x:x);
                    if(data[i]===value)continue;
                    data[i]=value;changed=true;
                }
            }
            if(!changed)return;
            for(const [field,data] of Object.entries(fields))saveState[field]=data.join('');
            if(!paintPreviewTimer)paintPreviewTimer=setTimeout(()=>{paintPreviewTimer=null;window.updateCharacterPreview?.();},90);
        }
        function cell(hit){
            return {
                side:hit.side,
                x:Math.max(0,Math.min(BP.width-1,Math.floor(hit.uv.x*BP.width))),
                y:Math.max(0,Math.min(BP.height-1,Math.floor((1-hit.uv.y)*BP.height)))
            };
        }
        function paintHit(hit,connect){
            if(!paintStroke)return;
            const next=cell(hit);
            if(paintStroke.side!==next.side){paintStroke.side=next.side;paintStroke.last=null;}
            if(paintStroke.last&&(Math.abs(next.x-paintStroke.last.x)>BP.width*.75||Math.abs(next.y-paintStroke.last.y)>BP.height*.75))paintStroke.last=null;
            const cells=[];
            if(connect&&paintStroke.last){
                let x0=paintStroke.last.x,y0=paintStroke.last.y,x1=next.x,y1=next.y,dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;
                for(;;){cells.push([x0,y0]);if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x0+=sx;}if(e2<=dx){err+=dx;y0+=sy;}}
            }else cells.push([next.x,next.y]);
            paintStroke.last=next;applyCells(next.side,cells);
        }
        function paintDown(e){
            const hit=window.ShopCharacterPreview?.hitTest(e.clientX,e.clientY);
            if(!hit)return false;
            remember();paintStroke={side:hit.side,last:null};paintHit(hit,false);return true;
        }
        function paintMove(e){
            if(!paintStroke)return;
            const hit=window.ShopCharacterPreview?.hitTest(e.clientX,e.clientY);
            if(hit)paintHit(hit,true);
        }
        function paintUp(){
            if(!paintStroke)return;
            paintStroke=null;
            if(paintPreviewTimer){clearTimeout(paintPreviewTimer);paintPreviewTimer=null;}
            changed();
        }
        syncPalette();syncMirror();syncBrush();syncPaintMode();block.append(palette);host.append(block);
    }
    function tabs(host,items,selected,choose){const row=document.createElement('div');row.className='studio-subtabs';for(const [id,label]of items){const b=button(label,()=>{choose(id);query='';$('studio-search').value='';refresh();});b.setAttribute('aria-pressed',String(id===selected));row.append(b);}host.append(row);}
    function definition(){
        if(category==='ears')return {types:EAR_TYPES,key:'currentEars',color:'earsColor',label:'Ear color',focus:'head'};
        if(category==='hair')return {types:HAIR_TYPES,key:'currentHair',color:'hairColor',label:'Hair color',focus:'head'};
        if(category==='face')return facePart==='eyes'?{types:EYE_TYPES,key:'currentEyes',color:'eyeColor',label:'Eye color',focus:'head'}:{types:NOSE_TYPES,key:'currentNose',color:'noseColor',label:'Nose color',focus:'head'};
        if(category==='tail')return {types:TAIL_TYPES,key:'currentTail',color:'tailColor',label:'Tail color',focus:'back'};
        if(category==='extras')return {types:MISC_TYPES,key:'currentMisc',color:'miscColor',label:'Extra color',focus:'head'};
        if(category==='clothes')return ({hats:{types:HAT_TYPES,key:'currentHat',owned:'unlockedHats',focus:'head'},shirts:{types:SHIRT_TYPES,key:'currentShirt',owned:'unlockedShirts'},pants:{types:PANTS_TYPES,key:'currentPants',owned:'unlockedPants'},collars:{types:COLLAR_TYPES,key:'currentCollar',owned:'unlockedCollars'}})[clothingPart];
        return null;
    }
    function renderChoices(){
        window.CharacterThumbnails?.cancel();
        const host=$('studio-choices');host.replaceChildren();const def=definition(),q=query.trim().toLowerCase();let count=0;
        function card(label,values,selected,focus,fn){if(q&&!label.toLowerCase().includes(q))return;count++;const b=button('',fn,'studio-choice');b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(selected));b.append(thumbnail(values,focus));const name=document.createElement('span');name.textContent=label;b.append(name);if(selected){const tick=document.createElement('small');tick.textContent='✓ Selected';b.append(tick);}host.append(b);}
        if(category==='body')for(const [species,name,ears,eyes,nose,misc,tail]of STARTERS){const values={species,currentEars:ears,currentEyes:eyes,currentNose:nose,currentMisc:misc,currentTail:tail};card(name,values,Object.keys(values).every(k=>saveState[k]===values[k]),'full',()=>apply(values));}
        else if(category==='looks'){
            for(const look of saveState.savedOutfits||[]){const values={currentEars:look.ears,currentEyes:look.eyes,currentNose:look.nose,currentMisc:look.misc,currentTail:look.tail,catColor:look.color,bellyColor:look.belly,eyeColor:look.eye,currentHair:look.hair,hairColor:look.hairColor,currentHat:look.hat,currentShirt:look.shirt,currentPants:look.pants,currentCollar:look.collar,bodyPaint:look.bodyPaint,bodyPaintBack:look.bodyPaintBack,bodyPaintLeft:look.bodyPaintLeft,bodyPaintRight:look.bodyPaintRight,bodyPaintHeadFront:look.bodyPaintHeadFront,bodyPaintHeadBack:look.bodyPaintHeadBack,bodyPaintHeadLeft:look.bodyPaintHeadLeft,bodyPaintHeadRight:look.bodyPaintHeadRight,bodyPaintHeadTop:look.bodyPaintHeadTop,bodyPaintHeadBottom:look.bodyPaintHeadBottom,bodyPaintArmLeft:look.bodyPaintArmLeft,bodyPaintArmRight:look.bodyPaintArmRight,bodyPaintLegLeft:look.bodyPaintLegLeft,bodyPaintLegRight:look.bodyPaintLegRight,bodyPaintColor:look.bodyPaintColor,protogenLogo:look.protogenLogo,earsColor:look.earsColor,noseColor:look.noseColor,miscColor:look.miscColor,tailColor:look.tailColor};const before=count;card(look.name||'Saved look',values,false,'full',()=>{remember();loadOutfit(look.id);refresh();});if(count>before){const choice=host.lastElementChild,wrap=document.createElement('div');wrap.className='studio-look';wrap.append(choice,button('Share',()=>window.shareOutfit?.(look.id),'studio-reset'),button('Delete',()=>{deleteOutfit(look.id);refresh();},'studio-reset'));host.append(wrap);}}
        }else if(def)for(const item of def.types.filter(x=>!def.owned||x.id==='none'||(saveState[def.owned]||[]).includes(x.id))){const values={[def.key]:item.id};if(category==='hair')values.currentHat='none';const focus=category==='extras'&&!['protogen_visor','demon_horns','halo','whiskers_long','fox_cheeks','squirrel_cheeks','hamster_cheeks','panda_patches','raccoon_mask'].includes(item.id)?'full':def.focus||'full';card(item.name,values,saveState[def.key]===item.id,focus,()=>apply({[def.key]:item.id}));}
        $('studio-empty').hidden=count>0;$('studio-empty').textContent=category==='looks'&&!count&&!q?'Your first look starts here. Save the character you’re wearing above.':!count&&category==='clothes'?'Nothing here yet. Visit the boutique to unlock more styles.':'No styles match. Try another name.';
    }
    function refresh(){
        if(!modal?.open)return;stashLogo();$('studio-controls').replaceChildren();const host=$('studio-controls'),def=definition();
        host.parentNode.insertBefore(host,$('studio-search-wrap'));
        $('studio-name').textContent=saveState.displayName||'Your angler';$('studio-section-title').textContent=CATEGORIES.find(c=>c[0]===category)[1];
        $('studio-section-help').textContent=({body:'Start with a species, then paint directly on the 3D model in Paint mode.',face:'Pick your eyes or nose. Every choice updates your character.',ears:'Pointed, floppy, round—find your silhouette.',hair:'Pick a cut and make the color yours. Previews hide hats to show the style.',tail:'Turn around and find your finishing touch.',extras:'Wings, fins, markings and your own protogen sign.',clothes:'Your owned wardrobe. No purchases happen in the studio.',looks:'Keep favorite characters ready for your next visit.'})[category];
        for(const b of $('studio-nav').children)b.setAttribute('aria-pressed',String(b.dataset.category===category));
        if(category==='face')tabs(host,[['eyes','Eyes'],['nose','Nose']],facePart,v=>facePart=v);
        if(category==='clothes')tabs(host,[['hats','Hats'],['shirts','Tops'],['pants','Bottoms'],['collars','Neckwear']],clothingPart,v=>clothingPart=v);
        if(category==='body'){bodyPaintControl(host);colorControl(host,'Body','catColor',false);colorControl(host,'Belly','bellyColor',false);if(saveState.model3D){colorControl(host,'Hands','handColor');colorControl(host,'Feet','footColor');}}
        if(def?.color)colorControl(host,def.label,def.color,!['eyeColor','hairColor'].includes(def.color));
        if(category==='tail'&&saveState.model3D)colorControl(host,'Tail accent','tailAccentColor');
        if(category==='extras'){const row=$('protogen-logo-row');if(row){host.append(row);window.ProtogenLogo?.syncButton();}}
        if(category!=='body'){
            window.ShopCharacterPreview?.setPaintMode?.(false);
            if(window.__studioPaintUndress){window.__studioPaintUndress=false;window.updateCharacterPreview?.();}
        }
        if(category==='looks'){host.append(button('+ Save this look',()=>{saveCurrentOutfit();refresh();},'studio-primary'));host.append(button('Import outfit code',()=>window.importOutfitCode?.(),'studio-reset'));}
        if(category==='clothes')host.append(button('Browse boutique',()=>{close();$('shop-categories')?.querySelector('button')?.click();},'studio-reset'));
        $('studio-undo').disabled=!history.length;$('studio-redo').disabled=!future.length;renderChoices();
        const current=def?.types.find(i=>i.id===saveState[def.key]);$('studio-status').textContent=current?'Wearing '+current.name:'Mix, match and make yourself at home.';
    }
    function open(){window.ShopTryOn?.clear(false);init();focusBefore=document.activeElement;history=[];future=[];category='body';query='';$('studio-search').value='';window.MobileUI?.stop();document.exitPointerLock?.();$('studio-model').append($('character-preview'));modal.showModal();window.updateCharacterPreview?.();refresh();window.ShopCharacterPreview?.setView?.('full');$('studio-done').focus();}
    window.CharacterStudio={open,close,refresh,beforeEdit(){if(modal?.open)remember();}};
})();
