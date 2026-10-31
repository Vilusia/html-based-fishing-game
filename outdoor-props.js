// Outdoor decoration catalog. House furniture uses its own catalog and models.
const OUTDOOR_PROPS = Object.freeze([
    ['campfire','Campfire',350,'campfire'],['tent','Tent',1800,'tent'],
    ['blanket','Picnic Mat',200,'blanket'],['chair','Chair',300,'chair'],
    ['couch','Couch',1100,'couch'],['table','Picnic Table',700,'table'],
    ['cooler','Cooler',250,'cooler'],['basket','Basket',200,'basket'],
    ['radio','Radio',650,'radio'],['lantern','Lantern',300,'lantern'],
    ['umbrella','Beach Umbrella',550,'umbrella'],['grill','BBQ Grill',950,'grill'],
    ['hammock','Hammock',1200,'hammock'],['logbench','Log Bench',400,'logbench'],
    ['fishsign','Fishing Sign',250,'fishsign'],['crate','Dock Crate',150,'crate'],
    ['buoy','Buoy',300,'buoy'],['anchor','Anchor',600,'anchor'],
    ['flowerpot','Flower Pot',250,'flowerpot'],['torch','Tiki Torch',300,'torch'],
    ['boat','Decorative Rowboat',1600,'boat'],['tireswing','Tire Swing',950,'tireswing'],
    ['hotspring','Hot Spring',2500,'hotspring'],['windchime','Wind Chime',450,'windchime'],
    ['surfboard','Surfboard',650,'surfboard'],['screen','Stream Player',3000,'screen'],
    ['bush','Leafy Bush',150,'tree']
].map(([id,name,price,icon])=>Object.freeze({id,name,price,icon})));

function outdoorPropDefinition(id){return OUTDOOR_PROPS.find(item=>item.id===id);}
function normalizePropUnlocks(value){return Array.isArray(value)?[...new Set(value.filter(id=>!!outdoorPropDefinition(id)))]:[];}
function ownsOutdoorProp(id){return id==='house'||!!outdoorPropDefinition(id)&&Array.isArray(saveState.unlockedProps)&&saveState.unlockedProps.includes(id);}
function buyOutdoorProp(id){
    const item=outdoorPropDefinition(id);if(!item)return false;
    if(ownsOutdoorProp(id))return true;
    if(!Number.isFinite(saveState.money)||saveState.money<item.price){showToast('Not enough money to unlock '+item.name+'.');return false;}
    saveState.money-=item.price;
    saveState.unlockedProps=normalizePropUnlocks(saveState.unlockedProps);saveState.unlockedProps.push(id);
    saveGame();showToast(item.name+' unlocked! Place it as often as you like.');return true;
}

