// Static character cards share one offscreen renderer, not a context per choice.
(function(){
    if(typeof window==='undefined'||typeof THREE==='undefined')return;
    const cache=new Map(),LIMIT=192;
    let renderer=null,queue=[],scheduled=false,failed=false,generation=0;
    function cancel(scope){
        if(scope){queue=queue.filter(job=>job.scope!==scope);if(!queue.length)scheduled=false;return;}
        generation++;queue=[];scheduled=false;
    }
    function dispose(){cancel();if(renderer){renderer.dispose();renderer.forceContextLoss();renderer=null;}cache.clear();failed=false;}
    function copy(image,canvas){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;ctx.drawImage(image,0,0,canvas.width,canvas.height);canvas.classList?.remove('studio-thumbnail-loading');canvas.classList?.add('studio-thumbnail-3d');}
    function fallback(job){job.canvas.classList?.remove('studio-thumbnail-loading');job.canvas.title='3D preview unavailable';if(job.fallback)job.fallback();}
    function render(job){
        if(cache.has(job.key)){const image=cache.get(job.key);cache.delete(job.key);cache.set(job.key,image);copy(image,job.canvas);return;}
        if(failed){fallback(job);return;}
        let body=null;
        const scene=new THREE.Scene();
        const width=Math.max(1,Math.round(job.width||128)),height=Math.max(1,Math.round(job.height||128));
        try{
            if(!renderer){renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.setClearColor(0,0);}
            renderer.setSize(width,height,false);
            body=job.build(job.cfg);scene.add(body);body.updateMatrixWorld(true);
            const bounds=new THREE.Box3().setFromObject(body);
            if(bounds.isEmpty())throw Error('Empty character preview');
            if(job.focus==='head')bounds.min.y=bounds.max.y-(bounds.max.y-bounds.min.y)*.48;
            const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
            const halfV=35*Math.PI/360,halfH=Math.atan(Math.tan(halfV)*width/height);
            const distance=Math.max(.1,Math.max((size.y/2)/Math.tan(halfV),(Math.max(size.x,size.z)/2)/Math.tan(halfH))*1.15);
            const camera=new THREE.PerspectiveCamera(35,width/height,.01,Math.max(100,distance*4));
            const direction=new THREE.Vector3(job.focus==='back'?-.55:job.focus==='head'?.65:.4,.10,job.focus==='back'?-1:1).normalize();
            camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);camera.updateProjectionMatrix();
            scene.add(new THREE.AmbientLight(0xffffff,.9));const light=new THREE.DirectionalLight(0xffffff,.55);light.position.set(2,4,5);scene.add(light);
            renderer.render(scene,camera);
            const image=document.createElement('canvas');image.width=width;image.height=height;image.getContext('2d').drawImage(renderer.domElement,0,0);
            cache.set(job.key,image);while(cache.size>LIMIT)cache.delete(cache.keys().next().value);copy(image,job.canvas);
        }catch(error){failed=true;fallback(job);}
        finally{if(body){scene.remove(body);job.dispose(body);}}
    }
    function tick(){
        scheduled=false;
        // One model per animation frame keeps large categories responsive.
        const job=queue.shift();if(job&&job.generation===generation&&job.canvas.isConnected)render(job);
        if(queue.length){scheduled=true;requestAnimationFrame(tick);}
    }
    function request(job){
        job={...job,cfg:{...job.cfg},width:job.width||128,height:job.height||128,scope:job.scope||'studio',generation};
        job.key=JSON.stringify([job.focus,job.width,job.height,job.cfg]);
        if(cache.has(job.key)){copy(cache.get(job.key),job.canvas);return;}
        job.canvas.classList?.add('studio-thumbnail-loading');
        queue.push(job);if(!scheduled){scheduled=true;requestAnimationFrame(tick);}
    }
    window.CharacterThumbnails={request,cancel,dispose};
})();
