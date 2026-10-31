"""Isolated directory tests. No production hosts or listings are contacted."""
import concurrent.futures
import http.client
import importlib.util
import json
import pathlib
import threading
import time
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('fishing_master', ROOT / 'Master Server Code' / 'master_server.py')
master = importlib.util.module_from_spec(spec)
spec.loader.exec_module(master)
master.VERBOSE = False


class OwnershipHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.handler = type('TestHandler', (master.MasterHandler,), {'registry': None, 'persister': None, 'limiter': None, 'trusted_proxies': frozenset()})
        cls.server = master.ThreadingHTTPServer(('127.0.0.1', 0), cls.handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.registry = self.handler.registry = master.Registry(60, 120, 500)
        self.handler.limiter = None

    def request(self, path, body=None, headers=None, raw=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        headers = {'Content-Type': 'text/plain', **(headers or {})}
        conn.request('GET' if body is None and raw is None else 'POST', path,
                     json.dumps(body) if raw is None and body is not None else raw, headers)
        response = conn.getresponse()
        status, data, reply_headers = response.status, json.loads(response.read() or b'null'), dict(response.getheaders())
        conn.close()
        return status, data, reply_headers

    def register(self, **changes):
        body = {'id': 'lobby:test', 'lobbyId': 'lobby:test', 'kind': 'p2p',
                'peerId': 'fish-owner', 'room': 'fish-owner', 'name': 'Owner', 'players': 1,
                'locked': False, 'tags': ['Chill'], 'adult': False}
        body.update(changes)
        return self.request('/register', body)

    def test_create_update_heartbeat_and_authenticated_beacon_removal(self):
        status, created, _ = self.register()
        self.assertEqual(status, 200)
        secret = created['lobby_secret']
        self.assertEqual(len(secret), 43)
        self.assertEqual(created['ownershipVersion'], 1)
        status, updated, _ = self.register(name='Renamed', lobby_secret=secret)
        self.assertEqual(status, 200)
        self.assertNotIn('lobby_secret', updated)
        status, _, _ = self.request('/heartbeat', {'kind': 'p2p', 'id': 'lobby:test', 'peerId': 'fish-owner', 'lobby_secret': secret})
        self.assertEqual(status, 200)
        status, data, _ = self.request('/unregister', {'id': 'lobby:test', 'lobby_secret': secret})
        self.assertEqual((status, data['removed']), (200, 1))
        self.assertEqual(self.registry.public(), [])

    def test_public_identifiers_never_authorize_takeover_or_delete(self):
        _, created, _ = self.register()
        for secret in (None, 'wrong', master.secrets.token_urlsafe(32)):
            args = {} if secret is None else {'lobby_secret': secret}
            status, _, _ = self.register(peerId='fish-attacker', room='fish-attacker', name='Hijacked', **args)
            self.assertEqual(status, 403)
            status, _, _ = self.request('/unregister', {'id': created['id'], 'peerId': 'fish-owner', **args})
            self.assertEqual(status, 403)
            self.assertEqual(self.registry.public()[0]['peerId'], 'fish-owner')
        self.assertEqual(self.request('/unregister', {'peerId': 'fish-owner'})[0], 400)
        # A different write endpoint cannot overwrite a protected P2P id either.
        self.assertEqual(self.request('/dedicated', {'id': created['id'], 'ip': '127.0.0.1', 'port': 8000})[0], 403)

    def test_valid_capability_can_move_its_peer_and_bearer_header_works(self):
        _, created, _ = self.register()
        status, _, _ = self.request('/register', {'id': created['id'], 'peerId': 'fish-new', 'room': 'fish-new'},
                                    {'Authorization': 'Bearer ' + created['lobby_secret']})
        self.assertEqual(status, 200)
        self.assertEqual(self.registry.public()[0]['peerId'], 'fish-new')

    def test_secret_cannot_authorize_another_lobby_or_recreate_deleted_identity(self):
        _, a, _ = self.register()
        _, b, _ = self.register(id='lobby:second', lobbyId='lobby:second')
        self.assertEqual(self.register(lobby_secret=b['lobby_secret'])[0], 403)
        self.assertEqual(self.request('/unregister', {'id': b['id'], 'lobby_secret': a['lobby_secret']})[0], 403)
        self.request('/unregister', {'id': a['id'], 'lobby_secret': a['lobby_secret']})
        self.assertEqual(self.register(lobby_secret=a['lobby_secret'])[0], 403)
        status, fresh, _ = self.register()
        self.assertEqual(status, 200)
        self.assertNotEqual(fresh['lobby_secret'], a['lobby_secret'])

    def test_public_list_and_servers_never_disclose_capabilities_or_internal_fields(self):
        _, created, _ = self.register()
        for endpoint in ('/list', '/servers'):
            status, data, headers = self.request(endpoint)
            self.assertEqual(status, 200)
            encoded = json.dumps(data)
            for forbidden in (created['lobby_secret'], '_secret_hash', '_source_ip', 'lobby_secret', '127.0.0.1'):
                self.assertNotIn(forbidden, encoded)
            self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(self.request('/health')[1]['ownershipVersion'], 1)

    def test_locked_lobbies_stay_hidden_and_fields_are_bounded(self):
        _, created, _ = self.register(locked=True, name='x'*100, tags=['Chill', 'made-up', '<script>'], players=99999)
        self.assertEqual(self.registry.public(), [])
        self.register(locked=False, lobby_secret=created['lobby_secret'], name='x'*100,
                      tags=['Chill', 'made-up', '<script>'], players=99999)
        row = self.registry.public()[0]
        self.assertEqual(len(row['name']), 40)
        self.assertEqual(row['players'], 128)
        self.assertEqual(row['tags'], ['Chill'])

    def test_oversized_deep_malformed_and_inconsistent_requests_are_rejected(self):
        self.assertEqual(self.request('/register', raw='x'*(master.MAX_BODY+1))[0], 413)
        self.assertEqual(self.request('/register', raw='{"deep":'+ '['*20+'0'+']'*20+'}')[0], 400)
        self.assertEqual(self.request('/register', raw='not json')[0], 400)
        self.assertEqual(self.register(lobbyId='lobby:other')[0], 400)
        self.assertEqual(self.register(room='fish-attacker')[0], 400)
        self.assertEqual(self.register(peerId='fish-owner<script>')[0], 400)

    def test_parallel_first_registration_has_only_one_owner(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda i: self.register(peerId='fish-'+str(i), room='fish-'+str(i)), range(8)))
        self.assertEqual(sum(r[0] == 200 for r in results), 1)
        self.assertEqual(sum(r[0] == 403 for r in results), 7)

    def test_limits_cannot_be_evaded_using_untrusted_forwarded_headers(self):
        for i in range(master.MAX_PER_IP):
            self.assertEqual(self.register(id='lobby:'+str(i), lobbyId='lobby:'+str(i))[0], 200)
        self.assertEqual(self.request('/register', {'id': 'lobby:excess', 'peerId': 'fish-new'},
                                      {'X-Forwarded-For': '203.0.113.9'})[0], 429)
        self.handler.limiter = master.RateLimiter(60, 1)
        self.assertEqual(self.request('/health')[0], 200)
        status, _, headers = self.request('/health', headers={'X-Forwarded-For': '203.0.113.10'})
        self.assertEqual(status, 429)
        self.assertEqual(headers['Retry-After'], '60')

    def test_dedicated_directory_entries_also_require_ownership(self):
        body = {'id': 'dedicated:test', 'ip': '127.0.0.1', 'port': 9000}
        status, result, _ = self.request('/heartbeat', body)
        self.assertEqual(status, 200)
        self.assertEqual(self.request('/heartbeat', {**body, 'ip': '203.0.113.50'})[0], 403)
        self.assertEqual(self.request('/heartbeat', {**body, 'lobby_secret': result['lobby_secret']})[0], 200)


class PersistenceTests(unittest.TestCase):
    def test_ownership_uses_capability_not_source_ip_and_failed_updates_do_not_refresh_ttl(self):
        registry = master.Registry(60, 120, 10)
        row = {'id': 'lobby:test', 'kind': 'p2p', 'peerId': 'fish-owner'}
        created = registry.upsert(row.copy(), source_ip='192.0.2.1')
        seen = registry.export()[0]['seen']
        for address in ('192.0.2.1', '203.0.113.1'):
            with self.assertRaises(master.DirectoryError):
                registry.upsert({**row, 'peerId': 'fish-attacker'}, source_ip=address)
            self.assertEqual(registry.export()[0]['seen'], seen)
        registry.upsert(row.copy(), created['lobby_secret'], source_ip='203.0.113.1')
        self.assertEqual(registry.public()[0]['peerId'], 'fish-owner')

    def test_expiry_invalidates_capability_and_legacy_rows_cannot_be_claimed(self):
        registry = master.Registry(1, 1, 10)
        row = {'id': 'lobby:test', 'kind': 'p2p', 'peerId': 'fish-owner'}
        created = registry.upsert(row.copy())
        with patch.object(master.time, 'time', return_value=time.time()+2):
            with self.assertRaises(master.DirectoryError):
                registry.upsert(row.copy(), created['lobby_secret'])
            fresh = registry.upsert(row.copy())
        self.assertNotEqual(created['lobby_secret'], fresh['lobby_secret'])
        exported = registry.export()
        self.assertNotIn(fresh['lobby_secret'], json.dumps(exported))
        loaded = master.Registry(60, 120, 10)
        loaded.import_entries([{'id': 'legacy', 'kind': 'p2p'}, *exported])
        self.assertEqual(len(loaded.export()), 1)
        with self.assertRaises(master.DirectoryError):
            loaded.upsert(row.copy())
        loaded.upsert(row.copy(), fresh['lobby_secret'])


if __name__ == '__main__':
    unittest.main()
