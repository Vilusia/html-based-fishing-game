// One shared synthesized reel loop, positioned per angler through the SFX mixer.
(function(){
 const voices=new Map(),RANGE=24,MAX_REMOTE=8;let buffer=null;
 function loopBuffer(){
  if(buffer)return buffer;
  buffer=audioCtx.createBuffer(1,audioCtx.sampleRate,audioCtx.sampleRate);const data=buffer.getChannelData(0);let seed=173;
  for(let i=0;i<data.length;i++){
   const t=i/audioCtx.sampleRate,phase=(t*18)%1;seed=(seed*16807)%2147483647;
   const noise=(seed/2147483647)*2-1;
   data[i]=(.55*Math.sin(t*Math.PI*2*1850)+noise*.30)*Math.exp(-phase*70)+.045*Math.sin(t*Math.PI*2*180);
  }
  return buffer;
 }
 function stop(id){const voice=voices.get(id);if(!voice)return;voices.delete(id);
  const now=audioCtx.currentTime;voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(0,now,.018);
  voice.source.onended=()=>{voice.source.disconnect();voice.filter.disconnect();voice.gain.disconnect();voice.panner.disconnect();};
  voice.source.stop(now+.08);
 }
 function set(id,on,position,local=false){
  if(!on||audioCtx.state!=='running'){stop(id);return;}
  let voice=voices.get(id);
  if(!voice){
   const source=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain(),panner=createPanner(position);
   source.buffer=loopBuffer();source.loop=true;filter.type='bandpass';filter.frequency.value=1350;filter.Q.value=.65;
   gain.gain.value=0;panner.maxDistance=RANGE;panner.refDistance=2;panner.rolloffFactor=1;
   source.connect(filter);filter.connect(gain);gain.connect(panner);panner.connect(sfxGain);
   voice={source,filter,gain,panner};voices.set(id,voice);source.start();gain.gain.setTargetAtTime(local?.11:.08,audioCtx.currentTime,.04);
  }
  voice.panner.positionX.value=position.x;voice.panner.positionY.value=position.y+1;voice.panner.positionZ.value=position.z;
 }
 function tick(){
  if(!player){for(const id of [...voices.keys()])stop(id);return;}
  const selected=new Set(),localOn=fishingState==='reeling'&&!!minigame.active;
  if(localOn)selected.add('local');set('local',localOn,player.position,true);
  const localHouse=window.Housing?.presence().houseOwner||'',now=Date.now();
  const peers=Object.entries(otherPlayers).filter(([id,peer])=>peer.mesh?.visible!==false&&peer.lastData?.reeling===true&&(peer.lastData.houseOwner||'')===localHouse&&Number.isFinite(peer.lastSeen)&&now-peer.lastSeen<3000&&player.position.distanceTo(peer.mesh.position)<RANGE).sort((a,b)=>player.position.distanceToSquared(a[1].mesh.position)-player.position.distanceToSquared(b[1].mesh.position)).slice(0,MAX_REMOTE);
  for(const [id,peer] of peers){const key='peer:'+id;selected.add(key);set(key,true,peer.mesh.position);}
  for(const id of [...voices.keys()])if(!selected.has(id))stop(id);
 }
 window.ReelAudio={tick,stopLocal:()=>stop('local'),remove:id=>stop('peer:'+id),clear:()=>{for(const id of [...voices.keys()])stop(id);}};
})();
