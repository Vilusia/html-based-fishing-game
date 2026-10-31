# Lobby directory ownership update

The directory and browser client must deploy together for game v12.480.
Updating `index.html` / `ui.js` alone does **not** repair an older master service.
The normal website deployment deliberately does not copy this private server
directory into the public web root.

## Deployment

1. Replace the Python file used by the running master service with this
   `master_server.py`, then restart that service. Keep it behind HTTPS through
   the existing reverse proxy/tunnel. Do not publish the Python file, state
   file or history file as static website assets.
2. Deploy the updated website (`core.js`, `ui.js`, and `index.html`). Hosts must
   refresh. Old hosts cannot update protected listings; there is no optional
   authentication/legacy bypass.
3. Check `GET /health`: it must include `"ownershipVersion": 1`. This is a
   read-only check, not a takeover test. The new client will keep room-code
   hosting available but will not publish listings through an older master.
4. Existing persisted rows without a capability hash are discarded at startup.
   Hosts create new per-session listing IDs; old crashed listings expire by TTL.
   Protected rows can retain their capability hash across restarts.

If running behind a local trusted reverse proxy, set
`MASTER_TRUSTED_PROXIES=127.0.0.1,::1` in the **service environment** only if those
are the actual proxy addresses. Forwarded client IPs are ignored by default.
The proxy must append or replace the forwarded address safely. IP addresses are
used for quotas and rate limits, never ownership authentication. Without proxy
configuration, a tunnel's requests share its IP quota.

## Protocol

- First `POST /register`: create a P2P listing using matching `id` / `lobbyId`
  and `peerId` / `room`. Response: `{ok, id, ownershipVersion:1, lobby_secret}`.
- Subsequent `/register` updates and P2P `/heartbeat` requests must include the
  same `lobby_secret`. The secret is not returned again on updates.
- `POST /unregister` requires the exact listing ID and capability, including
  requests sent through `sendBeacon`.
- `Authorization: Bearer <capability>` is also supported. The browser uses the
  JSON body so normal requests and unload beacons follow the same path.
- Dedicated `/heartbeat` / `/dedicated` publishers also receive a capability
  on first registration and must retain it for every subsequent update and
  unregister. Update external dedicated publishers before restarting them.
  No dedicated publisher source is included in this checkout.
- Expired/deleted capabilities cannot recreate listings. A host with a lost
  capability must register a fresh, random ID without credentials.

Capabilities have 256 bits of randomness. The server stores only SHA-256 hashes
and compares them in constant time. Public responses explicitly allowlist
fields, exclude all capability/hash/source-IP metadata, and disable caching.
Dedicated connection IP/port fields remain public because dedicated joins
need those endpoints; P2P rows do not expose address fields.

Requests are limited to 16 KiB, bounded JSON depth/collections, a fixed tag
vocabulary, and consistent identities. Existing per-address request limits are
supplemented with a 16-live-listing address quota and per-listing update limits.
Failed authentication never refreshes a listing's TTL. Capability possession
does not certify that a newly created lobby's display name or host is trustworthy.

## Analytics

`GET /analytics` serves a dependency-free live dashboard, and `GET /stats`
returns the same live totals plus graph buckets as JSON. The dashboard shows
current players, active lobbies, P2P/dedicated counts, live sessions and
weekly, monthly and yearly concurrent-player graphs.

The server samples lobby totals every 30 seconds into compact daily rows
(`peakPlayers`, `sumPlayers`, `samples`, `peakServers`, `sumServers`). Daily
rows are grouped on demand into the last 7 days, last 30 days and last 12
months. Daily buckets use UTC. History is persisted to `master_history.json` by default, or to the
path set with `--history` / `MASTER_HISTORY`; pass `--history ''` to keep it in
memory only. There is no historical backfill, so graphs begin with the first
sample after this version starts.

## Local verification

These tests start only an ephemeral localhost server and never contact the live
directory or modify real lobbies:

```powershell
python -m unittest discover -s tests -p test_lobby_ownership.py -v
node --test tests/lobby-ownership-client.test.cjs
```

For a manual staging check, use only a disposable listing you own. An update or
deletion without its capability must return 403 and leave its target unchanged.
No production takeover tests are needed to deploy this fix.
