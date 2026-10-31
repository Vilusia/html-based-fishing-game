/* Hourly, host-authoritative lobby tournaments. */
(function () {
    'use strict';
    const HOUR = 3600000, CASH_PER_FISH = 5, PODIUM_BONUSES = [5000, 2500, 1000];
    const rewardFor=(count,rank,players)=>count*CASH_PER_FISH+(count>0&&players>=3?(PODIUM_BONUSES[rank]||0):0);
    class Tournament {
        constructor(now, validFish) { this.now = now; this.validFish = validFish; this.hour = Math.floor(now() / HOUR); this.entries = new Map(); this.casts = new Map(); this.previous = []; this.result = null; this.pending = new Map(); this.awards = new Map(); }
        remove(id) {
            const changed=this.entries.delete(id);
            this.casts.delete(id);this.pending.delete(id);this.awards.delete(id);
            return changed;
        }
        syncConnected(ids) {
            const connected=new Set(ids);
            for(const id of new Set([...this.entries.keys(),...this.casts.keys(),...this.pending.keys()]))if(!connected.has(id))this.remove(id);
        }
        rank() { return [...this.entries.values()].sort((a,b) => b.count-a.count || a.reached-b.reached || a.id.localeCompare(b.id)); }
        tick() {
            const hour = Math.floor(this.now() / HOUR);
            if (hour === this.hour) return;
            const ranked = this.rank();
            const players = ranked.length, fish = ranked.reduce((sum,e) => sum+e.count,0);
            this.result = { hour: this.hour, canceled: false, players, fish };
            this.previous = ranked.map((e,i) => ({ ...e, bonus:players>=3?(PODIUM_BONUSES[i]||0):0, prize: rewardFor(e.count,i,players) }));
            for (const e of this.previous) {
                this.pending.set(e.id, (this.pending.get(e.id) || 0) + e.prize);
                const queue=this.awards.get(e.id)||[];queue.push({hour:this.hour,amount:e.prize});this.awards.set(e.id,queue);
            }
            this.hour = hour; this.entries.clear(); this.casts.clear();
        }
        acknowledge(id,hour) {
            const queue=this.awards.get(id),award=queue?.find(v=>v.hour===hour);
            if(!award)return false;
            const remaining=queue.filter(v=>v!==award);
            if(remaining.length){this.awards.set(id,remaining);this.pending.set(id,remaining.reduce((sum,v)=>sum+v.amount,0));}
            else {this.awards.delete(id);this.pending.delete(id);}
            return true;
        }
        receive(id, name, msg) {
            this.tick();
            if (msg.hour !== this.hour || typeof msg.token !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(msg.token)) return false;
            const now = this.now(), cast = this.casts.get(id);
            if (msg.type === 'tournament:cast') {
                if (cast && now - cast.at < 2000) return false;
                this.casts.set(id, { token: msg.token, at: now, used: false }); return true;
            }
            if (msg.type !== 'tournament:catch' || !cast || cast.used || cast.token !== msg.token) return false;
            cast.used = true; // Consume even rejected attempts: a cast can submit only once.
            if (now-cast.at < 2000 || now-cast.at > 180000 || !this.validFish(msg.fish)) return false;
            const entry = this.entries.get(id) || { id, name: String(name || 'Fisher').slice(0,32), count: 0, reached: 0 };
            entry.count++; entry.reached = now; this.entries.set(id, entry); return true;
        }
        snapshot(id) {
            const ranked=this.rank(),index=ranked.findIndex(v=>v.id===id),mine=this.entries.get(id)?.count||0;
            return { type:'tournament:state',hour:this.hour,endsAt:(this.hour+1)*HOUR,remaining:Math.max(0,(this.hour+1)*HOUR-this.now()),leaders:ranked.slice(0,10).map((e,i)=>({...e,prize:rewardFor(e.count,i,ranked.length)})),mine,reward:rewardFor(mine,index,ranked.length),previous:this.previous,result:this.result,players:ranked.length,totalFish:ranked.reduce((sum,e)=>sum+e.count,0) };
        }
    }
    window.TournamentRules = { Tournament, HOUR, CASH_PER_FISH, PODIUM_BONUSES, rewardFor };
    if (typeof document === 'undefined') return;
    let authority = null, room = null, token = null, state = null, receivedAt = 0, announced = null, lastSyncRequest = -Infinity;
    const panel = document.createElement('details');panel.id='tournament-hud';
    panel.style.cssText = 'position:fixed;right:12px;bottom:90px;z-index:90;background:#142b36ed;color:#fff;padding:10px 14px;border:1px solid #78b7bd;border-radius:10px;max-width:290px;font:14px sans-serif;display:none';
    const summary = document.createElement('summary'), body = document.createElement('div');
    summary.style.cursor = 'pointer'; panel.append(summary, body); document.body.append(panel);
    function accept(msg) {
        if (msg.type !== 'tournament:state') return;
        if (msg.award) {
            const award = msg.award;
            const paid = Array.isArray(saveState.tournamentAwards)?saveState.tournamentAwards:[];
            if (typeof award.id==='string' && award.id.length<=200 && Number.isSafeInteger(award.amount) && award.amount > 0) {
                const fresh=!paid.includes(award.id);
                if(fresh){saveState.money += award.amount;saveState.tournamentAwards = [...paid, award.id].slice(-100);}
                try {
                    // Save the receipt together with the balance before acknowledging it.
                    if(saveGame()===false)throw new Error('Prize receipt could not be saved yet.');
                    if(isHost||!hostConn?.open)acknowledge(myId(),award.id);
                    else hostConn.send({type:'tournament:ack',awardId:award.id});
                    if(fresh){showToast('Hourly tournament prize: $' + award.amount.toLocaleString() + '!');if(typeof updateUI==='function')updateUI();}
                }catch(error){console.warn('Tournament payout will be retried:',error);}
            }
        }
        // A late packet may carry an unpaid award, but must not rewind the timer.
        if(state && msg.hour<state.hour)return;
        const announcementKey = roomKey() + ':' + msg.hour;
        if (announced !== announcementKey) {
            const joining = !state || state.hour === msg.hour;
            if (!joining) {
                const results = msg.previous.length ? msg.previous.slice(0,10).map((e,i) => (i+1)+'. '+e.name+' ($'+e.prize.toLocaleString()+')').join(', ') : 'No qualifying catches.';
                announce('Round finished! Everyone earns $'+CASH_PER_FISH+' per valid fish. '+results);
            }
            announce((joining ? 'Hourly tournament is live!' : 'A new hourly tournament has started!')+' Earn $'+CASH_PER_FISH+' per valid fish at the end of the hour. Solo welcome. With 3+ participants: podium bonuses apply. Tab → Tournament.');
            announced = announcementKey;
        }
        state = msg; receivedAt = Date.now();
        render();
    }
    function announce(text) {
        showToast(text);
        if (typeof displayChatMessage === 'function') displayChatMessage('Tournament', text, 'system');
    }
    function render() {
        const status = document.getElementById('tournament-status');
        const rows = document.getElementById('tournament-standings');
        if (!status || !rows) return;
        const live = active() && state;
        const seconds = live ? Math.max(0,Math.ceil((state.remaining-(Date.now()-receivedAt))/1000)) : 0;
        status.textContent = live ? (seconds?'Time left: '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'Finalizing results — waiting for host')+' · Your catches: '+state.mine+' · Reward so far: $'+(state.reward??state.mine*CASH_PER_FISH).toLocaleString()+' · Players: '+(state.players ?? 0) : 'Start playing to enter the hourly tournament.';
        rows.replaceChildren();
        for (let i=0;i<10;i++) {
            const entry = live ? state.leaders[i] : null;
            const row = document.createElement('tr');
            for (const value of [i+1, entry ? entry.name+(entry.id === myId() ? ' (you)' : '') : '—', entry ? entry.count : '—', entry ? '$'+(entry.prize??rewardFor(entry.count,i,state.players||0)).toLocaleString() : '—']) {
                const cell = document.createElement('td'); cell.textContent=String(value); cell.style.padding='7px 4px'; row.append(cell);
            }
            rows.append(row);
        }
        document.getElementById('tournament-winners').textContent = live && state.previous.length ? state.previous.slice(0,10).map((e,i) => (i+1)+'. '+e.name+' — '+e.count+' fish ($'+e.prize.toLocaleString()+')').join(' · ') : 'No completed round yet.';
    }
    const myId = () => myPeerId || 'solo-player';
    const roomKey = () => currentRoomId && (isHost || hostConn?.open) ? String(currentRoomId) : 'solo';
    function deliver(id, msg) {
        try {if(id===myId())accept(msg);else if(clientConns[id]?.open)clientConns[id].send(msg);}
        catch(error){console.warn('Tournament update will be retried:',error);}
    }
    const awardId=(id,award)=>room+':'+award.hour+':'+id;
    function acknowledge(id,receipt){const award=authority?.awards.get(id)?.[0];if(award&&awardId(id,award)===receipt)authority.acknowledge(id,award.hour);}
    function publish(id){
        const msg=authority.snapshot(id),award=authority.awards.get(id)?.[0];
        if(award)msg.award={id:awardId(id,award),amount:award.amount};
        deliver(id,msg);
    }
    const connectedIds=()=>[myId(),...Object.keys(clientConns).filter(id=>clientConns[id]?.open)];
    function send(msg) { if ((isHost || !hostConn?.open) && authority) {authority.syncConnected(connectedIds());authority.receive(myId(), saveState.displayName, msg);} else if (hostConn?.open) hostConn.send(msg); }
    function active() { return (!!myPeerId && !!currentRoomId && (isHost || hostConn?.open)) || (typeof player !== 'undefined' && !!player && document.getElementById('lobby-screen')?.style.display === 'none'); }
    function ensureAuthority(){
        if(room!==roomKey()){room=roomKey();state=null;token=null;authority=null;announced=null;lastSyncRequest=-Infinity;}
        if((isHost||!hostConn?.open)&&!authority)authority=new Tournament(Date.now,name=>typeof name==='string'&&[...FISH_TYPES,...RAIN_FISH,...VOID_FISH,...LAVA_FISH].some(f=>f.name===name&&name!=='Old Boot'));
    }
    function requestSync(){
        if(!active()||isHost||!hostConn?.open||Date.now()-lastSyncRequest<2000)return;
        lastSyncRequest=Date.now();
        try{hostConn.send({type:'tournament:sync'});}catch(error){console.warn('Tournament resync will be retried:',error);}
    }
    window.Tournaments = {
        render,
        cast() { if (!active()) return; ensureAuthority(); token = crypto.randomUUID(); send({ type: 'tournament:cast', hour: state?.hour ?? Math.floor(Date.now()/HOUR), token }); },
        caught(fish) { if (!active() || !token) return; send({ type: 'tournament:catch', hour: state?.hour ?? Math.floor(Date.now()/HOUR), token, fish: fish.name }); token = null; },
        onPlayerLeft(id) {
            if(!isHost||!authority)return;
            authority.remove(id);
            for(const peer of connectedIds())if(peer!==id)publish(peer);
        },
        client(id,msg) {
            if(!isHost||!clientConns[id]?.open||!otherPlayers[id])return;
            ensureAuthority();authority.syncConnected(connectedIds());authority.tick();
            if(msg.type==='tournament:ack'){acknowledge(id,msg.awardId);return;}
            if(msg.type==='tournament:sync'){publish(id);return;}
            authority.receive(id,otherPlayers[id].lastData?.name,msg);
        },
        host: accept
    };
    setInterval(() => {
        if (!active()) { panel.style.display='none'; room=null; authority=null; state=null; token=null; announced=null; render(); return; }
        ensureAuthority();
        if (isHost || !hostConn?.open) {

            authority.syncConnected(connectedIds());
            authority.tick();
            // Retain every award until the recipient confirms saving it.
            for(const id of connectedIds())publish(id);
        }
        else if(!state||Date.now()-receivedAt>=5000||state.remaining-(Date.now()-receivedAt)<=0)requestSync();
        if (!state) return;
        render();
        panel.style.display='block';
        const seconds = Math.max(0,Math.ceil((state.remaining-(Date.now()-receivedAt))/1000));
        summary.textContent = 'Hourly tournament · '+(seconds?Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'Finalizing results')+' · '+state.mine+' fish';
        body.replaceChildren();
        const line = text => { const el=document.createElement('p'); el.style.margin='8px 0'; el.textContent=text; body.append(el); };
        line('Everyone earns $'+CASH_PER_FISH+' per valid fish at the end of the hour.');
        line('3+ participants with a catch: 1st +$5,000, 2nd +$2,500, 3rd +$1,000. Otherwise $5 per fish only.');
        line('Players: '+state.players+' · Your reward so far: $'+(state.reward??state.mine*CASH_PER_FISH).toLocaleString());
        line('Ties: first to reach the score wins. Boots do not count.');
        if (state.result?.canceled) line('Last round canceled: '+state.result.reason+'.');
        state.leaders.forEach((e,i) => line((i+1)+'. '+e.name+' — '+e.count+' fish'));
        if (!state.leaders.length) line('Catch a fish to enter automatically.');
        if (state.previous.length) line('Last winners: '+state.previous.slice(0,10).map(e=>e.name+' ($'+e.prize.toLocaleString()+')').join(', '));
    },1000);
})();
