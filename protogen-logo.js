// Fixed-size monochrome signs: no remote images, SVG, or executable uploads.
(function(){
    'use strict';
    const SIZE=32,LENGTH=256;
    function normalize(value){return typeof value==='string'&&value.length===LENGTH&&/^[0-9a-f]+$/i.test(value)&&/[1-9a-f]/i.test(value)?value.toLowerCase():'';}
    function inside(x,y){return (x-15.5)**2+(y-15.5)**2<=15**2;}
    function decode(value){const bits=new Uint8Array(SIZE*SIZE),code=normalize(value);if(code)for(let i=0;i<bits.length;i++)bits[i]=(parseInt(code[i>>2],16)>>(3-(i&3)))&1;return bits;}
    function encode(bits){let code='';for(let i=0;i<SIZE*SIZE;i+=4){let n=0;for(let k=0;k<4;k++){const at=i+k;n=(n<<1)|(inside(at%SIZE,Math.floor(at/SIZE))&&bits[at]?1:0);}code+=n.toString(16);}return normalize(code);}
    function paint(bits,x,y,radius,value){for(let yy=Math.floor(y-radius);yy<=Math.ceil(y+radius);yy++)for(let xx=Math.floor(x-radius);xx<=Math.ceil(x+radius);xx++)if(xx>=0&&xx<SIZE&&yy>=0&&yy<SIZE&&inside(xx,yy)&&(xx-x)**2+(yy-y)**2<=radius**2)bits[yy*SIZE+xx]=value;}
    function stroke(bits,a,b,radius,value){const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*2));for(let i=0;i<=count;i++)paint(bits,a.x+(b.x-a.x)*i/count,a.y+(b.y-a.y)*i/count,radius,value);}
    function draw(ctx,code,ink,x,y,rx,ry){
        code=normalize(code);if(!code)return false;const bits=decode(code);
        ctx.save();ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.clip();ctx.fillStyle='#101923';ctx.fillRect(x-rx,y-ry,rx*2,ry*2);ctx.fillStyle=ink;
        for(let i=0;i<bits.length;i++)if(bits[i])ctx.fillRect(x-rx+(i%SIZE)*rx*2/SIZE,y-ry+Math.floor(i/SIZE)*ry*2/SIZE,rx*2/SIZE+.01,ry*2/SIZE+.01);
        ctx.restore();return true;
    }
    const rules={SIZE,LENGTH,normalize,decode,encode,paint,stroke,draw};
    if(typeof module==='object'&&module.exports)module.exports=rules;
    if(typeof window==='undefined')return;window.ProtogenLogo=rules;
    if(typeof document==='undefined')return;
    let modal=null,canvas=null,bits=null,history=[],last=null,drawing=null,eraser=false,focusBefore=null;
    const $=id=>document.getElementById(id);
    function render(){
        const ctx=canvas.getContext('2d'),w=canvas.width;ctx.clearRect(0,0,w,w);ctx.fillStyle='#172633';ctx.fillRect(0,0,w,w);
        ctx.fillStyle=saveState.miscColor||saveState.catColor;ctx.beginPath();ctx.arc(w/2,w/2,w*.49,0,Math.PI*2);ctx.fill();ctx.fillStyle='#101923';ctx.beginPath();ctx.arc(w/2,w/2,w*.46,0,Math.PI*2);ctx.fill();
        draw(ctx,encode(bits),saveState.eyeColor||'#000000',w/2,w/2,w*.45,w*.45);
        $('proto-logo-undo').disabled=!history.length;$('proto-logo-draw').setAttribute('aria-pressed',String(!eraser));$('proto-logo-erase').setAttribute('aria-pressed',String(eraser));
    }
    function remember(){history.push(bits.slice());if(history.length>24)history.shift();}
    function point(event){const r=canvas.getBoundingClientRect();return {x:(event.clientX-r.left)/r.width*SIZE-.5,y:(event.clientY-r.top)/r.height*SIZE-.5};}
    function mark(event){const p=point(event);stroke(bits,last||p,p,Number($('proto-logo-brush').value),eraser?0:1);last=p;render();}
    function close(){if(!modal)return;if(drawing!==null&&canvas.hasPointerCapture(drawing))canvas.releasePointerCapture(drawing);drawing=null;last=null;modal.close();focusBefore?.focus();}
    function init(){
        if(modal)return;modal=document.createElement('dialog');modal.id='protogen-logo-editor';modal.setAttribute('aria-labelledby','proto-logo-title');
        modal.innerHTML='<header><h2 id="proto-logo-title">Draw your protogen sign</h2><button type="button" id="proto-logo-close" aria-label="Close sign editor">×</button></header><p>Draw inside the circle. Your eye color lights the sign on both sides.</p><canvas id="proto-logo-canvas" width="320" height="320" aria-label="Protogen sign drawing pad"></canvas><div class="proto-logo-tools"><button type="button" id="proto-logo-draw" aria-pressed="true">Draw</button><button type="button" id="proto-logo-erase" aria-pressed="false">Erase</button><label>Brush <select id="proto-logo-brush"><option value=".7">Fine</option><option value="1.5" selected>Medium</option><option value="2.5">Wide</option></select></label><button type="button" id="proto-logo-undo">Undo</button><button type="button" id="proto-logo-clear">Clear</button></div><p class="proto-logo-hint">A blank drawing restores the plain eye-colored circle. Save applies your sign; Cancel keeps your previous drawing.</p><footer><button type="button" id="proto-logo-cancel">Cancel</button><button type="button" id="proto-logo-save">Save sign</button></footer>';
        document.body.appendChild(modal);canvas=$('proto-logo-canvas');
        $('proto-logo-close').onclick=$('proto-logo-cancel').onclick=close;
        modal.addEventListener('cancel',e=>{e.preventDefault();close();});
        $('proto-logo-draw').onclick=()=>{eraser=false;render();};$('proto-logo-erase').onclick=()=>{eraser=true;render();};
        $('proto-logo-undo').onclick=()=>{if(history.length){bits=history.pop();render();}};
        $('proto-logo-clear').onclick=()=>{remember();bits.fill(0);render();};
        $('proto-logo-save').onclick=()=>{
            if(saveState.currentMisc!=='protogen_visor'){close();return;}
            window.CharacterStudio?.beforeEdit();saveState.protogenLogo=encode(bits);saveGame();if(typeof player!=='undefined'&&player)updateLocalVisuals();
            window.updateCharacterPreview?.();if(typeof sendUpdate==='function'&&typeof player!=='undefined'&&player)sendUpdate();syncButton();window.CharacterStudio?.refresh();close();
        };
        canvas.addEventListener('pointerdown',e=>{if(e.button!==0||drawing!==null)return;e.preventDefault();e.stopPropagation();drawing=e.pointerId;last=null;remember();canvas.setPointerCapture(e.pointerId);mark(e);});
        canvas.addEventListener('pointermove',e=>{if(drawing!==e.pointerId)return;e.preventDefault();e.stopPropagation();mark(e);});
        const up=e=>{if(drawing!==e.pointerId)return;drawing=null;last=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};
        canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('lostpointercapture',up);
    }
    function syncButton(){const row=$('protogen-logo-row');if(row)row.hidden=saveState.currentMisc!=='protogen_visor';const button=$('protogen-logo-button');if(button)button.textContent=normalize(saveState.protogenLogo)?'Edit sign':'Draw sign';}
    rules.syncButton=syncButton;
    rules.open=()=>{if(saveState.currentMisc!=='protogen_visor')return;init();window.MobileUI?.stop();document.exitPointerLock?.();bits=decode(saveState.protogenLogo);history=[];last=null;eraser=false;focusBefore=document.activeElement;render();modal.showModal();$('proto-logo-draw').focus();};
})();
