'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'credit-front-'));
process.env.CREDIT_HOME = path.join(tmp, 'home');
process.env.CREDIT_LEDGER = path.join(tmp, 'grants.jsonl');
process.env.CREDIT_KEYS = path.join(tmp, 'keys.json');
const L = require('../lib/ledger'); const F = require('../lib/front');
const { main } = require('../cli/credit');
const run = async (...a) => { const lines = []; const code = await main(a, s => lines.push(s)); return { code, out: lines.join('\n') }; };

test('isBot: dependabot & renovate, case-insensitive; humans and lookalikes excluded', () => {
  assert.ok(F.isBot('dependabot[bot]'));
  assert.ok(F.isBot('Renovate[bot]'));
  assert.ok(F.isBot('renovate-bot'));
  assert.ok(!F.isBot('octocat'));
  assert.ok(!F.isBot('dependabot-fan'));
  assert.ok(F.isBot('my-bot', ['my-bot']));
});

test('front: sticky body has marker, balance, scan link, give line; stable across runs', async () => {
  await run('keygen', '--as', 'owner');
  await run('give', 'octo/demo', '5', '--for', 'great lib');
  const r = await run('front', '--repo', 'octo/demo', '--ledger', process.env.CREDIT_LEDGER);
  assert.equal(r.code, 0);
  assert.match(r.out, /<!-- credit-front -->/);
  assert.match(r.out, /5 credit.*\(1 grant\)/);
  assert.match(r.out, /fitzyracing1\.github\.io\/credit\/#repo:octo\/demo/);
  assert.match(r.out, /give octo\/demo/);
  assert.doesNotMatch(r.out, /PRIVATE KEY/);
  const r2 = await run('front', '--repo', 'octo/demo', '--ledger', process.env.CREDIT_LEDGER);
  assert.equal(r.out, r2.out); // same ledger -> identical sticky body, no comment churn
  const f = path.join(tmp, 'body.md');
  await run('front', '--repo', 'octo/demo', '--ledger', process.env.CREDIT_LEDGER, '--out', f);
  assert.match(fs.readFileSync(f, 'utf8'), /<!-- credit-front -->/);
});

test('front: refuses to render from a dark ledger', async () => {
  const good = fs.readFileSync(process.env.CREDIT_LEDGER, 'utf8');
  const t = JSON.parse(good.trim()); t.amount = 999;
  fs.writeFileSync(process.env.CREDIT_LEDGER, JSON.stringify(t) + '\n');
  const r = await run('front', '--repo', 'octo/demo', '--ledger', process.env.CREDIT_LEDGER);
  assert.equal(r.code, 1); assert.match(r.out, /^dark/m);
  fs.writeFileSync(process.env.CREDIT_LEDGER, good);
});

test('propose: unsigned, never sends, never touches the ledger; bots refused', async () => {
  const before = fs.readFileSync(process.env.CREDIT_LEDGER, 'utf8');
  const dir = path.join(tmp, 'prop');
  const r = await run('propose', 'alice', '--repo', 'octo/demo', '--pr', '12', '--title', 'fix "the" bug', '--amount', '2', '--out', dir);
  assert.equal(r.code, 0);
  const grant = JSON.parse(fs.readFileSync(path.join(dir, 'proposal.json')));
  assert.equal(grant.credit, 'CREDIT-1/proposal');
  assert.equal(grant.status, 'proposed');
  assert.equal(grant.amount, 2);
  for (const k of ['sig', 'hash', 'pubkey', 'seq', 'prev']) assert.ok(!(k in grant), `unsigned proposal must not have ${k}`);
  const md = fs.readFileSync(path.join(dir, 'proposal.md'), 'utf8');
  assert.match(md, /<!-- credit-proposal -->/);
  assert.match(md, /dry-run/);
  assert.match(md, /give alice 2 --for/);
  assert.doesNotMatch(md, /give alice 2 [^\n]*--send/, 'suggested command must stay dry-run');
  assert.equal(fs.readFileSync(process.env.CREDIT_LEDGER, 'utf8'), before, 'ledger must be untouched');
  await assert.rejects(run('propose', 'alice', '--repo', 'octo/demo', '--pr', '13', '--send'), /never sends/);
  await assert.rejects(run('propose', 'dependabot[bot]', '--repo', 'octo/demo', '--pr', '1'), /bad github user/);
  await assert.rejects(run('propose', 'octo/demo', '--repo', 'octo/demo', '--pr', '1'), /users/);
  await assert.rejects(run('propose', 'alice', '--repo', 'octo/demo', '--pr', '0'), /positive integer/);
  await assert.rejects(run('propose', 'alice', '--repo', 'octo/demo', '--pr', '1', '--amount', '-3'), /positive/);
});

test('contributors section: created, idempotent per PR, accumulates, sorts', () => {
  let md = F.updateContributors('# demo\n', { author: 'alice', amount: 2, pr: 12 });
  assert.match(md, /<!-- credit-contributors -->/);
  assert.match(md, /\| \[@alice\]\(https:\/\/github\.com\/alice\) \| 2 \| #12 \|/);
  assert.equal(F.updateContributors(md, { author: 'alice', amount: 2, pr: 12 }), md, 'same PR twice must not double-count');
  md = F.updateContributors(md, { author: 'alice', amount: 1, pr: 15 });
  assert.match(md, /\| \[@alice\]\(https:\/\/github\.com\/alice\) \| 3 \| #12, #15 \|/);
  md = F.updateContributors(md, { author: 'bob', amount: 5, pr: 16 });
  assert.ok(md.indexOf('@bob') < md.indexOf('@alice'), 'sorted by proposed credit desc');
  assert.equal(F.updateContributors(md, { author: 'bob', amount: 5, pr: 16 }), md);
  assert.throws(() => F.updateContributors('', { author: 'octo/demo', amount: 1, pr: 1 }), /users/);
});

test('propose --readme updates the block in place and reports idempotence', async () => {
  const rd = path.join(tmp, 'README.md');
  fs.writeFileSync(rd, '# demo\n');
  let r = await run('propose', 'alice', '--repo', 'octo/demo', '--pr', '12', '--out', path.join(tmp, 'p2'), '--readme', rd);
  assert.match(r.out, /updated contributors section/);
  assert.match(fs.readFileSync(rd, 'utf8'), /@alice/);
  r = await run('propose', 'alice', '--repo', 'octo/demo', '--pr', '12', '--out', path.join(tmp, 'p2'), '--readme', rd);
  assert.match(r.out, /already lists/);
});
