'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'credit-feed-'));
process.env.CREDIT_HOME = path.join(tmp, 'home');
process.env.CREDIT_LEDGER = path.join(tmp, 'grants.jsonl');
process.env.CREDIT_KEYS = path.join(tmp, 'keys.json');
const L = require('../lib/ledger'); const FEED = require('../lib/feed');
const { main } = require('../cli/credit');
const run = async (...a) => { const lines = []; const code = await main(a, s => lines.push(s)); return { code, out: lines.join('\n') }; };
const SCAN = 'https://fitzyracing1.github.io/credit/';

test('feed.json: balances per recipient + signed grants, head/updated from ledger, deterministic', async () => {
  await run('keygen', '--as', 'owner');
  await run('give', 'octo/demo', '5', '--for', 'tools & <markup> "quoted"');
  await run('give', 'alice', '2', '--for', 'review');
  const log = L.readLog(process.env.CREDIT_LEDGER);
  const f = FEED.feedJson(log, { ledgerUrl: 'https://l/grants.jsonl', scanUrl: SCAN });
  assert.equal(f.credit, 'CREDIT-1/feed');
  assert.equal(f.count, 2);
  assert.equal(f.head, log[1].hash);
  assert.equal(f.updated, log[1].ts);
  assert.equal(f.balances.find(b => b.to.id === 'octo/demo').balance, 5);
  assert.equal(f.balances.find(b => b.to.id === 'alice').from.owner, 2);
  for (const g of f.grants) { assert.ok(g.sig, 'grant keeps signature'); assert.ok(g.hash, 'grant keeps hash'); }
  assert.deepEqual(f, FEED.feedJson(log, { ledgerUrl: 'https://l/grants.jsonl', scanUrl: SCAN }), 'deterministic');
});

test('feed.xml: Atom skeleton, one entry per grant, hashes/sigs included, markup escaped', () => {
  const log = L.readLog(process.env.CREDIT_LEDGER);
  const xml = FEED.feedAtom(log, { scanUrl: SCAN, ledgerUrl: 'https://l/grants.jsonl' });
  assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?>/);
  assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.equal([...xml.matchAll(/<entry>/g)].length, 2);
  assert.match(xml, /rel="self" href="https:\/\/fitzyracing1\.github\.io\/credit\/feed\.xml"/);
  assert.ok(xml.includes(`<updated>${log[1].ts}</updated>`));
  assert.ok(xml.includes(log[0].hash), 'hash present');
  assert.ok(xml.includes(log[0].sig), 'signature present');
  assert.match(xml, /&lt;markup&gt;/);
  assert.match(xml, /tools &amp;/);
  assert.match(xml, /&quot;quoted&quot;/);
  assert.ok(!/<markup>/.test(xml), 'raw markup must be escaped');
});

test('site writes feed.json + feed.xml alongside badges', async () => {
  const dir = path.join(tmp, 'site');
  await run('site', '--out', dir);
  const f = JSON.parse(fs.readFileSync(path.join(dir, 'feed.json')));
  assert.equal(f.count, 2);
  assert.equal(f.ledger, 'https://raw.githubusercontent.com/fitzyracing1/credit/main/ledger/grants.jsonl');
  assert.match(fs.readFileSync(path.join(dir, 'feed.xml'), 'utf8'), /<feed xmlns=/);
});

test('funding: writes FUNDING.yml + package.json pointer; never overwrites; no sponsor accounts', async () => {
  const dir = path.join(tmp, 'repo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }) + '\n');
  let r = await run('funding', '--dir', dir);
  assert.equal(r.code, 0);
  const fy = path.join(dir, '.github', 'FUNDING.yml');
  const yml = fs.readFileSync(fy, 'utf8');
  assert.match(yml, /custom: \["https:\/\/fitzyracing1\.github\.io\/credit\/"\]/);
  assert.doesNotMatch(yml, /^(github|patreon|open_collective|ko_fi|tidelift|liberapay):/m, 'no fake sponsor accounts');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).funding, SCAN);
  fs.writeFileSync(fy, 'github: [someone]\n');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', funding: 'https://other' }, null, 2) + '\n');
  r = await run('funding', '--dir', dir);
  assert.match(r.out, /kept existing .*FUNDING\.yml/);
  assert.equal(fs.readFileSync(fy, 'utf8'), 'github: [someone]\n', 'existing FUNDING.yml untouched');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))).funding, 'https://other', 'existing funding untouched');
});

test('repo files: committed feeds match the committed ledger; funding pointers in place', () => {
  const root = path.join(__dirname, '..');
  const log = L.readLog(path.join(root, 'ledger', 'grants.jsonl'));
  const f = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'feed.json')));
  assert.equal(f.head, log[log.length - 1].hash, 'docs/feed.json head matches ledger');
  assert.equal(f.count, log.length);
  assert.match(fs.readFileSync(path.join(root, 'docs', 'feed.xml'), 'utf8'), new RegExp(log[log.length - 1].hash));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).funding, SCAN);
  assert.match(fs.readFileSync(path.join(root, '.github', 'FUNDING.yml'), 'utf8'), /fitzyracing1\.github\.io\/credit/);
});
