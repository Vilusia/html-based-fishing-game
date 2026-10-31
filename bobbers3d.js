// Solid fishing floats; origins sit on the waterline. 2D icons remain in ui.js.
(function(){
 function build(type){
  const g=new THREE.Group(),materials=new Map(),c=type.color,white=0xfff4dd,dark=0x242734;
  function mat(color){if(!materials.has(color))materials.set(color,new THREE.MeshBasicMaterial({color}));return materials.get(color);}
  function mesh(geometry,color,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,mat(color));m.position.set(x,y,z);g.add(m);return m;}
  const ball=(color,x,y,z,sx,sy=sx,sz=sx)=>{const m=mesh(new THREE.SphereGeometry(1,10,6),color,x,y,z);m.scale.set(sx,sy,sz);return m;};
  const box=(color,x,y,z,w,h,d)=>mesh(new THREE.BoxGeometry(w,h,d),color,x,y,z);
  const cyl=(color,x,y,z,rt,rb,h)=>mesh(new THREE.CylinderGeometry(rt,rb,h,10),color,x,y,z);
  const torus=(color,x,y,z,r,t)=>{const m=mesh(new THREE.TorusGeometry(r,t,5,14),color,x,y,z);m.rotation.x=Math.PI/2;return m;};
  const eyes=(x,y,z)=>{for(const side of [-1,1])ball(dark,side*x,y,z,.028);};
  const stem=()=>{cyl(dark,0,.36,0,.018,.018,.35);ball(c,0,.55,0,.035);};
  switch(type.eventModel||type.id){
   case 'duck':ball(c,0,.08,0,.25,.16,.31);ball(c,0,.32,.13,.16);box(0xf39825,0,.27,.31,.17,.06,.15);eyes(.07,.36,.26);break;
   case 'cube':box(c,0,.1,0,.38,.38,.38);stem();break;
   case 'heart':{const shape=new THREE.Shape();shape.moveTo(0,-.2);shape.bezierCurveTo(-.6,.16,-.24,.51,0,.25);shape.bezierCurveTo(.24,.51,.6,.16,0,-.2);const m=mesh(new THREE.ExtrudeGeometry(shape,{depth:.14,bevelEnabled:false,steps:1,curveSegments:8}),c,0,0,-.07);break;}
   case 'star':{const shape=new THREE.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.13:.3;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?shape.lineTo(x,y):shape.moveTo(x,y);}shape.closePath();mesh(new THREE.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:false}),c,0,.12,-.065);break;}
   case 'skull':ball(c,0,.16,0,.23,.25,.19);box(c,0,-.06,.04,.28,.13,.24);for(const side of [-1,1])ball(dark,side*.09,.18,.17,.063,.07,.025);break;
   case 'pumpkin':ball(c,0,.08,0,.26,.22,.25);cyl(0x537d37,0,.33,0,.035,.045,.13);for(const side of [-1,1])ball(dark,side*.09,.13,.23,.045,.05,.02);break;
   case 'bomb':ball(c,0,.1,0,.23);cyl(0x8a7348,0,.36,0,.025,.025,.15);ball(0xffb53d,.02,.45,0,.045);break;
   case 'mushroom':cyl(white,0,.04,0,.10,.13,.25);ball(c,0,.25,0,.30,.13,.3);for(let i=0;i<5;i++){const a=i*1.26;ball(white,Math.cos(a)*.19,.33,Math.sin(a)*.19,.045,.02,.045);}break;
   case 'cork':cyl(c,0,.13,0,.14,.16,.43);torus(dark,0,.17,0,.15,.012);break;
   case 'pencil':cyl(c,0,.24,0,.065,.065,.6);cyl(0xe8c18f,0,.59,0,0,.065,.15);ball(dark,0,.67,0,.014);cyl(0xf19cac,0,-.11,0,.065,.065,.1);break;
   case 'lantern':box(c,0,.13,0,.3,.34,.3);for(const side of [-1,1]){box(dark,side*.17,.13,0,.025,.4,.34);box(dark,0,.13,side*.17,.34,.4,.025);}cyl(dark,0,.36,0,.12,.24,.12);torus(c,0,.49,0,.07,.015).rotation.x=0;break;
   case 'acorn':ball(c,0,.05,0,.20,.25,.2);ball(0x68452b,0,.25,0,.24,.10,.24);cyl(0x4e3524,0,.38,0,.025,.035,.12);break;
   case 'apple':case 'orange_fruit':case 'lemon':case 'lime':case 'watermelon':{
    const melon=type.id==='watermelon',lemon=type.id==='lemon';ball(c,0,.12,0,lemon?.29:.23,.23,lemon?.19:.23);
    if(melon){for(let i=0;i<5;i++){const ring=torus(0x2b6338,0,.12,0,.235,.012);ring.rotation.set(Math.PI/2,0,i*Math.PI/5);}}
    else{cyl(0x664129,0,.38,0,.018,.025,.10);const leaf=ball(0x52873f,.07,.39,0,.095,.025,.04);leaf.rotation.z=.3;}break;
   }
   case 'donut':torus(c,0,.09,0,.20,.095);torus(0xff9fc9,0,.15,0,.20,.06);for(let i=0;i<8;i++){const a=i*Math.PI/4;box(i%2?0x8acbea:0xffe175,Math.cos(a)*.2,.21,Math.sin(a)*.2,.04,.014,.02);}break;
   case 'lifering':torus(white,0,.08,0,.23,.075);for(let i=0;i<4;i++){const a=i*Math.PI/2;box(c,Math.cos(a)*.23,.09,Math.sin(a)*.23,.10,.13,.10);}break;
   case 'buoy':cyl(c,0,.10,0,.12,.22,.32);cyl(white,0,.33,0,.055,.055,.23);cyl(c,0,.48,0,.10,.10,.07);break;
   case 'bottle':cyl(c,0,.13,0,.13,.13,.40);cyl(c,0,.40,0,.06,.13,.14);cyl(0xb48552,0,.51,0,.06,.06,.09);box(white,0,.13,.131,.18,.16,.008);break;
   case 'jellyfish':ball(c,0,.25,0,.27,.20,.27);for(let i=0;i<6;i++){const a=i*Math.PI/3;cyl(0xd8a4f5,Math.cos(a)*.16,-.04,Math.sin(a)*.16,.02,.014,.34);}eyes(.08,.26,.25);break;
   case 'octopus':ball(c,0,.2,0,.23,.24,.23);for(let i=0;i<8;i++){const a=i*Math.PI/4;ball(c,Math.cos(a)*.23,-.015,Math.sin(a)*.23,.14,.055,.08);}eyes(.08,.22,.22);break;
   case 'turtle':ball(c,0,.1,0,.26,.17,.31);ball(0x82b765,0,.1,.36,.10);for(const x of [-1,1])for(const z of [-1,1])ball(0x82b765,x*.25,.015,z*.2,.11,.035,.09);eyes(.04,.13,.44);break;
   case 'koi':ball(white,0,.12,0,.18,.15,.32);ball(c,.02,.18,.10,.12,.08,.12);const fin=mesh(new THREE.ConeGeometry(.17,.23,3),c,0,.12,-.37);fin.rotation.x=Math.PI/2;eyes(.10,.17,.27);break;
   case 'rocket':cyl(c,0,.20,0,.11,.11,.42);cyl(0xe8edf3,0,.49,0,0,.11,.18);for(const side of [-1,1])box(0x4d6da4,side*.13,.02,0,.08,.23,.09);ball(0x77d9f1,0,.28,.11,.055,.055,.02);break;
   case 'ufo':ball(c,0,.13,0,.34,.09,.34);ball(0x81dbd8,0,.26,0,.16,.13,.16);for(let i=0;i<6;i++){const a=i*Math.PI/3;ball(0xffef99,Math.cos(a)*.27,.15,Math.sin(a)*.27,.03);}break;
   default:ball(white,0,.025,0,.22);mesh(new THREE.SphereGeometry(.224,10,4,0,Math.PI*2,0,Math.PI/2),c,0,.025,0);stem();break;
  }
  // Small submerged tie point for a believable fishing float base.
  cyl(dark,0,-.17,0,.018,.018,.08);g.name='bobber3D';g.userData={is3D:true,bobberType:type.id};return g;
 }
 window.Bobbers3D={build};
})();
