// Reject expensive or abusive peer traffic before any gameplay handler runs.
(function(){
    'use strict';
    const LAG_GAP_MS=750,LAG_WINDOW_MS=5000,LAG_BURST_CAP=400,LAG_PACKET_CAP=800,LAG_BYTE_CAP=1572864;
    const BUDGETS={update:[30,60],placeProp:[1,3],undoProp:[3,6],chat:[2,5],sound:[5,12],anim:[4,8],punch_hit:[4,8],
        'boat:input':[25,50],'boat:walk':[8,16],'boat:helm':[3,6],'boat:spawn':[1,3],'boat:board':[3,6],'boat:leave':[3,6],'boat:sync':[2,4],
        'house:update':[3,6],'house:decision':[3,6],'house:request':[2,4],'house:leave':[3,6],'house:kick':[3,6],'house:cancel':[3,6],
        'tournament:cast':[2,4],'tournament:catch':[2,4],'tournament:sync':[2,4],'tournament:ack':[4,10],
        'explore:claim':[4,8],'explore:sync':[2,4],'explore:ack':[5,12],
        screenQueueAdd:[3,8],screenQueueRemove:[4,8],screenQueueMove:[4,8],ytPlayback:[3,6],ytSync:[3,6],ytChange:[2,5],
        tradeRequest:[3,6],tradeOffer:[4,8],tradeAccept:[3,6],tradeCancel:[3,6],skillLevel:[4,12],radio_event:[2,4],chop_tree:[4,8],mine_rock:[4,8],pick_flower:[4,8],worldBossSpawn:[1,2],worldBossDefeated:[1,2]};
    function packetCost(packet){
        if(!packet||typeof packet!=='object'||Array.isArray(packet)||typeof packet.type!=='string'||!/^[a-z][A-Za-z0-9:_-]{0,63}$/.test(packet.type))return null;
        const position=p=>p&&[p.x,p.y,p.z].every(n=>Number.isFinite(n)&&Math.abs(n)<=50000);
        if(packet.type==='update'&&(!position(packet.payload?.pos)||(packet.payload.rot!=null&&(!Number.isFinite(packet.payload.rot)||Math.abs(packet.payload.rot)>1e6))))return null;
        if(packet.type==='update'&&packet.payload?.protogenLogo!=null&&(typeof packet.payload.protogenLogo!=='string'||packet.payload.protogenLogo!==''&&!/^[0-9a-f]{256}$/i.test(packet.payload.protogenLogo)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaint!=null&&(typeof packet.payload.bodyPaint!=='string'||packet.payload.bodyPaint!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaint)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintBack!=null&&(typeof packet.payload.bodyPaintBack!=='string'||packet.payload.bodyPaintBack!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaintBack)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintLeft!=null&&(typeof packet.payload.bodyPaintLeft!=='string'||packet.payload.bodyPaintLeft!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaintLeft)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintRight!=null&&(typeof packet.payload.bodyPaintRight!=='string'||packet.payload.bodyPaintRight!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaintRight)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintHeadFront!=null&&(typeof packet.payload.bodyPaintHeadFront!=='string'||packet.payload.bodyPaintHeadFront!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaintHeadFront)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintHeadBack!=null&&(typeof packet.payload.bodyPaintHeadBack!=='string'||packet.payload.bodyPaintHeadBack!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaintHeadBack)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintHeadLeft!=null&&(typeof packet.payload.bodyPaintHeadLeft!=='string'||packet.payload.bodyPaintHeadLeft!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaintHeadLeft)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintHeadRight!=null&&(typeof packet.payload.bodyPaintHeadRight!=='string'||packet.payload.bodyPaintHeadRight!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaintHeadRight)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintHeadTop!=null&&(typeof packet.payload.bodyPaintHeadTop!=='string'||packet.payload.bodyPaintHeadTop!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaintHeadTop)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintHeadBottom!=null&&(typeof packet.payload.bodyPaintHeadBottom!=='string'||packet.payload.bodyPaintHeadBottom!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaintHeadBottom)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintArmLeft!=null&&(typeof packet.payload.bodyPaintArmLeft!=='string'||packet.payload.bodyPaintArmLeft!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaintArmLeft)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintArmRight!=null&&(typeof packet.payload.bodyPaintArmRight!=='string'||packet.payload.bodyPaintArmRight!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaintArmRight)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintLegLeft!=null&&(typeof packet.payload.bodyPaintLegLeft!=='string'||packet.payload.bodyPaintLegLeft!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaintLegLeft)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintLegRight!=null&&(typeof packet.payload.bodyPaintLegRight!=='string'||packet.payload.bodyPaintLegRight!==''&&!/^[.0-9a-fx]{552}$/i.test(packet.payload.bodyPaintLegRight)))return null;
        if(packet.type==='update'&&packet.payload?.bodyPaintColor!=null&&(typeof packet.payload.bodyPaintColor!=='string'||!/^#[0-9a-f]{6}$/i.test(packet.payload.bodyPaintColor)))return null;
        if(packet.type==='chat'&&(typeof packet.text!=='string'||packet.text.length>1000))return null;
        if(packet.type==='sound'&&(!['guitar','punch','footstep','swim','scratch','jump','cast','splash','meow','chat','reel','sail','talk','catch'].includes(packet.name)||!position(packet.pos)||(packet.var!=null&&(!Number.isFinite(packet.var)||Math.abs(packet.var)>24000))))return null;
        if(packet.type==='screenQueueAdd'){
            const item=packet.item||packet.src;
            if(!item||typeof item.id!=='string'||typeof packet.propId!=='string'||packet.propId.length>100)return null;
            if(item.provider==='youtube'){if(!/^[A-Za-z0-9_-]{11}$/.test(item.id))return null;}
            else if(item.provider==='twitch'){if(!(item.twitchKind==='video'?/^\d{1,20}$/:/^[A-Za-z0-9_]{1,25}$/).test(item.id))return null;}
            else return null;
            if(item.title!=null&&(typeof item.title!=='string'||item.title.length>500))return null;
        }
        const large=packet.type==='house:update'||packet.type==='house:decision',maxBytes=large?262144:65536,maxNodes=large?20000:2048;
        const stack=[[packet,0]],seen=new WeakSet();let bytes=0,nodes=0;
        while(stack.length){
            if(++nodes>maxNodes)return null;
            const [value,depth]=stack.pop();if(depth>24)return null;
            if(typeof value==='string'){if(value.length>8192)return null;bytes+=value.length*2;}
            else if(typeof value==='number'){if(!Number.isFinite(value))return null;bytes+=8;}
            else if(typeof value==='boolean'||value==null)bytes+=4;
            else if(typeof value==='object'){
                if(seen.has(value))return null;seen.add(value);
                if(!Array.isArray(value)&&Object.prototype.toString.call(value)!=='[object Object]')return null;
                if(Array.isArray(value)&&value.length>maxNodes)return null;
                let count=0;
                for(const name in value){
                    if(!Object.prototype.hasOwnProperty.call(value,name))continue;
                    if(++count>maxNodes||stack.length>=maxNodes||name.length>100||['__proto__','prototype','constructor'].includes(name))return null;
                    if(name==='queue'&&Array.isArray(value[name])&&value[name].length>50)return null;
                    bytes+=name.length*2;stack.push([value[name],depth+1]);
                }
            }else return null;
            if(bytes>maxBytes)return null;
        }
        return bytes;
    }
    class Guard{
        constructor(env){this.env=env;this.users=new Map();this.blocked=new Map();}
        reset(){this.users.clear();this.blocked.clear();}
        forget(id){this.users.delete(id);}
        blockedJoin(id,device){const now=this.env.now();for(const [key,until] of this.blocked)if(until<=now)this.blocked.delete(key);return this.blocked.has('peer:'+id)||(!!device&&this.blocked.has('device:'+device));}
        state(id){let s=this.users.get(id);if(!s){s={buckets:new Map(),strikes:0,strikeAt:this.env.now(),kicked:false,lastPacketAt:this.env.now(),lagGapMs:0,lagGranted:new Set(),lagUntil:0};this.users.set(id,s);}return s;}
        strike(id,reason,weight=1){
            const s=this.state(id),now=this.env.now();if(s.kicked)return false;
            s.strikes=Math.max(0,s.strikes-(now-s.strikeAt)*.002)+weight;s.strikeAt=now;
            if(s.strikes>=32){
                s.kicked=true;this.blocked.set('peer:'+id,now+120000);const device=this.env.device?.(id);if(device)this.blocked.set('device:'+device,now+120000);
                while(this.blocked.size>256)this.blocked.delete(this.blocked.keys().next().value);
                this.env.kick(id,reason);
            }
            return false;
        }
        take(s,key,rate,capacity,cost=1,allowLag=true){
            const now=this.env.now(),b=s.buckets.get(key)||{tokens:capacity,at:now,bonus:0};
            b.tokens=Math.min(capacity+(b.bonus||0),b.tokens+Math.max(0,now-b.at)*rate/1000);b.at=now;s.buckets.set(key,b);
            // A reliable channel can hold packets while a peer is lagging and then
            // release them all at once. Let each budget save up its normal rate
            // during the observed gap once, instead of treating that backlog as a
            // flood. Sustained traffic still has to obey the same average rate.
            if(b.tokens<cost&&allowLag&&s.lagGapMs>0&&now<=s.lagUntil&&!s.lagGranted.has(key)){
                const cap=key==='bytes'?LAG_BYTE_CAP:key==='packets'?LAG_PACKET_CAP:LAG_BURST_CAP;
                const extra=Math.min(cap,Math.floor(s.lagGapMs*rate/1000));
                if(extra>0){
                    b.bonus=Math.max(b.bonus||0,extra);
                    b.tokens=Math.min(capacity+b.bonus,b.tokens+extra);
                    s.lagGranted.add(key);
                }
            }
            if(b.tokens<cost)return false;
            b.tokens-=cost;
            if(b.tokens<=capacity)b.bonus=0;
            return true;
        }
        accept(id,data){
            const s=this.state(id);if(s.kicked)return false;
            const now=this.env.now();
            if(s.lagGapMs>0&&now>s.lagUntil){s.lagGapMs=0;s.lagGranted.clear();}
            const gap=Math.max(0,now-(s.lastPacketAt??now));
            if(gap>=LAG_GAP_MS&&gap<=120000){
                s.lagGapMs=gap;s.lagGranted.clear();s.lagUntil=now+LAG_WINDOW_MS;
            }
            s.lastPacketAt=now;
            // The aggregate budget is checked before walking even a malformed object.
            if(!this.take(s,'packets',160,320))return this.strike(id,'packet flooding',4);
            let bytes;try{bytes=packetCost(data);}catch(e){bytes=null;}
            if(bytes===null)return this.strike(id,'oversized or invalid packets',8);
            if(!this.take(s,'bytes',262144,524288,bytes))return this.strike(id,'excessive packet data',4);
            // The built-in MIDI player can burst many notes per frame. Thin the
            // shared audio without treating normal playback as malicious traffic.
            if(data.type==='sound'&&data.name==='guitar')return this.take(s,'midi',8,16,1,false);
            const known=Object.prototype.hasOwnProperty.call(BUDGETS,data.type),[rate,burst]=known?BUDGETS[data.type]:[3,6];
            if(!this.take(s,known?data.type:'unknown',rate,burst,1,known))return this.strike(id,'repeated '+(known?data.type:'unknown')+' packet spam');
            if(!known)return this.strike(id,'unsupported packet types',2);
            return true;
        }
    }
    window.NetworkGuardRules={Guard,packetCost,BUDGETS};
    const guard=new Guard({now:()=>Date.now(),device:id=>clientConns[id]?.deviceID,kick:(id,reason)=>window.disconnectAbusivePeer?.(id,reason)});
    window.NetworkGuard={
        accept(id,data){if(!isHost||!clientConns[id]?.open)return false;return guard.accept(id,data);},
        strike:(id,reason,weight)=>guard.strike(id,reason,weight),forget:id=>guard.forget(id),reset:()=>guard.reset(),blockedJoin:(id,device)=>guard.blockedJoin(id,device)
    };
})();
