const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('Master Server Code/master_server.py', 'utf8');
const analytics = source.match(/ANALYTICS_HTML = r"""([\s\S]*?)"""/);

test('master server exposes live analytics and history endpoints', () => {
  assert.match(source, /class History:/);
  assert.match(source, /SAMPLE_SECONDS = 30/);
  assert.match(source, /if path == "\/analytics":/);
  assert.match(source, /if path == "\/stats":/);
  assert.match(source, /self\._send\(200, ANALYTICS_HTML\.encode\("utf-8"\), "text\/html; charset=utf-8"\)/);
  assert.match(source, /parser\.add_argument\("--history"/);
  assert.match(source, /history = History\(/);
  assert.match(source, /handler\.history = history/);
});

test('history summary provides weekly, monthly and yearly buckets', () => {
  assert.match(source, /week = self\._day_rows\(days, today, 7\)/);
  assert.match(source, /month = self\._day_rows\(days, today, 30\)/);
  assert.match(source, /for offset in range\(11, -1, -1\):/);
  assert.match(source, /"week": week,/);
  assert.match(source, /"month": month,/);
  assert.match(source, /"year": months,/);
  assert.match(source, /"historyStart": min\(days\) if days else None/);
});

test('analytics dashboard renders live cards, session table and three graph ranges', () => {
  assert.ok(analytics, 'ANALYTICS_HTML is present');
  const html = analytics[1];
  assert.ok(!html.includes('\\"'), 'HTML attributes are not JSON escaped');
  assert.ok(html.includes('<canvas id="chart"'));
  for (const label of ['Players online', 'Active lobbies', 'Peer-hosted', 'Dedicated']) {
    assert.ok(html.includes(label), `${label} card is present`);
  }
  for (const range of ['week', 'month', 'year']) {
    assert.ok(html.includes(`data-range="${range}"`), `${range} range button is present`);
  }
  assert.ok(html.includes('Live sessions'));
  assert.ok(html.includes("fetch('/stats'"));
  assert.ok(html.includes("fetch('/list'"));
});

test('analytics dashboard script parses as JavaScript', () => {
  const html = analytics[1];
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'dashboard script is present');
  assert.doesNotThrow(() => new Function(script[1]));
});
