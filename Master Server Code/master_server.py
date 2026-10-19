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
  POST /register        Add/refresh a P2P lobby
  POST /heartbeat       Add/refresh a dedicated server
  POST /unregister      Remove a lobby by id or peerId
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
import ipaddress
import json
import os
import re
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
MAX_BODY = 64 * 1024          # largest accepted POST body

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
    except (TypeError, ValueError):
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
        if not re.fullmatch(r"[A-Za-z0-9 +&_-]{1,24}", tag):
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


# ---------------------------------------------------------------------------
# Directory
# ---------------------------------------------------------------------------

class Registry:
    """Thread-safe table of live lobbies, keyed by a stable id."""

    def __init__(self, ttl_p2p, ttl_dedicated, max_entries):
        self._lock = threading.Lock()
        self._entries = {}
        self._ttl_p2p = ttl_p2p
        self._ttl_dedicated = ttl_dedicated
        self._max = max_entries

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

    def upsert(self, entry):
        """Insert or refresh an entry. Returns the stored id, or None if full."""
        now = time.time()
        entry["seen"] = now
        entry["id"] = entry["id"][:160]
        with self._lock:
            self.prune_locked(now)
            key = entry["id"]
            if key not in self._entries and len(self._entries) >= self._max:
                return None
            entry["firstSeen"] = self._entries.get(key, {}).get("firstSeen", now)
            self._entries[key] = entry
        return key

    def remove(self, entry_id=None, peer_id=None):
        with self._lock:
            removed = 0
            if entry_id:
                if self._entries.pop(entry_id[:160], None) is not None:
                    removed += 1
            if peer_id:
                key = "p2p:" + peer_id
                if self._entries.pop(key, None) is not None:
                    removed += 1
            return removed

    def public(self):
        """Prune, then return the list clients are allowed to see."""
        now = time.time()
        with self._lock:
            self.prune_locked(now)
            out = []
            for entry in self._entries.values():
                if entry.get("locked"):
                    continue
                row = {k: v for k, v in entry.items() if k not in ("seen", "firstSeen")}
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
            if not isinstance(entry, dict) or not entry.get("id"):
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
<p>Lobbies: <code>GET /list</code> &middot; Health: <code>GET /</code></p>
</body></html>
"""


class MasterHandler(BaseHTTPRequestHandler):
    server_version = "HTMLFishingMaster/1.0"
    protocol_version = "HTTP/1.1"

    registry = None
    persister = None
    limiter = None
    started_at = time.time()

    # -- plumbing ----------------------------------------------------------

    def log_message(self, fmt, *args):  # noqa: A003 - name required by base class
        log("%s %s" % (self.address_string(), fmt % args))

    def _client_ip(self):
        # Behind a reverse proxy the real address is in X-Forwarded-For.
        forwarded = self.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
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
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _read_json(self):
        length = clean_int(self.headers.get("Content-Length"), 0, 0, MAX_BODY)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8", "replace"))
        except Exception:  # noqa: BLE001
            return None
        return data if isinstance(data, dict) else None

    def _rate_ok(self):
        return self.limiter is None or self.limiter.allow(self._client_ip())

    # -- verbs -------------------------------------------------------------

    def do_OPTIONS(self):  # noqa: N802
        self._send(204, b"")

    def do_GET(self):  # noqa: N802
        if not self._rate_ok():
            return self._send(429, {"error": "rate limited"})

        path = self.path.split("?", 1)[0].rstrip("/") or "/"

        if path in ("/", "/health", "/status"):
            totals = self.registry.totals()
            totals["status"] = "ok"
            totals["uptime"] = int(time.time() - self.started_at)
            totals["time"] = int(time.time())
            accept = self.headers.get("Accept", "")
            if path == "/" and "text/html" in accept:
                html = INDEX_HTML % {"totals": json.dumps(totals, indent=2)}
                return self._send(200, html, "text/html; charset=utf-8")
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
            return self._send(429, {"error": "rate limited"})

        body = self._read_json()
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

    # -- handlers ----------------------------------------------------------

    def _handle_register(self, body):
        peer_id = clean_peer_id(body.get("peerId") or body.get("id"))
        if not peer_id:
            return self._send(400, {"error": "peerId required"})

        host = clean_text(body.get("host") or body.get("hostName"), 16)
        name = clean_text(body.get("name"), 40)
        if not name:
            name = (host + "'s Lobby") if host else "Fishing Lobby"

        entry = {
            "id": "p2p:" + peer_id,
            "kind": "p2p",
            "peerId": peer_id,
            "name": name,
            "host": host,
            "players": clean_int(body.get("players"), 1, 0, 999),
            "maxPlayers": clean_int(body.get("maxPlayers"), 0, 0, 999),
            "room": clean_text(body.get("room"), 40) or peer_id,
            "version": clean_text(body.get("version"), 24),
            "locked": clean_bool(body.get("locked")),
            "tags": clean_tags(body.get("tags")),
            "adult": clean_bool(body.get("adult")),
            "ip": "",
            "port": 0,
        }
        stored = self.registry.upsert(entry)
        if self.persister:
            self.persister.mark_dirty()
        if stored is None:
            return self._send(503, {"error": "directory full"})
        log("register p2p", peer_id, "players=%s" % name)
        return self._send(200, {"ok": True, "id": peer_id})

    def _handle_heartbeat(self, body):
        ip = clean_host(body.get("ip") or body.get("host"))
        port = clean_int(body.get("port"), 0, 1, 65535)
        if not ip or not port:
            return self._send(400, {"error": "ip and port required"})

        entry_id = clean_text(body.get("id"), 160) or ("dedicated:%s:%d" % (ip, port))
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
        if self.registry.upsert(entry) is None:
            return self._send(503, {"error": "directory full"})
        if self.persister:
            self.persister.mark_dirty()
        return self._send(200, {"status": "ok", "id": entry_id})

    def _handle_unregister(self, body):
        entry_id = clean_text(body.get("id"), 160)
        peer_id = clean_peer_id(body.get("peerId"))
        if not entry_id and peer_id:
            entry_id = "p2p:" + peer_id
        removed = self.registry.remove(entry_id=entry_id or None, peer_id=peer_id or None)
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
