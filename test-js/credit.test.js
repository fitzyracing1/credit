'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'credit-'));
process.env.CREDIT_HOME = path.join(tmp, 'home');
process.env.CREDIT_LEDGER = path.join(tmp, 'grants.jsonl');
process.env.CREDIT_KEYS = path.join(tmp, 'keys.json');
const L = require('../lib/ledger'); const R = require('../lib/recipient');
const rails = require('../rails'); const { main } = require('../cli/credit');
const run = async (...a) => { const lines = []; const code = await main(a, s => lines.push(s)); return { code, out: lines.join('\n') }; };

test('keygen keeps private key out of output and repo', async () => {
  const r = await run('keygen', '--as', 'tester');
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /PRIVATE KEY/);
  const st = fs.statSync(path.join(process.env.CREDIT_HOME, 'ed25519.key'));
  assert.equal(st.mode & 0o077, 0);
  assert.ok(JSON.parse(fs.readFileSync(process.env.CREDIT_KEYS)).tester.length === 1);
  await assert.rejects(run('keygen'), /exists/);
});

test('give is dry-run by default, appends signed grant, drafts PR+email', async () => {
  const r = await run('give', 'octo/demo', '5', '--for', 'great lib', '--email', 'a@example.com');
  assert.equal(r.code, 0);
  assert.match(r.out, /DRY-RUN/); assert.match(r.out, /CREDIT\.json/); assert.match(r.out, /Subject:/);
  assert.doesNotMatch(r.out, /PRIVATE KEY/);
  await run('give', 'octo', '2.5', '--for', 'help');
  const log = L.readLog(process.env.CREDIT_LEDGER);
  assert.equal(log.length, 2); assert.equal(log[1].prev, log[0].hash);
  assert.equal((await run('verify')).code, 0);
});

test('give --no-append does not write; validation errors', async () => {
  await run('give', 'octo', '1', '--for', 'x', '--no-append');
  assert.equal(L.readLog(process.env.CREDIT_LEDGER).length, 2);
  await assert.rejects(run('give', 'octo', '-1', '--for', 'x'), /positive/);
  await assert.rejects(run('give', 'octo', '1'), /reason/);
  await assert.rejects(run('give', 'bad user!', '1', '--for', 'x'), /bad github user/);
});

test('verify goes dark on tamper, reorder, wrong key', async () => {
  const log = L.readLog(process.env.CREDIT_LEDGER);
  const t1 = structuredClone(log); t1[0].amount = 999;
  assert.equal(L.verifyLog(t1).ok, false);
  assert.equal(L.verifyLog([log[1], log[0]]).ok, false);
  assert.equal(L.verifyLog(log, { tester: ['AAAA'] }).ok, false);
  assert.equal(L.verifyLog(log.slice(1)).ok, false); // truncating the head breaks the chain
  fs.appendFileSync(process.env.CREDIT_LEDGER, JSON.stringify(t1[0]) + '\n');
  const r = await run('verify'); assert.equal(r.code, 1); assert.match(r.out, /^dark/m);
  await assert.rejects(run('give', 'octo', '1', '--for', 'x'), /dark/);
  fs.writeFileSync(process.env.CREDIT_LEDGER, log.map(e => JSON.stringify(e)).join('\n') + '\n');
});

test('balances, CREDIT.json, badge, sync, site', async () => {
  const log = L.readLog(process.env.CREDIT_LEDGER);
  const c = R.creditJson(log, { type: 'repo', id: 'octo/demo' }, 'u');
  assert.equal(c.balance, 5); assert.equal(c.from.tester, 5);
  assert.deepEqual(R.shieldsBadge(log, { type: 'user', id: 'nobody' }).message, '0');
  const out = path.join(tmp, 'CREDIT.json');
  let r = await run('sync', '--repo', 'octo/demo', '--ledger', process.env.CREDIT_LEDGER, '--out', out);
  assert.match(r.out, /lit.*updated/);
  r = await run('sync', '--repo', 'octo/demo', '--ledger', process.env.CREDIT_LEDGER, '--out', out);
  assert.match(r.out, /unchanged/);
  const site = path.join(tmp, 'site');
  await run('site', '--out', site);
  assert.ok(fs.existsSync(path.join(site, 'grants.jsonl')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(site, 'badges', 'repo-octo--demo.json'))).schemaVersion, 1);
});

test('future rails are OFF and need legal review', async () => {
  const cfg = rails.loadConfig();
  assert.equal(cfg.tokenMirror.enabled, false); assert.equal(cfg.bankPayout.enabled, false);
  assert.throws(() => new rails.TokenMirror(cfg), /legal review/);
  assert.throws(() => rails.bankPayout(cfg), /legal review/);
  assert.throws(() => rails.bankPayout({ bankPayout: { enabled: true } }), /legal review/);
  const on = { tokenMirror: { enabled: true, legalReviewed: true }, bankPayout: { enabled: true, legalReviewed: true } };
  assert.throws(() => new rails.TokenMirror(on).deploy(), /no deploy/);
  assert.equal((await rails.bankPayout(on).payout()).moved, false);
});

test('repo ledger (committed) verifies lit', () => {
  const root = path.join(__dirname, '..');
  const log = L.readLog(path.join(root, 'ledger', 'grants.jsonl'));
  const keys = JSON.parse(fs.readFileSync(path.join(root, 'ledger', 'keys.json'), 'utf8'));
  assert.ok(L.verifyLog(log, keys).ok);
});
