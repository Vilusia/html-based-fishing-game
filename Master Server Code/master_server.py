#!/usr/bin/env python3
"""HTML Fishing - Master Server
==============================

A tiny, dependency-free directory of public lobbies.

The game itself stays peer-to-peer: this server never relays gameplay. It only
keeps a list of lobbies that are currently online so players can find each
other without swapping room codes.

Two kinds of entry are tracked:

  * P2P lobbies   A player presses HOST GAME in the browser and the client
                  POSTs /register with its PeerJS id, lobby name and player
                  count. It refreshes every few seconds while hosting.
  * Dedicated     A `Dedicated Server Code/server.js` instance POSTs
                  /heartbeat with {name, ip, port, players}.

Endpoints
---------
  GET  /                Health + totals      {"status":"ok","players":N,...}
  GET  /list            Public lobbies       [ {entry}, ... ]   (bare array)
  GET  /servers         Public lobbies       {"servers":[...], "count":N,...}
  GET  /stats           Live totals + sampled weekly/monthly/yearly history
  GET  /analytics       Live connections dashboard + player-count graphs
  POST /register        Create or capability-authenticate a P2P update
  POST /heartbeat       Capability-authenticated refresh / dedicated creation
  POST /unregister      Remove a lobby by exact id and capability
  OPTIONS *             CORS preflight

POST bodies are JSON. Clients send them as `text/plain` so the browser treats
them as a "simple" request and skips the CORS preflight round-trip (this also
lets the unload beacon fire reliably); the content type is not inspected.

Entries older than their TTL are pruned, so a crashed host disappears on its
own. Nothing is trusted: every field is clamped and sanitised, and the table is
size-capped.

Running
-------
  python master_server.py
  python master_server.py --port 8081 --host 0.0.0.0
  MASTER_PORT=8081 MASTER_TTL_P2P=60 python master_server.py

Pure standard library - no pip install, Python 3.7+.
"""

import argparse
import atexit
import datetime
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import socket
import sys
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_PORT = 8081
DEFAULT_HOST = "0.0.0.0"

DEFAULT_TTL_P2P = 60          # seconds a P2P lobby survives without a refresh
DEFAULT_TTL_DEDICATED = 120   # dedicated servers heartbeat less often
MAX_ENTRIES = 500             # hard cap on the directory size
MAX_BODY = 16 * 1024          # largest accepted POST body
OWNERSHIP_VERSION = 1
MAX_PER_IP = 16
ALLOWED_TAGS = frozenset(('Chill', 'Competitive', 'Talkative', 'Quiet', 'Voice Chat',
    'Beginner Friendly', 'Grinding', 'Fishing Only', 'Mini Games', 'Roleplay',
    'Events', 'LGBTQ+ Friendly', 'No Swearing', 'Mic On', 'Just Fun', 'Long Session'))

# A client hosting a lobby refreshes every 10s, and an open server browser
# polls /list every 5s. 300 requests/minute/IP is comfortably above that while
# still stopping a runaway loop.
RATE_WINDOW = 60.0
RATE_MAX = 300

VERBOSE = True

_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")


def log(*parts):
    if VERBOSE:
        sys.stderr.write("[master] " + " ".join(str(p) for p in parts) + "\n")
        sys.stderr.flush()


# ---------------------------------------------------------------------------
# Input sanitising
# ---------------------------------------------------------------------------

def clean_text(value, max_len):
    """Coerce anything into a short, control-character-free string."""
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    value = _CONTROL_RE.sub("", value).strip()
    return value[:max_len]


def clean_int(value, default=0, lo=0, hi=10 ** 9):
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        return default
    return max(lo, min(hi, number))


def clean_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


def clean_tags(value, max_count=10, max_len=24):
    """A short list of safe, human-readable search tags."""
    if not isinstance(value, list):
        return []
    out = []
    seen = set()
    for item in value:
        if len(out) >= max_count:
            break
        tag = clean_text(item, max_len)
        if not tag:
            continue
        key = tag.lower()
        if key in seen:
            continue
        if tag not in ALLOWED_TAGS:
            continue
        seen.add(key)
        out.append(tag)
    return out


def clean_host(value):
    """An IP address or a hostname. Rejects anything that isn't one."""
    text = clean_text(value, 253)
    if not text:
        return ""
    try:
        ipaddress.ip_address(text)
        return text
    except ValueError:
        pass
    # Hostname: letters, digits, dots and dashes only.
    if re.fullmatch(r"[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?", text):
        return text
    return ""


def clean_peer_id(value):
    """PeerJS ids are UUID-ish. Keep it strict so ids can't smuggle markup."""
    text = clean_text(value, 128)
    if not text:
        return ""
    if not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", text):
        return ""
    return text


