// Shop-only character viewer. Render on changes and dragging, with no background loop.
(function(){
    let view=null,failed=false,paintMode=false,paintHandlers=null,painting=false;
    function destroy(){
        paintMode=false;painting=false;paintHandlers=null;
        if(!view)return;
        const v=view;view=null;
        v.observer?.disconnect();
        if(v.model){v.scene.remove(v.model);v.disposeBody(v.model);}
        v.renderer.dispose();v.renderer.forceContextLoss();v.host.replaceChildren();
    }
    function update(cfg,buildBody,disposeBody){
        const host=document.getElementById('preview-3d');
        if(!host||failed)return false;
        try{
            if(!view){
                const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
                renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor(0,0);
                const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.01,100);
                view={host,renderer,scene,camera,model:null,signature:null,yaw:.35,pitch:0,drag:null,disposeBody};
                const v=view,canvas=renderer.domElement;canvas.setAttribute('aria-label','3D outfit preview. Drag to rotate, or use arrow keys.');canvas.tabIndex=0;host.replaceChildren(canvas);
                v.render=()=>{
                    if(view!==v||!v.model)return;
                    const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);
                    renderer.setSize(width,height,false);camera.aspect=width/height;
                    const fov=camera.fov*Math.PI/180,half=Math.min(fov/2,Math.atan(Math.tan(fov/2)*camera.aspect));
                    const focus=v.focus==='face'?v.radius*.32:0;
                    camera.position.set(0,focus,v.radius/Math.sin(half)*1.12*(v.zoom||1));camera.lookAt(0,focus,0);camera.updateProjectionMatrix();
                    v.model.rotation.set(v.pitch,v.yaw,0);renderer.render(scene,camera);
                };
                canvas.addEventListener('pointerdown',event=>{
                    if(event.button!==0)return;event.preventDefault();event.stopPropagation();
                    if(paintMode&&paintHandlers?.down&&paintHandlers.down(event)!==false){
                        painting=true;canvas.setPointerCapture(event.pointerId);canvas.classList.add('painting');return;
                    }
                    v.drag={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');canvas.focus();
                });
                canvas.addEventListener('pointermove',event=>{
                    if(painting){if(paintHandlers?.move)paintHandlers.move(event);return;}
                    if(!v.drag||v.drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();
                    v.yaw+=(event.clientX-v.drag.x)*.012;v.pitch=THREE.MathUtils.clamp(v.pitch+(event.clientY-v.drag.y)*.008,-.55,.55);
                    v.drag.x=event.clientX;v.drag.y=event.clientY;v.render();
                });
                const release=event=>{
                    if(painting){painting=false;canvas.classList.remove('painting');if(paintHandlers?.up)paintHandlers.up();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);return;}
                    if(v.drag?.id!==event.pointerId)return;v.drag=null;canvas.classList.remove('dragging');if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);event.stopPropagation();
                };
                canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
                canvas.addEventListener('click',event=>event.stopPropagation());
                canvas.addEventListener('keydown',event=>{
                    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
                    event.preventDefault();event.stopPropagation();
                    v.yaw+=event.key==='ArrowLeft'?-.15:event.key==='ArrowRight'?.15:0;
                    v.pitch=THREE.MathUtils.clamp(v.pitch+(event.key==='ArrowUp'?-.1:event.key==='ArrowDown'?.1:0),-.55,.55);v.render();
                });
                if(typeof ResizeObserver!=='undefined'){v.observer=new ResizeObserver(v.render);v.observer.observe(host);}
            }
            const v=view,signature=JSON.stringify(cfg);
            if(v.signature!==signature){
                if(v.model){v.scene.remove(v.model);v.disposeBody(v.model);v.model=null;}
                const body=buildBody(cfg);body.position.set(0,0,0);
                const bounds=new THREE.Box3().setFromObject(body),center=bounds.getCenter(new THREE.Vector3());
                body.position.sub(center);
                const model=new THREE.Group();model.add(body);v.model=model;v.scene.add(model);
                v.radius=Math.max(.5,bounds.getSize(new THREE.Vector3()).length()/2);v.signature=signature;
            }
            v.render();return true;
        }catch(error){destroy();failed=true;console.warn('3D outfit preview unavailable; using sprite preview.',error);return false;}
    }
    function hitTest(clientX,clientY){
        if(!view?.model)return null;
        const v=view,canvas=v.renderer.domElement,rect=canvas.getBoundingClientRect();
        if(clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return null;
        const pointer=new THREE.Vector2(((clientX-rect.left)/rect.width)*2-1,-((clientY-rect.top)/rect.height)*2+1);
        const ray=new THREE.Raycaster();ray.setFromCamera(pointer,v.camera);
        let body=null;v.model.traverse(object=>{if(object.userData?.modelSources)body=object;});
        if(!body)return null;
        body.updateMatrixWorld(true);
        const sourceRoot=body.userData.modelSources;
        sourceRoot.matrix.copy(body.matrixWorld);sourceRoot.matrixAutoUpdate=false;
        sourceRoot.matrixWorld.copy(body.matrixWorld);sourceRoot.updateMatrixWorld(true);
        const sources=[];sourceRoot.traverse(object=>{if(['torso','head','protogenScreen','arm','leg','paw','foot'].includes(object.name)&&object.geometry)sources.push(object);});
        const hits=ray.intersectObjects(sources,false);
        for(const hit of hits){
            const name=hit.object?.name;
            // Hands and feet block the limb behind them but are not paint targets.
            if(name==='paw'||name==='foot')return null;
            if(!hit.uv)continue;
            if(name==='arm'||name==='leg'){
                const side=name==='arm'?'arm':'leg';
                return {side:side+(hit.object.position.x<0?'Left':'Right'),uv:{x:hit.uv.x,y:hit.uv.y}};
            }
            const materialIndex=hit.face?.materialIndex;
            if(name==='head'||name==='protogenScreen'){
                const front=materialIndex===4,back=materialIndex===5;
                if(name==='protogenScreen'&&!front&&!back)return null;
                const side=materialIndex===0?'headRight':materialIndex===1?'headLeft':materialIndex===2?'headTop':materialIndex===3?'headBottom':back?'headBack':front?'headFront':null;
                if(!side)return null;
                return {side,uv:{x:hit.uv.x,y:hit.uv.y}};
            }
            if(name!=='torso')return null;
            const side=materialIndex===0?'right':materialIndex===1?'left':materialIndex===5?'back':materialIndex===4?'front':(hit.face?.normal?.z<0?'back':'front');
            return {side,uv:{x:hit.uv.x,y:hit.uv.y}};
        }
        return null;
    }
    function setPaintMode(active,handlers){
        paintMode=!!active;paintHandlers=handlers||null;
        if(!paintMode)painting=false;
        if(view?.renderer?.domElement)view.renderer.domElement.classList.toggle('studio-paint-canvas',paintMode);
    }
    function setView(name){
        if(!view)return false;const v=view;
        if(name==='in'||name==='out')v.zoom=THREE.MathUtils.clamp((v.zoom||1)+(name==='in'?-.12:.12),.45,1.6);
        else if(name==='face'){v.focus='face';v.zoom=.75;v.pitch=0;v.yaw=.25;}
        else{v.focus='full';v.zoom=name==='back'?.9:1;v.pitch=0;v.yaw=({front:0,left:Math.PI/2,right:-Math.PI/2,back:Math.PI,full:.35})[name]??.35;}
        v.render();return true;
    }
    window.ShopCharacterPreview={update,destroy,setView,hitTest,setPaintMode};
})();