// All positions and dimensions are local; multiplayer applies the shared transform.
function buildOutdoorProp(type){
    if(!outdoorPropDefinition(type))return null;
    const g=new THREE.Group(),materials=new Map();let flameIndex=0;g.name='outdoor-'+type;
    const C={wood:'#96623f',edge:'#c6935e',dark:'#533c30',metal:'#354454',brass:'#d6ac63',cloth:'#427b86',light:'#eadfc3',ink:'#192632',leaf:'#43764b'};
    function mat(color){if(!materials.has(color)){const glow=['#f29438','#ffd773','#ffd684'].includes(color);materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.88,flatShading:true,emissive:glow?color:'#000000',emissiveIntensity:glow?.65:0}));}return materials.get(color);}
    function mesh(geo,color,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat(C[color]||color));m.position.set(x,y,z);g.add(m);return m;}
    const box=(x,y,z,w,h,d,c)=>mesh(new THREE.BoxGeometry(w,h,d),c,x,y,z);
    const cyl=(x,y,z,r,h,c,rt=r)=>mesh(new THREE.CylinderGeometry(rt,r,h,8),c,x,y,z);
    function ball(x,y,z,r,c,sx=1,sy=1,sz=1){const m=mesh(new THREE.IcosahedronGeometry(r,0),c,x,y,z);m.scale.set(sx,sy,sz);return m;}
    function bar(a,b,r,c){const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),m=cyl(0,0,0,r,from.distanceTo(to),c);m.position.copy(from).add(to).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());return m;}
    function ring(x,y,z,r,t,c,horizontal=false){const m=mesh(new THREE.TorusGeometry(r,t,4,12),c,x,y,z);if(horizontal)m.rotation.x=Math.PI/2;return m;}
    function panel(vertices,color){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));geo.computeVertexNormals();const m=mesh(geo,color);m.material=mat(C[color]||color).clone();m.material.side=THREE.DoubleSide;return m;}
    function feet(xs,zs,height,color='dark'){for(const x of xs)for(const z of zs)box(x,height/2,z,.13,height,.13,color);}
    function flame(x,y,z,r,h){
        const phase=flameIndex++*2.4,base=y-h/2;
        const outer=mesh(new THREE.ConeGeometry(r,h,5),'#f29438',x,y,z),inner=mesh(new THREE.ConeGeometry(r*.5,h*.7,5),'#ffd773',x,base+h*.35,z+.015);
        for(const m of [outer,inner])m.userData.fire={x,y:base,z,h,r,phase};
        return outer;
    }
    function lamp(y,r=.18){
        cyl(0,y-.25,0,r*1.2,.1,'metal');cyl(0,y+.25,0,r*1.3,.12,'metal',r*.6);
        const glass=cyl(0,y,0,r*.75,.4,'#ffd684');glass.material=glass.material.clone();glass.material.transparent=true;glass.material.opacity=.28;glass.material.depthWrite=false;
        flame(0,y-.025,0,r*.38,.23);
        for(const x of [-r,r])bar([x,y-.2,0],[x,y+.2,0],.025,'brass');ring(0,y+.42,0,r*.65,.025,'brass');
    }
    switch(type){
    case 'campfire':
        for(let i=0;i<9;i++){const a=i*Math.PI*2/9;ball(Math.cos(a)*.78,.15,Math.sin(a)*.78,.22,i%2?'#6f7479':'#92958b',1,.7,1);}
        for(const z of [-.2,.2])bar([-.6,.23,z],[.6,.23,-z],.13,'dark');
        for(const [x,z,h] of [[0,0,.9],[-.22,.1,.55],[.2,.08,.65]])flame(x,.3+h/2,z,.22,h);
        break;
    case 'tent': {
        // Open-front canvas shelter with stitched trim and paired bedrolls.
        const w=3,h=3.5,d=3.5;
        panel([[-w,0,-d],[0,h,-d],[-w,0,d],[0,h,-d],[0,h,d],[-w,0,d]],'cloth');
        panel([[w,0,d],[0,h,d],[w,0,-d],[0,h,d],[0,h,-d],[w,0,-d]],'#315c68');
        panel([[-w,0,-d],[w,0,-d],[0,h,-d]],'#345663');
        box(0,.045,0,5.8,.09,6.9,'dark');
        for(const z of [-d,d])for(const side of [-1,1])bar([side*w,.04,z],[0,h,z],.055,'light');
        bar([0,h,-d-.15],[0,h,d+.15],.065,'wood');
        for(const side of [-1,1]){bar([side*w,1,d-.3],[side*(w+.8),.08,d+.6],.025,'light');box(side*(w+.8),.1,d+.6,.09,.2,.09,'brass');box(side*1.1,.18,-.2,1.7,.28,4.8,'#ac654f');box(side*1.1,.38,-2.1,1.4,.2,.65,'light');}
        break;}
    case 'blanket':
        box(0,.025,0,4,.05,4,'light');
        for(let x=0;x<8;x++)for(let z=0;z<8;z++)if((x+z)%2===0)box(-1.75+x*.5,.055,-1.75+z*.5,.49,.015,.49,'#b56657');
        for(const side of [-1,1])for(let i=0;i<12;i++)box(-1.85+i*.335,.025,side*2.07,.035,.035,.16,'light');
        break;
    case 'chair':
        feet([-.42,.42],[-.42,.42],.84);
        for(let i=0;i<5;i++)box(-.44+i*.22,.84,0,.19,.1,1.12,'wood');
        for(const side of [-1,1]){box(side*.49,1.13,-.49,.12,1.3,.12,'wood');box(side*.57,1.08,0,.12,.1,1.12,'edge');}
        for(let i=0;i<3;i++)box(0,1.14+i*.23,-.5,1.04,.17,.1,i%2?'edge':'wood');
        g.userData.standTop=.89;g.userData.standHalf=.56;break;
    case 'couch':
        feet([-.96,.96],[-.35,.35],.38);box(0,.5,0,2.5,.35,1.05,'wood');box(0,.98,-.42,2.5,.92,.2,'cloth');
        for(const side of [-1,1])box(side*1.25,.82,0,.2,.7,1.18,'wood');
        for(let i=-1;i<=1;i++){box(i*.75,.77,.04,.7,.22,.91,'#79a0a0');box(i*.75,1.16,-.25,.7,.49,.16,'#79a0a0');}
        box(-.85,1.05,.1,.36,.36,.2,'brass').rotation.z=.25;
        g.userData.standTop=.88;g.userData.standHalf=1.3;g.userData.standHalfX=1.35;g.userData.standHalfZ=.6;break;
    case 'table':
        for(const x of [-.92,.92]){bar([x,0,-.65],[x,.95,.3],.09,'dark');bar([x,0,.65],[x,.95,-.3],.09,'dark');bar([x,.42,-1],[x,.42,1],.075,'wood');}
        for(let i=0;i<5;i++)box(0,.96,-.6+i*.3,2.65,.12,.27,'wood');
        for(const z of [-.94,.94])for(const offset of [-.12,.12])box(0,.53,z+offset,2.65,.12,.22,'edge');break;
    case 'cooler':
        box(0,.37,0,1.05,.64,.65,'cloth');box(0,.73,0,1.12,.14,.71,'light');
        for(const x of [-.43,.43]){box(x,.36,.34,.1,.55,.025,'edge');box(x,.69,.37,.09,.18,.06,'metal');}
        for(const side of [-1,1])bar([side*.59,.3,-.17],[side*.59,.3,.17],.035,'metal');box(0,.4,.34,.28,.16,.02,'light');break;
    case 'basket':
        box(0,.26,0,.78,.5,.58,'edge');
        for(let i=0;i<5;i++)for(const side of [-1,1])box(0,.07+i*.1,side*.3,.82,.025,.025,'dark');
        for(let i=0;i<7;i++)for(const side of [-1,1])box(-.35+i*.117,.27,side*.31,.025,.5,.02,'wood');
        ring(0,.54,0,.3,.045,'wood');box(0,.53,0,.8,.08,.6,'wood');box(.14,.6,0,.28,.08,.3,'light');break;
    case 'radio':
        box(0,.3,0,.95,.58,.32,'wood');box(0,.3,.18,.85,.47,.045,'metal');
        for(const x of [-.25,.25]){const disk=cyl(x,.27,.215,.16,.04,'ink');disk.rotation.x=Math.PI/2;ring(x,.27,.24,.12,.018,'brass');}
        box(0,.48,.215,.28,.09,.025,'#83b4ac');bar([-.35,.59,0],[-.46,1.17,0],.012,'light');
        bar([-.25,.64,0],[.25,.64,0],.025,'metal');break;
    case 'lantern':lamp(.37);break;
    case 'umbrella':
        cyl(0,1.28,0,.055,2.56,'wood');cyl(0,.045,0,.4,.09,'metal');
        for(let i=0;i<10;i++){const a=i*Math.PI/5,b=(i+1)*Math.PI/5;panel([[0,2.85,0],[Math.cos(a)*1.6,2.24,Math.sin(a)*1.6],[Math.cos(b)*1.6,2.24,Math.sin(b)*1.6]],i%2?'light':'cloth');bar([0,2.8,0],[Math.cos(a)*1.6,2.24,Math.sin(a)*1.6],.016,'brass');}
        ball(0,2.88,0,.09,'brass');break;
    case 'grill':
        feet([-.46,.46],[-.32,.32],.85,'metal');box(0,.8,0,1.2,.38,.8,'metal');box(0,.99,0,1.1,.04,.7,'ink');
        for(let i=0;i<9;i++)bar([-.5+i*.125,1.02,-.35],[-.5+i*.125,1.02,.35],.015,'light');
        for(const x of [-.32,0,.32]){ball(x,.96,0,.1,'#f29438',1,.5,1);flame(x,1.065,0,.055,.15);}
        for(const x of [-.46,.46]){const wheel=cyl(x,.18,-.34,.18,.08,'ink');wheel.rotation.z=Math.PI/2;}
        box(.85,.86,0,.47,.08,.75,'wood');bar([-.4,1.12,-.39],[.4,1.12,-.39],.04,'brass');break;
    case 'hammock':
        for(const side of [-1,1]){bar([side*1.8,.04,0],[side*2,2,0],.11,'wood');bar([side*2,.1,-.7],[side*2,.1,.7],.075,'dark');bar([side*2,1.85,0],[side*1.55,1.4,0],.035,'light');}
        for(let i=0;i<10;i++){const x=-1.6+i*.32,next=x+.32,y=.76+.25*x*x,ny=.76+.25*next*next;panel([[x,y,-.55],[next,ny,-.55],[x,y,.55],[next,ny,-.55],[next,ny,.55],[x,y,.55]],i%2?'cloth':'light');}
        break;
    case 'logbench':
        for(const x of [-.9,.9])cyl(x,.24,0,.24,.48,'dark');
        bar([-1.3,.52,0],[1.3,.52,0],.3,'wood');
        for(const x of [-1.305,1.305]){const end=cyl(x,.52,0,.255,.012,'edge');end.rotation.z=Math.PI/2;const r=ring(x,.52,0,.16,.015,'dark');r.rotation.y=Math.PI/2;}break;
    case 'fishsign':
        box(0,.9,0,.16,1.8,.16,'dark');box(0,1.53,.08,1.45,.77,.14,'wood');
        for(const y of [1.25,1.81])box(0,y,.16,1.48,.07,.04,'edge');
        ball(.05,1.55,.19,.23,'cloth',1.6,.75,.16);panel([[-.18,1.55,.21],[-.48,1.77,.21],[-.48,1.33,.21]],'cloth');ball(.24,1.6,.23,.025,'light');break;
    case 'crate':
        box(0,.42,0,1,.84,.86,'dark');for(let i=0;i<5;i++){for(const z of [-.44,.44])box(-.4+i*.2,.43,z,.18,.76,.05,'wood');box(-.4+i*.2,.86,0,.18,.06,.9,'edge');}
        for(const z of [-.48,.48]){for(const y of [.14,.72])box(0,y,z,1.08,.1,.07,'edge');bar([-.43,.18,z],[.43,.68,z],.045,'edge');}break;
    case 'buoy':
        cyl(0,.23,0,.48,.42,'#bc6654',.34);cyl(0,.52,0,.34,.2,'light',.27);cyl(0,.83,0,.27,.42,'#bc6654',.12);ring(0,1.13,0,.13,.035,'brass');ring(0,.14,0,.47,.045,'dark',true);break;
    case 'anchor':
        bar([0,.16,0],[0,1.65,0],.075,'metal');bar([-.55,1.22,0],[.55,1.22,0],.06,'wood');ring(0,1.78,0,.16,.045,'metal');
        for(const side of [-1,1]){bar([0,.17,0],[side*.53,.39,0],.075,'metal');panel([[side*.43,.27,.04],[side*.63,.69,.04],[side*.28,.48,.04]],'metal');}break;
    case 'flowerpot':
        cyl(0,.25,0,.23,.5,'#ae6952',.34);cyl(0,.49,0,.36,.12,'#cf8f68');cyl(0,.56,0,.3,.025,'dark');
        for(let i=0;i<5;i++){const x=Math.cos(i*2.4)*.19,z=Math.sin(i*2.4)*.19,y=.9+(i%3)*.12;bar([x,.55,z],[x,y,z],.018,'leaf');ball(x,y,z,.1,i%2?'#e2b55c':'#d18ba0');ball(x,y+.055,z,.04,'brass');}break;
    case 'torch':
        cyl(0,1,0,.065,2,'edge');for(const y of [.4,.8,1.2,1.6])cyl(0,y,0,.08,.055,'dark');cyl(0,2,0,.11,.32,'dark',.2);ring(0,2.12,0,.2,.025,'brass',true);flame(0,2.38,0,.17,.5);break;
    case 'boat':
        // Open hull built as tapered plank sections, with pointed bow.
        for(let i=0;i<8;i++){const z=-1.35+i*.36,width=.54*(1-Math.pow(Math.abs(z)/1.65,3));box(0,.12,z,width*2,.12,.34,'wood');for(const side of [-1,1]){const plank=box(side*width,.34,z,.09,.4,.37,'edge');plank.rotation.z=-side*.16;}}
        box(0,.32,-1.52,.75,.38,.08,'wood');for(const z of [-.65,.45])box(0,.44,z,.97,.08,.25,'dark');
        for(const side of [-1,1]){bar([side*.23,.55,-1],[side*.85,.55,1],.03,'wood');box(side*.84,.55,.99,.23,.055,.5,'edge').rotation.y=side*.3;}break;
    case 'tireswing':
        for(const side of [-1,1])for(const z of [-.8,.8])bar([side*1.4,0,z],[side*1.15,3.25,0],.11,'wood');bar([-1.4,3.25,0],[1.4,3.25,0],.12,'edge');
        ring(0,1.1,0,.43,.16,'ink');for(const x of [-.3,.3])bar([x,1.48,0],[x,3.2,0],.025,'brass');
        for(let i=0;i<12;i++){const a=i*Math.PI/6;box(Math.cos(a)*.46,1.1+Math.sin(a)*.46,.12,.09,.08,.06,'metal').rotation.z=a;}break;
    case 'hotspring':
        cyl(0,.11,0,1.18,.2,'#65a6ad');for(let i=0;i<12;i++){const a=i*Math.PI/6;ball(Math.cos(a)*1.4,.23,Math.sin(a)*1.4,.34,i%2?'#727f82':'#929d94',1,.75,1);}
        for(const r of [.45,.85])ring(0,.216,0,r,.013,'#a1d5cf',true);box(0,.12,1.68,.8,.24,.45,'wood');break;
    case 'windchime':
        cyl(0,1.1,-.25,.07,2.2,'wood');bar([0,2.2,-.25],[0,2.2,.35],.045,'wood');bar([0,2.2,.3],[0,1.91,.3],.015,'light');
        cyl(0,1.9,.3,.31,.07,'wood');for(let i=0;i<5;i++){const a=i*Math.PI*2/5,x=Math.cos(a)*.22,z=.3+Math.sin(a)*.22,h=.45+i*.07;bar([x,1.87,z],[x,1.59,z],.009,'light');cyl(x,1.59-h/2,z,.035,h,'brass');}bar([0,1.85,.3],[0,.75,.3],.01,'light');ball(0,.75,.3,.12,'cloth');break;
    case 'surfboard':{
        const board=new THREE.Group();g.add(board);board.position.set(0,1.05,0);board.rotation.x=-.24;
        // A pointed, rounded silhouette instead of the old rectangular slab.
        const shape=new THREE.Shape();shape.moveTo(0,1.15);shape.bezierCurveTo(.55,.7,.42,-.8,.18,-1.05);shape.lineTo(-.18,-1.05);shape.bezierCurveTo(-.42,-.8,-.55,.7,0,1.15);
        const m=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.065,bevelEnabled:false,curveSegments:5}),mat(C.cloth));board.add(m);
        for(const x of [-.07,.07]){const stripe=new THREE.Mesh(new THREE.BoxGeometry(.04,1.9,.01),mat(C.light));stripe.position.set(x,0,.075);board.add(stripe);}
        bar([-.3,0,-.35],[.3,0,-.35],.06,'wood');bar([0,.05,-.35],[0,1.1,-.3],.045,'wood');break;}
    case 'screen':{
        // Keep the video aperture exactly aligned with CSS3D screen playback.
        const y=3.55,w=6.3,h=3.545;
        box(0,y,-.08,w+.44,h+.44,.32,'metal');box(0,y,.05,w+.12,h+.12,.17,'ink');
        const face=mesh(new THREE.PlaneGeometry(w,h),'#050608',0,y,.14);face.material=new THREE.MeshBasicMaterial({color:'#050608'});
        for(const x of [-1.6,1.6]){box(x,.95,-.12,.2,1.9,.26,'metal');box(x,.08,0,.85,.16,1.05,'dark');}
        box(0,.45,-.12,3.4,.12,.15,'brass');
        for(const side of [-1,1]){const x=side*3.7;box(x,1.18,0,.7,2.36,.62,'wood');box(x,1.18,.33,.6,2.14,.05,'ink');for(const y of [.65,1.6]){const speaker=cyl(x,y,.38,.22,.05,'metal');speaker.rotation.x=Math.PI/2;ring(x,y,.42,.17,.025,'brass');}}
        box(0,y-h/2-.14,.19,w+.25,.05,.035,'cloth');break;}
    case 'bush':
        for(const x of [-.28,.28])bar([x,.02,0],[x*.7,.6,.06],.07,'dark');
        for(const [x,y,z,r,color] of [[-.48,.61,.05,.57,'#3c6943'],[.43,.66,.03,.6,'#4c8050'],[0,.94,-.13,.64,'#5c9258'],[0,.59,.35,.54,'#497d46'],[-.2,.85,.32,.4,'#6b9b60']])ball(x,y,z,r,color,1,1,.9);
        for(const [x,y,z] of [[-.38,.84,.48],[.28,.7,.69],[.2,1.11,.35]])ball(x,y,z,.055,'#d5b775');break;
    }
    // Static decorations batch by material, so repeated placements stay inexpensive.
    g.updateMatrixWorld(true);
    const batches=new Map(),oldGeometries=new Set(),oldMaterials=new Set();
    g.traverse(obj=>{
        if(!obj.isMesh)return;
        const m=obj.material,key=[m.type,m.color.getHexString(),m.side,m.emissive?.getHexString(),m.transparent,m.opacity,m.depthWrite].join(':');
        if(!batches.has(key))batches.set(key,{material:m,position:[],normal:[],fire:[]});
        const batch=batches.get(key),geometry=obj.geometry.index?obj.geometry.toNonIndexed():obj.geometry.clone();
        geometry.applyMatrix4(obj.matrixWorld);
        if(obj.userData.fire){
            const positions=geometry.attributes.position,offset=batch.position.length/3;
            for(let i=0;i<positions.count;i++)batch.fire.push({index:offset+i,...obj.userData.fire,restX:positions.getX(i),restY:positions.getY(i),restZ:positions.getZ(i)});
        }
        batch.position.push(...geometry.attributes.position.array);batch.normal.push(...geometry.attributes.normal.array);
        geometry.dispose();oldGeometries.add(obj.geometry);oldMaterials.add(m);
    });
    g.clear();
    const kept=new Set(),fireBatches=[];
    for(const batch of batches.values()){
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.position,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(batch.normal,3));
        const m=new THREE.Mesh(geometry,batch.material);g.add(m);kept.add(batch.material);
        if(batch.fire.length){geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);geometry.computeBoundingSphere();geometry.boundingSphere.radius+=.3;fireBatches.push({geometry,vertices:batch.fire,material:batch.material});}
    }
    oldGeometries.forEach(v=>v.dispose());
    for(const m of new Set([...oldMaterials,...materials.values()]))if(!kept.has(m))m.dispose();
    const lighting={campfire:[1,2,10,'#ffaa00'],lantern:[.37,1.5,8,'#ffaa00'],torch:[2.3,1.5,6,'#ff6600'],grill:[1.05,.7,4,'#ffaa00'],hotspring:[.5,.5,4,'#87ceeb']}[type];
    let fireLight=null;
    if(lighting){const [y,power,distance,color]=lighting,light=new THREE.PointLight(color,power,distance);light.position.y=y;g.add(light);if(fireBatches.length){fireLight=light;light.userData.restIntensity=power;}}
    if(fireBatches.length)g.userData.fireAnimation={batches:fireBatches,light:fireLight};
    // World video faces -Z (toward the placer). The rebuilt housing is authored
    // toward +Z; rotate it so its backing cannot cover the video depth cutout.
    if(type==='screen')g.rotation.y=Math.PI;
    g.userData.outdoorProp=type;g.userData.modelRevision=2;
    g.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});
    return g;
}

// Animate existing vertices and light only: no per-frame mesh creation or extra draws.
function animateOutdoorPropFire(model,seconds,seed=0){
    const animation=model?.userData.fireAnimation;if(!animation||!Number.isFinite(seconds))return;
    const time=seconds+seed,lantern=model.userData.outdoorProp==='lantern';
    for(const batch of animation.batches){
        const position=batch.geometry.attributes.position;
        for(const v of batch.vertices){
            const phase=time*7+v.phase,flicker=Math.sin(phase)*.12+Math.sin(phase*1.73+.8)*.065;
            const height=Math.max(0,(v.restY-v.y)/v.h),strength=lantern?.35:1;
            position.setXYZ(v.index,v.restX+Math.sin(phase*.61)*v.r*.5*height*height*strength,v.y+(v.restY-v.y)*(1+flicker*strength),v.restZ+Math.cos(phase*.77)*v.r*.3*height*height*strength);
        }
        position.needsUpdate=true;
        batch.material.emissiveIntensity=.65+Math.sin(time*11)*.09+Math.sin(time*17.3)*.045;
    }
    if(animation.light)animation.light.intensity=animation.light.userData.restIntensity*(.92+Math.sin(time*11)*.09+Math.sin(time*17.3)*.045);
}
