'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const L = require('../lib/ledger'); const LB = require('../lib/leaderboard');

function key() { // throwaway in-memory key, never written to disk
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { privateKey, pub: publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('base64') };
}
function build() {
  const k = key(); const log = [];
  log.push(L.makeGrant(log, { from: 'a', to: 'x/y', amount: 5, reason: 'saved me a week' }, k));
  log.push(L.makeGrant(log, { from: 'b', to: 'x/y', amount: 10, reason: 'toolchain' }, k));
  log.push(L.makeGrant(log, { from: 'a', to: 'z', amount: 3, reason: 'docs' }, k));
  return log;
}

test('ranks recipients by verified total, lit when all verify', () => {
  const b = LB.rank(build());
  assert.equal(b.ok, true); assert.equal(b.verified, 3);
  assert.deepEqual(b.rows.map(r => [r.to.id, r.total, r.grants.length]), [['x/y', 15, 2], ['z', 3, 1]]);
  assert.equal(b.rows[0].slug, 'repo-x--y');
});

test('tampered grants are not counted and board is dark', () => {
  const log = build(); log[1] = { ...log[1], amount: 99 };
  const b = LB.rank(log);
  assert.equal(b.ok, false); assert.equal(b.verified, 2);
  assert.deepEqual(b.rows.map(r => [r.to.id, r.total]), [['x/y', 5], ['z', 3]]);
  assert.match(LB.leaderboardHtml(b, { scanUrl: 'https://s/' }), /class="dark"/);
});

test('badge svg and snippet', () => {
  const svg = LB.badgeSvg(42);
  assert.match(svg, /^<svg/); assert.match(svg, />credit</); assert.match(svg, />42</);
  const r = LB.rank(build()).rows[0];
  assert.equal(LB.snippet(r, 'https://s/'), '[![credit](https://s/badge/repo-x--y.svg)](https://s/leaderboard.html#repo-x--y)');
  const html = LB.leaderboardHtml(LB.rank(build()), { scanUrl: 'https://s/' });
  assert.match(html, /id="repo-x--y"/); assert.match(html, /saved me a week/); assert.doesNotMatch(html, /\b(green|red)\b/i);
});