def clean_lobby_id(value):
    """A per-hosting-session directory key, distinct from the public room id."""
    text = clean_text(value, 96)
    if not text:
        return ""
    if not re.fullmatch(r"[A-Za-z0-9._:-]{1,96}", text):
        return ""
    return text


# ---------------------------------------------------------------------------
# Directory
# ---------------------------------------------------------------------------

class DirectoryError(Exception):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)


def capability_hash(secret):
    # Fixed-size comparison; credentials are never logged or listed.
    if not isinstance(secret, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', secret):
        return ''
    return hashlib.sha256(secret.encode('ascii')).hexdigest()


class Registry:
    """Thread-safe table of live lobbies, keyed by a stable id."""

    def __init__(self, ttl_p2p, ttl_dedicated, max_entries):
        self._lock = threading.Lock()
        self._entries = {}
        self._ttl_p2p = ttl_p2p
        self._ttl_dedicated = ttl_dedicated
        self._max = max_entries
        self._writes = RateLimiter(60, 30)

    def _ttl(self, entry):
        if entry.get("kind") == "dedicated":
            return self._ttl_dedicated
        return self._ttl_p2p

    def prune_locked(self, now):
        stale = [key for key, entry in self._entries.items()
                 if now - entry["seen"] > self._ttl(entry)]
        for key in stale:
            del self._entries[key]
        return len(stale)

    def upsert(self, entry, secret=None, source_ip='', allow_create=True):
        """Atomically create or authenticate an update; never trust public ids."""
        now = time.time()
        entry["seen"] = now
        entry["id"] = entry["id"][:160]
        with self._lock:
            self.prune_locked(now)
            key = entry["id"]
            previous = self._entries.get(key)
            issued = None
            if previous:
                supplied = capability_hash(secret)
                if not supplied or not hmac.compare_digest(supplied, previous.get('_secret_hash', '')):
                    raise DirectoryError(403, 'invalid lobby capability')
                if previous['kind'] != entry['kind']:
                    raise DirectoryError(409, 'lobby kind cannot change')
                if not self._writes.allow(key):
                    raise DirectoryError(429, 'lobby update rate limited')
                entry['_secret_hash'] = previous['_secret_hash']
                entry['_source_ip'] = previous.get('_source_ip', source_ip)
            else:
                if not allow_create or secret:
                    raise DirectoryError(403, 'lobby capability expired or unknown')
                if len(self._entries) >= self._max:
                    raise DirectoryError(503, 'directory full')
                if sum(row.get('_source_ip') == source_ip for row in self._entries.values()) >= MAX_PER_IP:
                    raise DirectoryError(429, 'too many lobbies from this address')
                issued = secrets.token_urlsafe(32)
                entry['_secret_hash'] = capability_hash(issued)
                entry['_source_ip'] = source_ip
            entry["firstSeen"] = previous.get('firstSeen', now) if previous else now
            self._entries[key] = entry
        result = {'ok': True, 'id': key, 'ownershipVersion': OWNERSHIP_VERSION}
        if issued:
            result['lobby_secret'] = issued
        return result

    def remove(self, entry_id, secret=None):
        with self._lock:
            self.prune_locked(time.time())
            row = self._entries.get(entry_id)
            supplied = capability_hash(secret)
            if not row or not supplied or not hmac.compare_digest(supplied, row.get('_secret_hash', '')):
                raise DirectoryError(403, 'invalid lobby capability')
            del self._entries[entry_id]
            return 1

    def public(self):
        """Prune, then return the list clients are allowed to see."""
        now = time.time()
        with self._lock:
            self.prune_locked(now)
            out = []
            for entry in self._entries.values():
                if entry.get("locked"):
                    continue
                allowed = ('id', 'kind', 'peerId', 'name', 'host', 'players', 'maxPlayers',
                           'room', 'version', 'locked', 'tags', 'adult')
                row = {k: entry[k] for k in allowed if k in entry}
                if entry.get('kind') == 'dedicated':
                    row.update(ip=entry.get('ip', ''), port=entry.get('port', 0))
                row['ownershipVersion'] = OWNERSHIP_VERSION
                row["age"] = int(now - entry.get("firstSeen", now))
                out.append(row)
        # Busiest and oldest lobbies first: they are the most useful to join.
        out.sort(key=lambda e: (-int(e.get("players", 0)), -int(e.get("age", 0))))
        return out

    def totals(self):
        now = time.time()
        with self._lock:
            self.prune_locked(now)
            players = sum(int(e.get("players", 0)) for e in self._entries.values())
            p2p = sum(1 for e in self._entries.values() if e.get("kind") == "p2p")
            dedicated = sum(1 for e in self._entries.values() if e.get("kind") == "dedicated")
            return {
                "servers": len(self._entries),
                "p2p": p2p,
                "dedicated": dedicated,
                "players": players,
            }

    def export(self):
        now = time.time()
        with self._lock:
            self.prune_locked(now)
            return list(self._entries.values())

    def import_entries(self, entries):
        if not isinstance(entries, list):
            return
        for entry in entries[: self._max]:
            if (not isinstance(entry, dict) or not entry.get("id") or
                    not re.fullmatch(r'[0-9a-f]{64}', str(entry.get('_secret_hash', '')))):
                continue
            # Everything restored from disk starts near-death; the owner must
            # re-register to keep it alive.
            entry["seen"] = time.time() - self._ttl(entry) + 5
            self._entries[entry["id"]] = entry


# ---------------------------------------------------------------------------
# Persistence (best effort, purely a nicety across restarts)
# ---------------------------------------------------------------------------

class Persister:
    def __init__(self, path, registry):
        self.path = path
        self.registry = registry
        self._dirty = threading.Event()
        self._stop = threading.Event()
        self._thread = None

    def start(self):
        if not self.path:
            return
        self._load()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        atexit.register(self._save)

    def _load(self):
        try:
            with open(self.path, "r", encoding="utf-8") as handle:
                self.registry.import_entries(json.load(handle))
            log("restored", self.path)
        except FileNotFoundError:
            pass
        except Exception as exc:  # noqa: BLE001 - never let persistence kill us
            log("could not restore state:", exc)

    def mark_dirty(self):
        self._dirty.set()

    def _loop(self):
        while not self._stop.wait(5.0):
            if self._dirty.is_set():
                self._dirty.clear()
                self._save()

    def _save(self):
        if not self.path:
            return
        try:
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as handle:
                json.dump(self.registry.export(), handle)
            os.replace(tmp, self.path)
        except Exception as exc:  # noqa: BLE001
            log("could not save state:", exc)


# ---------------------------------------------------------------------------
# Historical analytics
# ---------------------------------------------------------------------------

class History:
    """Sampled live-player history, persisted as compact daily aggregates.

    The master server only knows about currently listed lobbies, so a small
    background sampler turns those snapshots into daily peak/average rows.
    Daily rows are cheap to keep for several years and can be grouped into
    weekly, monthly and yearly graphs on demand.
    """

    SAMPLE_SECONDS = 30
    SAVE_SECONDS = 60
    KEEP_DAYS = 365 * 6

    def __init__(self, path, registry):
        self.path = path
        self.registry = registry
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None
        self._dirty = False
        self._last_save = 0.0
        self.days = {}
        self.started = time.time()

    def start(self):
        self._load()
        self.snapshot()
        if self.path:
            atexit.register(self._save)
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _load(self):
        if not self.path:
            return
        try:
            with open(self.path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            days = data.get("days", {}) if isinstance(data, dict) else {}
            if isinstance(days, dict):
                self.days = {str(k): v for k, v in days.items() if isinstance(v, dict)}
            log("restored analytics", self.path)
        except FileNotFoundError:
            pass
        except Exception as exc:  # noqa: BLE001 - never let analytics kill the directory
            log("could not restore analytics:", exc)

    def snapshot(self):
        now = time.time()
        totals = self.registry.totals()
        day = time.strftime("%Y-%m-%d", time.gmtime(now))
        with self._lock:
            row = self.days.setdefault(day, {
                "peakPlayers": 0, "sumPlayers": 0, "samples": 0,
                "peakServers": 0, "sumServers": 0,
            })
            players = int(totals.get("players", 0))
            servers = int(totals.get("servers", 0))
            row["peakPlayers"] = max(int(row.get("peakPlayers", 0)), players)
            row["sumPlayers"] = int(row.get("sumPlayers", 0)) + players
            row["samples"] = int(row.get("samples", 0)) + 1
            row["peakServers"] = max(int(row.get("peakServers", 0)), servers)
            row["sumServers"] = int(row.get("sumServers", 0)) + servers
            cutoff = (datetime.datetime.now(datetime.timezone.utc).date()
                      - datetime.timedelta(days=self.KEEP_DAYS)).isoformat()
            self.days = {k: v for k, v in self.days.items() if k >= cutoff}
            self._dirty = True
        return totals

    def _loop(self):
        while not self._stop.wait(self.SAMPLE_SECONDS):
            try:
                self.snapshot()
                if self._dirty and time.time() - self._last_save >= self.SAVE_SECONDS:
                    self._save()
            except Exception as exc:  # noqa: BLE001
                log("analytics sample failed:", exc)

    def _save(self):
        if not self.path:
            return
        try:
            with self._lock:
                payload = {"version": 1, "started": self.started, "days": dict(self.days)}
                self._dirty = False
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, separators=(",", ":"))
            os.replace(tmp, self.path)
            self._last_save = time.time()
        except Exception as exc:  # noqa: BLE001
            log("could not save analytics:", exc)

    @staticmethod
    def _day_rows(days, start, count):
        rows = []
        for offset in range(count):
            date = start - datetime.timedelta(days=count - 1 - offset)
            key = date.strftime("%Y-%m-%d")
            row = days.get(key, {})
            samples = int(row.get("samples", 0))
            rows.append({
                "date": key,
                "label": date.strftime("%a") if count <= 7 else date.strftime("%b %d"),
                "players": int(row.get("peakPlayers", 0)),
                "average": round(int(row.get("sumPlayers", 0)) / samples, 1) if samples else 0,
                "servers": int(row.get("peakServers", 0)),
            })
        return rows

    def summary(self):
        now = time.time()
        today = datetime.datetime.now(datetime.timezone.utc).date()
        with self._lock:
            days = {k: dict(v) for k, v in self.days.items()}
        week = self._day_rows(days, today, 7)
        month = self._day_rows(days, today, 30)
        months = []
        for offset in range(11, -1, -1):
            month_index = today.year * 12 + today.month - 1 - offset
            year, month_number = divmod(month_index, 12)
            month_number += 1
            prefix = "%04d-%02d" % (year, month_number)
            rows = [v for k, v in days.items() if k.startswith(prefix)]
            samples = sum(int(v.get("samples", 0)) for v in rows)
            months.append({
                "date": prefix,
                "label": datetime.date(year, month_number, 1).strftime("%b %y"),
                "players": max([int(v.get("peakPlayers", 0)) for v in rows] or [0]),
                "average": round(sum(int(v.get("sumPlayers", 0)) for v in rows) / samples, 1) if samples else 0,
                "servers": max([int(v.get("peakServers", 0)) for v in rows] or [0]),
            })
        live = self.registry.totals()
        live.update(status="ok", uptime=int(now - self.started), time=int(now))
        return {
            "live": live,
            "week": week,
            "month": month,
            "year": months,
            "historyStart": min(days) if days else None,
            "sampledAt": int(now),
        }


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

class RateLimiter:
    def __init__(self, window, limit):
        self._window = window
        self._limit = limit
        self._lock = threading.Lock()
        self._hits = {}

    def allow(self, key):
        now = time.monotonic()
        with self._lock:
            if len(self._hits) >= 4096:
                for k in [k for k, v in self._hits.items() if not v or now - v[-1] > self._window]:
                    del self._hits[k]
                if key not in self._hits and len(self._hits) >= 4096:
                    return False
            bucket = self._hits.get(key)
            if bucket is None:
                bucket = self._hits[key] = deque()
            while bucket and now - bucket[0] > self._window:
                bucket.popleft()
            if len(bucket) >= self._limit:
                return False
            bucket.append(now)
            # Opportunistic cleanup so the map can't grow forever.
            if len(self._hits) > 4096:
                for k in [k for k, v in self._hits.items() if not v]:
                    del self._hits[k]
            return True


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

INDEX_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>HTML Fishing - Master Server</title>
<style>body{font-family:monospace;background:#12141a;color:#e8e6df;padding:32px}
h1{font-size:18px}b{color:#ffd76a}code{color:#8fd3ff}</style></head>
<body><h1>HTML Fishing - Master Server</h1>
<p>Status: <b>online</b></p>
<pre>%(totals)s</pre>
<p>Lobbies: <code>GET /list</code> &middot; Health: <code>GET /</code> &middot; <a href="/analytics">Live analytics</a></p>
</body></html>
"""


ANALYTICS_HTML = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HTML Fishing - Live Connections</title>
<style>
:root{color-scheme:dark;--bg:#101722;--panel:#182433;--line:#31465c;--text:#eaf6ff;--dim:#9cb5c9;--gold:#ffd36a;--teal:#6fe3d1;--red:#ff8a7a}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 20% 0%,#1d3852 0,#101722 55%);color:var(--text);font:14px/1.45 system-ui,sans-serif;padding:28px}
main{max-width:1180px;margin:auto}h1{font-size:28px;margin:0 0 4px}h1 span{color:var(--teal)}p.sub{margin:0 0 24px;color:var(--dim)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}.card{background:linear-gradient(145deg,#1d2e41,#162231);border:1px solid var(--line);border-radius:12px;padding:16px}.card b{display:block;font-size:27px;color:var(--gold);font-variant-numeric:tabular-nums}.card span{font-size:11px;color:var(--dim);letter-spacing:1px;text-transform:uppercase}
.panel{background:#152131cc;border:1px solid var(--line);border-radius:14px;padding:18px;margin:14px 0}.panelhead{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.panelhead h2{font-size:17px;margin:0}.tabs{display:flex;gap:6px}.tabs button{background:#203348;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:7px 13px;cursor:pointer}.tabs button[aria-pressed=true]{background:#39647e;border-color:#8fd3e8}
#chart{display:block;width:100%;height:340px}.legend{display:flex;gap:16px;color:var(--dim);font-size:12px;margin-top:8px}.legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px 8px;border-bottom:1px solid #2a3d50;text-align:left}th{color:var(--dim);font-size:10px;letter-spacing:1px;text-transform:uppercase}td.n{font-variant-numeric:tabular-nums;color:var(--gold)}.tag{display:inline-block;border:1px solid #4d6b82;border-radius:99px;padding:1px 7px;margin:1px 3px 1px 0;color:#b9d5e9;font-size:10px}.empty{color:var(--dim);text-align:center;padding:22px}.status{font-size:11px;color:var(--dim)}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--teal);margin-right:6px;box-shadow:0 0 9px var(--teal)}.err{color:var(--red)}
@media(max-width:600px){body{padding:14px}h1{font-size:22px}#chart{height:260px}th:nth-child(3),td:nth-child(3){display:none}}
</style></head><body><main>
<h1>HTML Fishing <span>Live Connections</span></h1>
<p class="sub"><span class="dot"></span><span id="status">Connecting to master server...</span></p>
<section class="cards">
<div class="card"><b id="players">-</b><span>Players online</span></div>
<div class="card"><b id="servers">-</b><span>Active lobbies</span></div>
<div class="card"><b id="p2p">-</b><span>Peer-hosted</span></div>
<div class="card"><b id="dedicated">-</b><span>Dedicated</span></div>
<div class="card"><b id="uptime">-</b><span>Uptime</span></div>
</section>
<section class="panel"><div class="panelhead"><h2>Concurrent players</h2><div class="tabs" role="group" aria-label="Graph range"><button type="button" data-range="week" aria-pressed="true">Weekly</button><button type="button" data-range="month" aria-pressed="false">Monthly</button><button type="button" data-range="year" aria-pressed="false">Yearly</button></div></div>
<canvas id="chart" aria-label="Concurrent player history graph"></canvas><div class="legend"><span><i style="background:var(--gold)"></i>Peak players</span><span><i style="background:var(--teal)"></i>Average players</span><span id="history-note" style="margin-left:auto"></span></div></section>
<section class="panel"><div class="panelhead"><h2>Live sessions</h2><span class="status" id="updated"></span></div><table><thead><tr><th>Lobby</th><th>Players</th><th>Type</th><th>Tags</th><th>Age</th></tr></thead><tbody id="lobbies"><tr><td colspan="5" class="empty">Loading...</td></tr></tbody></table></section>
</main><script>
const state={stats:null,range:'week',lobbies:[]};
const $=id=>document.getElementById(id);
function fmtTime(sec){sec=Math.max(0,Math.floor(sec||0));const d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60);if(d)return d+'d '+h+'h';if(h)return h+'h '+m+'m';return m+'m';}
function esc(v){return String(v==null?'':v);}
function setStatus(text,error=false){$('status').textContent=text;$('status').className=error?'err':'';}
async function refresh(){
 try{
  const [stats,lobbies]=await Promise.all([fetch('/stats',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}),fetch('/list',{cache:'no-store'}).then(r=>r.ok?r.json():[])]);
  state.stats=stats;state.lobbies=Array.isArray(lobbies)?lobbies:[];
  const live=stats.live||{};$('players').textContent=live.players||0;$('servers').textContent=live.servers||0;$('p2p').textContent=live.p2p||0;$('dedicated').textContent=live.dedicated||0;$('uptime').textContent=fmtTime(live.uptime);
  $('updated').textContent='Updated '+new Date().toLocaleTimeString();setStatus('Connected to master server');renderLobbies();drawChart();
 }catch(err){setStatus('Master server unreachable: '+err.message,true);}
}
function renderLobbies(){
 const body=$('lobbies');body.replaceChildren();
 if(!state.lobbies.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.className='empty';td.textContent='No active sessions right now.';tr.append(td);body.append(tr);return;}
 for(const row of state.lobbies.slice(0,50)){
  const tr=document.createElement('tr');const name=document.createElement('td');name.textContent=row.name||'Unnamed lobby';const players=document.createElement('td');players.className='n';players.textContent=(row.players||0)+' / '+(row.maxPlayers||'?');const type=document.createElement('td');type.textContent=row.kind==='dedicated'?'Dedicated':'Peer';const tags=document.createElement('td');for(const tag of row.tags||[]){const s=document.createElement('span');s.className='tag';s.textContent=tag;tags.append(s);}const age=document.createElement('td');age.textContent=fmtTime(row.age);tr.append(name,players,type,tags,age);body.append(tr);
 }
}
function drawChart(){
 const data=(state.stats&&state.stats[state.range])||[],canvas=$('chart'),ctx=canvas.getContext('2d');
 const dpr=Math.min(2,window.devicePixelRatio||1),w=canvas.clientWidth||800,h=canvas.clientHeight||340;
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const pad={l:44,r:16,t:18,b:32},cw=Math.max(1,w-pad.l-pad.r),ch=Math.max(1,h-pad.t-pad.b);
 const max=Math.max(1,...data.map(v=>Math.max(v.players||0,v.average||0))),nice=Math.max(4,Math.ceil(max/4)*4);
 ctx.font='11px system-ui';ctx.fillStyle='#9cb5c9';ctx.strokeStyle='#2a3d50';ctx.lineWidth=1;
 for(let i=0;i<=4;i++){const y=pad.t+ch*i/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText(String(Math.round(nice*(4-i)/4)),8,y+4);}
 if(!data.length){ctx.fillStyle='#9cb5c9';ctx.textAlign='center';ctx.fillText('No history sampled yet.',w/2,h/2);ctx.textAlign='left';return;}
 const xAt=i=>pad.l+(data.length<=1?cw/2:cw*i/(data.length-1)),yAt=v=>pad.t+ch*(1-(v||0)/nice);
 const line=(key,color)=>{ctx.beginPath();ctx.lineWidth=2.2;ctx.strokeStyle=color;data.forEach((v,i)=>{const x=xAt(i),y=yAt(v[key]);if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();if(data.length<20)data.forEach((v,i)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(xAt(i),yAt(v[key]),2.4,0,Math.PI*2);ctx.fill();});};
 line('average','#6fe3d1');line('players','#ffd36a');
 ctx.fillStyle='#9cb5c9';ctx.textAlign='center';const step=Math.max(1,Math.ceil(data.length/8));data.forEach((v,i)=>{if(i%step&&i!==data.length-1)return;ctx.fillText(v.label,xAt(i),h-10);});ctx.textAlign='left';
 $('history-note').textContent=(state.stats.historyStart?'History since '+state.stats.historyStart:'History starts with the first sample')+' · UTC days';
}
document.querySelectorAll('[data-range]').forEach(button=>button.onclick=()=>{state.range=button.dataset.range;document.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));drawChart();});
addEventListener('resize',drawChart);refresh();setInterval(refresh,5000);
</script></body></html>"""


class MasterHandler(BaseHTTPRequestHandler):
    server_version = "HTMLFishingMaster"
    sys_version = ''
    protocol_version = "HTTP/1.1"

    registry = None
    persister = None
    history = None
    limiter = None
    started_at = time.time()
    # Only trust forwarded addresses from explicitly configured reverse proxies.
    # Example: MASTER_TRUSTED_PROXIES=127.0.0.1,::1 for a local tunnel/proxy.
    trusted_proxies = frozenset(v.strip() for v in os.environ.get('MASTER_TRUSTED_PROXIES', '').split(',') if v.strip())

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    # -- plumbing ----------------------------------------------------------

    def log_message(self, fmt, *args):  # noqa: A003 - name required by base class
        log("%s %s" % (self.address_string(), fmt % args))

    def _client_ip(self):
        # Behind a reverse proxy the real address is in X-Forwarded-For.
        forwarded = self.headers.get("X-Forwarded-For")
        if forwarded and self.client_address[0] in self.trusted_proxies:
            try:
                return str(ipaddress.ip_address(forwarded.split(",")[-1].strip()))
            except ValueError:
                pass
        return self.client_address[0] if self.client_address else "?"

    def _send(self, code, payload, content_type="application/json"):
        if isinstance(payload, (bytes, bytearray)):
            body = bytes(payload)
        else:
            body = json.dumps(payload).encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.send_header("Cache-Control", "no-store")
            self.send_header('X-Content-Type-Options', 'nosniff')
            if code == 429:
                self.send_header('Retry-After', '60')
            if self.close_connection:
                self.send_header('Connection', 'close')
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _read_json(self):
        if self.headers.get('Transfer-Encoding'):
            raise DirectoryError(400, 'transfer encoding not supported')
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            raise DirectoryError(400, 'invalid content length')
        if length > MAX_BODY:
            raise DirectoryError(413, 'request too large')
        if length <= 0:
            raise DirectoryError(400, 'JSON body required')
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise DirectoryError(400, 'incomplete request body')
        try:
            data = json.loads(raw.decode("utf-8", "replace"))
        except Exception:  # noqa: BLE001
            return None
        def bounded(value, depth=0):
            if depth > 8:
                return False
            if isinstance(value, dict):
                return len(value) <= 64 and all(bounded(v, depth+1) for v in value.values())
            if isinstance(value, list):
                return len(value) <= 64 and all(bounded(v, depth+1) for v in value)
            return not isinstance(value, str) or len(value) <= 4096
        return data if isinstance(data, dict) and bounded(data) else None

    def _rate_ok(self):
        return self.limiter is None or self.limiter.allow(self._client_ip())

    # -- verbs -------------------------------------------------------------

    def do_OPTIONS(self):  # noqa: N802
        self._send(204, b"")

    def do_GET(self):  # noqa: N802
        if not self._rate_ok():
            return self._send(429, {"error": "rate limited"})

        path = self.path.split("?", 1)[0].rstrip("/") or "/"

        if path == "/analytics":
            return self._send(200, ANALYTICS_HTML.encode("utf-8"), "text/html; charset=utf-8")

        if path == "/stats":
            if self.history:
                return self._send(200, self.history.summary())
            totals = self.registry.totals()
            totals.update(status="ok", uptime=int(time.time() - self.started_at), time=int(time.time()))
            return self._send(200, {"live": totals, "week": [], "month": [], "year": [], "historyStart": None})

        if path in ("/", "/health", "/status"):
            totals = self.registry.totals()
            totals["status"] = "ok"
            totals["uptime"] = int(time.time() - self.started_at)
            totals["time"] = int(time.time())
            totals['ownershipVersion'] = OWNERSHIP_VERSION
            accept = self.headers.get("Accept", "")
            if path == "/" and "text/html" in accept:
                html = INDEX_HTML % {"totals": json.dumps(totals, indent=2)}
                return self._send(200, html.encode("utf-8"), "text/html; charset=utf-8")
            return self._send(200, totals)

        if path == "/list":
            # Bare array: matches the original master server contract.
            return self._send(200, self.registry.public())

        if path == "/servers":
            servers = self.registry.public()
            totals = self.registry.totals()
            return self._send(200, {
                "servers": servers,
                "count": len(servers),
                "players": totals["players"],
                "time": int(time.time()),
            })

        return self._send(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        if not self._rate_ok():
            self.close_connection = True
            return self._send(429, {"error": "rate limited"})
        try:
            body = self._read_json()
            return self._dispatch_post(body)
        except DirectoryError as exc:
            self.close_connection = True
            return self._send(exc.status, {'error': str(exc)})
        except (TimeoutError, socket.timeout):
            self.close_connection = True
            return self._send(408, {'error': 'request timed out'})

    def _dispatch_post(self, body):
        if body is None:
            return self._send(400, {"error": "invalid json body"})

        path = self.path.split("?", 1)[0].rstrip("/") or "/"

        if path == "/register":
            return self._handle_register(body)
        if path in ("/heartbeat", "/dedicated"):
            return self._handle_heartbeat(body)
        if path == "/unregister":
            return self._handle_unregister(body)

        return self._send(404, {"error": "not found"})

    def _capability(self, body):
        auth = self.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            return auth[7:]
        return body.get('lobby_secret')

    # -- handlers ----------------------------------------------------------

    def _handle_register(self, body):
        peer_id = clean_peer_id(body.get("peerId"))
        if not peer_id or body.get('peerId') != peer_id:
            return self._send(400, {"error": "peerId required"})

        # Prefer a stable device key so re-hosting replaces our old row. Fall
        # back to the room id for older clients that don't send one.
        lobby_id = clean_lobby_id(body.get('lobbyId') or body.get('id'))
        if (not lobby_id or (body.get('id') is not None and body['id'] != lobby_id) or
                (body.get('lobbyId') is not None and body['lobbyId'] != lobby_id) or
                (body.get('room') is not None and body['room'] != peer_id)):
            return self._send(400, {'error': 'inconsistent lobby identity'})

        host = clean_text(body.get("host") or body.get("hostName"), 16)
        name = clean_text(body.get("name"), 40)
        if not name:
            name = (host + "'s Lobby") if host else "Fishing Lobby"

        entry = {
            "id": lobby_id or ("p2p:" + peer_id),
            "kind": "p2p",
            "peerId": peer_id,
            "name": name,
            "host": host,
            "players": clean_int(body.get("players"), 1, 0, 128),
            "maxPlayers": clean_int(body.get("maxPlayers"), 0, 0, 128),
            "room": peer_id,
            "version": clean_text(body.get("version"), 24),
            "locked": clean_bool(body.get("locked")),
            "tags": clean_tags(body.get("tags")),
            "adult": clean_bool(body.get("adult")),
            "ip": "",
            "port": 0,
        }
        stored = self.registry.upsert(entry, self._capability(body), self._client_ip())
        if self.persister:
            self.persister.mark_dirty()
        return self._send(200, stored)

    def _handle_heartbeat(self, body):
        if body.get('kind') == 'p2p' or body.get('lobbyId'):
            # Heartbeats cannot silently recreate an expired row.
            key = clean_lobby_id(body.get('lobbyId') or body.get('id'))
            if not key or not self._capability(body):
                raise DirectoryError(403, 'lobby capability required')
            return self._handle_register(body)
        ip = clean_host(body.get("ip") or body.get("host"))
        port = clean_int(body.get("port"), 0, 0, 65535)
        if not ip or not port:
            return self._send(400, {"error": "ip and port required"})

        entry_id = clean_lobby_id(body.get('id')) or ("dedicated:%s:%d" % (ip, port))
        entry = {
            "id": entry_id,
            "kind": "dedicated",
            "peerId": clean_peer_id(body.get("peerId")),
            "name": clean_text(body.get("name"), 40) or "Dedicated Server",
            "host": clean_text(body.get("host"), 16),
            "players": clean_int(body.get("players"), 0, 0, 999),
            "maxPlayers": clean_int(body.get("maxPlayers"), 0, 0, 999),
            "ip": ip,
            "port": port,
            "room": "",
            "version": clean_text(body.get("version"), 24),
            "locked": clean_bool(body.get("locked")),
            "tags": clean_tags(body.get("tags")),
            "adult": clean_bool(body.get("adult")),
        }
        result = self.registry.upsert(entry, self._capability(body), self._client_ip())
        if self.persister:
            self.persister.mark_dirty()
        return self._send(200, result)

    def _handle_unregister(self, body):
        entry_id = clean_text(body.get("id") or body.get("lobbyId"), 160)
        if not entry_id or (body.get('id') and body.get('lobbyId') and body['id'] != body['lobbyId']):
            return self._send(400, {'error': 'lobby id required'})
        removed = self.registry.remove(entry_id, self._capability(body))
        if removed and self.persister:
            self.persister.mark_dirty()
        return self._send(200, {"status": "ok", "removed": removed})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def build_parser():
    parser = argparse.ArgumentParser(description="HTML Fishing master server")
    parser.add_argument("--host", default=os.environ.get("MASTER_HOST", DEFAULT_HOST),
                        help="interface to bind (default %(default)s)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("MASTER_PORT", DEFAULT_PORT)),
                        help="port to listen on (default %(default)s)")
    parser.add_argument("--ttl-p2p", type=int,
                        default=int(os.environ.get("MASTER_TTL_P2P", DEFAULT_TTL_P2P)),
                        help="seconds a P2P lobby lives without a refresh")
    parser.add_argument("--ttl-dedicated", type=int,
                        default=int(os.environ.get("MASTER_TTL_DEDICATED", DEFAULT_TTL_DEDICATED)),
                        help="seconds a dedicated server lives without a heartbeat")
    parser.add_argument("--max", type=int, default=int(os.environ.get("MASTER_MAX", MAX_ENTRIES)),
                        help="maximum number of listed lobbies")
    parser.add_argument("--data", default=os.environ.get("MASTER_DATA", "master_state.json"),
                        help="state file ('' to disable persistence)")
    parser.add_argument("--history", default=os.environ.get("MASTER_HISTORY", "master_history.json"),
                        help="historical analytics file ('' to keep in memory only)")
    parser.add_argument("--quiet", action="store_true", help="less logging")
    return parser


def main(argv=None):
    global VERBOSE
    args = build_parser().parse_args(argv)
    VERBOSE = not args.quiet

    registry = Registry(args.ttl_p2p, args.ttl_dedicated, args.max)
    limiter = RateLimiter(RATE_WINDOW, RATE_MAX)

    handler = type("BoundMasterHandler", (MasterHandler,), {
        "registry": registry,
        "limiter": limiter,
        "started_at": time.time(),
    })

    handler.persister = None
    if args.data:
        persister = Persister(os.path.abspath(args.data), registry)
        persister.start()
        handler.persister = persister

    history = History(os.path.abspath(args.history) if args.history else '', registry)
    history.start()
    handler.history = history

    try:
        httpd = ThreadingHTTPServer((args.host, args.port), handler)
    except OSError as exc:
        log("could not bind %s:%s -> %s" % (args.host, args.port, exc))
        return 1

    httpd.daemon_threads = True
    hostname = socket.gethostname()
    log("listening on http://%s:%d  (host: %s)" % (args.host, args.port, hostname))
    log("point the game at:  MASTER_SERVER_URL = 'http://<this-machine-ip>:%d'" % args.port)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        log("shutting down")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
