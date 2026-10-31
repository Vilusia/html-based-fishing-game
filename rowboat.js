// Personal Rowboat tool, shared by gameplay and the Misc shop preview.
(function(){
    const STROKE_SECONDS=1.1;
    function build(){
        const boat=new THREE.Group();boat.name='sailBoat';boat.userData.isSailBoat=true;
        const wood=new THREE.MeshStandardMaterial({color:'#a27149',roughness:.88,flatShading:true}),trim=new THREE.MeshStandardMaterial({color:'#d2a874',roughness:.85}),dark=new THREE.MeshStandardMaterial({color:'#654b37',roughness:1}),brass=new THREE.MeshStandardMaterial({color:'#bfa46d',roughness:.6});
        function box(parent,name,w,h,d,x,y,z,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.name=name;m.position.set(x,y,z);parent.add(m);return m;}
        const stations=[[-1.55,.25],[-1.2,.74],[-.5,.96],[.5,.96],[1.15,.69],[1.65,.035]],verts=[];
        function quad(a,b,c,d){verts.push(...a,...b,...d,...b,...c,...d);}
        for(const side of [-1,1])for(let i=0;i<stations.length-1;i++){
            const [z,w]=stations[i],[nz,nw]=stations[i+1];
            const a=[side*w*.72,.04,z],b=[side*w,.59,z],c=[side*nw,.59,nz],d=[side*nw*.72,.04,nz];
            // Outer and inner walls, joined by the gunwale; the top stays open.
            quad(a,b,c,d);quad([side*(w-.065),.56,z],[side*w*.66,.14,z],[side*nw*.66,.14,nz],[side*Math.max(.01,nw-.065),.56,nz]);
            quad(b,[side*Math.max(.01,w-.065),.56,z],[side*Math.max(.01,nw-.065),.56,nz],c);
            if(side===1)quad([-w*.72,.04,z],[w*.72,.04,z],[nw*.72,.04,nz],[-nw*.72,.04,nz]);
            for(const y of [.24,.43,.6]){
                const taper=.72+.28*Math.min(1,(y-.04)/.55),beam=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,Math.hypot(nz-z,(nw-w)*taper),6),trim);beam.position.set(side*(w+nw)*taper/2,y,(z+nz)/2);beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(side*(nw-w)*taper,0,nz-z).normalize());boat.add(beam);
            }
        }
        const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.computeVertexNormals();
        const shell=new THREE.Mesh(geo,wood);shell.material.side=THREE.DoubleSide;shell.name='hollowHull';boat.add(shell);
        box(boat,'stern',.52,.5,.08,0,.31,-1.55,wood);
        for(let i=-2;i<=2;i++)box(boat,'floorPlank',.21,.07,1.9,i*.21,.15,-.05,i%2?wood:trim);
        for(const z of [-.75,.65])box(boat,'bench',1.5,.1,.25,0,.48,z,trim);
        box(boat,'keel',.11,.1,2.5,0,.005,0,dark);
        const oars=[];
        for(const side of [-1,1]){
            const pivot=new THREE.Group();pivot.name=side<0?'leftOar':'rightOar';pivot.position.set(side*.94,.6,0);boat.add(pivot);
            box(pivot,'oarShaft',1.65,.055,.055,side*.33,0,0,trim);
            const blade=box(pivot,'oarBlade',.52,.045,.2,side*1.24,-.015,0,wood);blade.rotation.y=side*.06;
            box(pivot,'oarGrip',.2,.075,.075,-side*.43,0,0,dark);
            const lock=new THREE.Mesh(new THREE.TorusGeometry(.07,.018,4,8),brass);lock.position.copy(pivot.position);lock.rotation.y=Math.PI/2;boat.add(lock);
            pivot.userData.side=side;oars.push(pivot);
        }
        // Batch the fixed trim and planks; oars keep their independent pivots.
        const batches=new Map();
        for(const part of [...boat.children]){
            if(!part.isMesh||part===shell)continue;
            part.updateMatrix();const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();geometry.applyMatrix4(part.matrix);
            if(!batches.has(part.material))batches.set(part.material,{position:[],normal:[]});const batch=batches.get(part.material);
            batch.position.push(...geometry.attributes.position.array);batch.normal.push(...geometry.attributes.normal.array);
            geometry.dispose();part.geometry.dispose();boat.remove(part);
        }
        for(const [material,batch] of batches){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.position,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(batch.normal,3));boat.add(new THREE.Mesh(geometry,material));}
        boat.userData.rowing={oars,phase:0,weight:0,moving:false};
        boat.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});
        return boat;
    }
    function animate(boat,moving,dt){
        const row=boat?.userData.rowing;if(!row)return false;
        dt=Math.min(.1,Math.max(0,Number(dt)||0));
        const starting=moving&&!row.moving,previous=row.phase;
        if(starting)row.phase=Math.PI;
        if(moving)row.phase+=dt*Math.PI*2/STROKE_SECONDS;
        row.weight+=(Number(!!moving)-row.weight)*Math.min(1,dt*9);
        if(!moving&&row.weight<.001){row.weight=0;row.phase=0;}
        const pull=Math.sin(row.phase),lift=Math.cos(row.phase);
        for(const oar of row.oars){const side=oar.userData.side;oar.rotation.y=side*pull*.55*row.weight;oar.rotation.z=side*(-.3+lift*.4)*row.weight;}
        boat.rotation.z=Math.sin(row.phase)*.018*row.weight;boat.rotation.x=Math.cos(row.phase*2)*.008*row.weight;
        row.moving=!!moving;
        return !!moving&&(starting||Math.floor((row.phase-Math.PI)/(Math.PI*2))>Math.floor((previous-Math.PI)/(Math.PI*2)));
    }
    let image=null;
    function thumbnail(){
        if(image)return image;
        let renderer,boat;
        try{
            renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setSize(280,170);renderer.outputEncoding=THREE.sRGBEncoding;
            const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#e4efff','#655039',.8));const light=new THREE.DirectionalLight('#fff0d6',.9);light.position.set(-3,5,4);scene.add(light);
            boat=build();scene.add(boat);const camera=new THREE.PerspectiveCamera(35,280/170,.1,30);camera.position.set(4,4,5);camera.lookAt(0,.2,0);renderer.render(scene,camera);image=renderer.domElement.toDataURL();
        }catch(error){console.warn('Rowboat preview unavailable:',error);}
        finally{if(boat){const mats=new Set();boat.traverse(m=>{m.geometry?.dispose();if(m.material)mats.add(m.material);});mats.forEach(m=>m.dispose());}if(renderer){renderer.dispose();renderer.forceContextLoss();}}
        return image;
    }
    window.Rowboat3D={build,animate,thumbnail,STROKE_SECONDS};
})();
