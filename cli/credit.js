#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const L = require('../lib/ledger');
const R = require('../lib/recipient');
const F = require('../lib/front');
const FEED = require('../lib/feed');

const ROOT = path.resolve(__dirname, '..');
const DEFAULTS = {
  ledger: process.env.CREDIT_LEDGER || path.join(ROOT, 'ledger', 'grants.jsonl'),
  keys: process.env.CREDIT_KEYS || path.join(ROOT, 'ledger', 'keys.json'),
  ledgerUrl: 'https://raw.githubusercontent.com/fitzyracing1/credit/main/ledger/grants.jsonl',
  scanUrl: 'https://fitzyracing1.github.io/credit/',
};
const USAGE = `credit — signed, public, append-only credit grants

  credit keygen [--as <github-user>] [--force]   make ed25519 key in ~/.config/credit (private key never printed)
  credit give <user|owner/repo> <amount> --for "reason" [--from <user>] [--email addr] [--no-append] [--send]
        DRY-RUN by default: appends the signed grant locally and prints the PR/email it WOULD create.
        --send actually opens the PR in the recipient's repo (via gh). Emails are never sent; only drafted.
  credit verify [--ledger file|url] [--json]   check signatures + hash chain (prints lit / dark)
  credit balance <user|owner/repo>             print CREDIT.json for a recipient
  credit site [--out docs]                      refresh the static scan site: ledger copy, shields badges, crawler feeds (feed.json + Atom feed.xml)
  credit funding [--dir .] [--scan url]         write .github/FUNDING.yml + package.json "funding" pointing at the scan page (existing values are never overwritten)
  credit sync --repo owner/repo [--ledger url] [--out CREDIT.json]   (used by the repo-wallet Action)
  credit front --repo owner/repo [--ledger url] [--scan url] [--out file]
        render the sticky PR-comment body: balance, scan-page link, give-credit line (used by the front Action)
  credit propose <user> --repo owner/repo --pr N [--title t] [--amount n] [--out dir] [--readme file]
        UNSIGNED grant proposal for a merged PR (all-contributors style). Never signs, appends, or sends.
`;

function parse(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (['send', 'force', 'json', 'no-append', 'help'].includes(k)) opt[k] = true;
      else { if (i + 1 >= argv.length) throw new Error(`--${k} needs a value`); opt[k] = argv[++i]; }
    } else pos.push(a);
  }
  return { pos, opt };
}
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);

async function loadLog(src) {
  if (/^https?:\/\//.test(src)) {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`fetch ${src}: ${r.status}`);
    const t = await r.text();
    return t.split('\n').filter(Boolean).map(l => JSON.parse(l));
  }
  return L.readLog(src);
}

async function main(argv, out = console.log) {
  const { pos, opt } = parse(argv);
  const cmd = pos.shift();
  const ledger = opt.ledger || DEFAULTS.ledger;
  switch (cmd) {
    case 'keygen': {
      const { pub, dir } = L.keygen({ force: opt.force });
      out(`key created in ${dir} (private key stays there, mode 600)\npublic key: ${pub}`);
      if (opt.as) {
        const keys = readJson(DEFAULTS.keys, {});
        keys[opt.as] = [...new Set([...(keys[opt.as] || []), pub])];
        fs.writeFileSync(DEFAULTS.keys, JSON.stringify(keys, null, 2) + '\n');
        out(`registered public key for ${opt.as} in ${path.relative(process.cwd(), DEFAULTS.keys)}`);
      }
      return 0;
    }
    case 'give': {
      const [who, amount] = pos;
      if (!who || !amount) throw new Error('usage: credit give <user|owner/repo> <amount> --for "reason"');
      const key = L.loadKey();
      const keys = readJson(DEFAULTS.keys, {});
      const from = opt.from || process.env.CREDIT_FROM || Object.keys(keys).find(k => keys[k].includes(key.pub));
      if (!from) throw new Error('unknown giver: pass --from <github-user> or run `credit keygen --as <user>`');
      const log = L.readLog(ledger);
      if (!L.verifyLog(log).ok) throw new Error('ledger is dark (fails verify); refusing to append');
      const entry = L.makeGrant(log, { from, to: who, amount, reason: opt.for }, key);
      const next = [...log, entry];
      if (!opt['no-append']) L.appendGrant(ledger, entry);
      out(`${opt['no-append'] ? 'preview' : 'appended'} grant #${entry.seq} ${entry.hash}`);
      out(JSON.stringify(entry, null, 2));
      const pr = R.prDraft(entry, R.creditJson(next, entry.to, DEFAULTS.ledgerUrl), DEFAULTS.scanUrl);
      const em = R.emailDraft(entry, opt.email, DEFAULTS.scanUrl);
      out(`\n--- PR ${opt.send ? 'TO OPEN' : 'DRAFT (dry-run, nothing sent)'} ---\nrepo:   ${pr.repo}\nbranch: ${pr.branch}\ntitle:  ${pr.title}\n\n${pr.body}\n\n${pr.file}:\n${pr.content}`);
      out(`--- EMAIL DRAFT (never sent by this tool) ---\nTo: ${em.to}\nSubject: ${em.subject}\n\n${em.body}`);
      if (opt.send) sendPr(pr, out);
      else out('\nDRY-RUN: re-run with --send to open the PR above.');
      return 0;
    }
    case 'verify': {
      const log = await loadLog(ledger);
      const trusted = opt.keys === 'none' ? undefined : readJson(opt.keys || DEFAULTS.keys, undefined);
      const res = L.verifyLog(log, trusted);
      if (opt.json) out(JSON.stringify(res, null, 2));
      else {
        for (const r of res.results) if (!r.ok) out(`  #${r.seq} dark: ${r.errs.join(', ')}`);
        out(`${res.ok ? 'lit' : 'dark'}: ${res.count} grants, head ${res.head.slice(0, 16)}`);
      }
      return res.ok ? 0 : 1;
    }
    case 'balance': {
      const log = await loadLog(ledger);
      out(JSON.stringify(R.creditJson(log, L.parseRecipient(pos[0]), DEFAULTS.ledgerUrl), null, 2));
      return 0;
    }
    case 'site': {
      const dir = opt.out || path.join(ROOT, 'docs');
      const log = L.readLog(ledger);
      fs.mkdirSync(path.join(dir, 'badges'), { recursive: true });
      fs.copyFileSync(ledger, path.join(dir, 'grants.jsonl'));
      if (fs.existsSync(DEFAULTS.keys)) fs.copyFileSync(DEFAULTS.keys, path.join(dir, 'keys.json'));
      for (const b of Object.values(L.balances(log))) {
        const name = `${b.to.type}-${b.to.id.replace('/', '--')}.json`;
        fs.writeFileSync(path.join(dir, 'badges', name), JSON.stringify(R.shieldsBadge(log, b.to)) + '\n');
      }
      const urls = { ledgerUrl: DEFAULTS.ledgerUrl, scanUrl: DEFAULTS.scanUrl };
      fs.writeFileSync(path.join(dir, 'feed.json'), JSON.stringify(FEED.feedJson(log, urls), null, 2) + '\n');
      fs.writeFileSync(path.join(dir, 'feed.xml'), FEED.feedAtom(log, urls));
      out(`site data written to ${dir} (incl. crawler feeds feed.json + feed.xml)`);
      return 0;
    }
    case 'sync': {
      if (!opt.repo) throw new Error('--repo owner/repo required');
      const src = opt.ledger || DEFAULTS.ledgerUrl;
      const log = await loadLog(src);
      const res = L.verifyLog(log);
      if (!res.ok) { out('dark: ledger failed verification; not updating CREDIT.json'); return 1; }
      const file = opt.out || 'CREDIT.json';
      const credit = R.creditJson(log, L.parseRecipient(opt.repo), src);
      const prevJ = readJson(file, null);
      const changed = !prevJ || prevJ.head !== credit.head || prevJ.balance !== credit.balance;
      if (changed) fs.writeFileSync(file, JSON.stringify(credit, null, 2) + '\n');
      out(`lit: ${opt.repo} balance ${credit.balance} (${changed ? 'updated' : 'unchanged'})`);
      return 0;
    }
    case 'funding': {
      const dir = opt.dir || '.';
      const scan = opt.scan || DEFAULTS.scanUrl;
      const fy = path.join(dir, '.github', 'FUNDING.yml');
      if (fs.existsSync(fy)) out(`kept existing ${fy} (never overwritten)`);
      else {
        fs.mkdirSync(path.dirname(fy), { recursive: true });
        fs.writeFileSync(fy, FEED.fundingYml(scan));
        out(`wrote ${fy} -> ${scan}`);
      }
      const pj = path.join(dir, 'package.json');
      if (fs.existsSync(pj)) {
        const p = JSON.parse(fs.readFileSync(pj, 'utf8'));
        if (p.funding) out(`kept existing funding in ${pj} (never overwritten)`);
        else { p.funding = scan; fs.writeFileSync(pj, JSON.stringify(p, null, 2) + '\n'); out(`added funding to ${pj} -> ${scan}`); }
      }
      return 0;
    }
    case 'front': {
      if (!opt.repo) throw new Error('--repo owner/repo required');
      const src = opt.ledger || DEFAULTS.ledgerUrl;
      const log = await loadLog(src);
      if (!L.verifyLog(log).ok) { out('dark: ledger failed verification; refusing to render a comment'); return 1; }
      const credit = R.creditJson(log, L.parseRecipient(opt.repo), src);
      const md = F.stickyComment(credit, { scanUrl: opt.scan || DEFAULTS.scanUrl });
      if (opt.out) { fs.writeFileSync(opt.out, md + '\n'); out(`comment body written to ${opt.out}`); }
      else out(md);
      return 0;
    }
    case 'propose': {
      if (opt.send) throw new Error('propose never sends; only the owner signs and sends with `credit give --send`');
      const [who] = pos;
      if (!who || !opt.repo || !opt.pr) throw new Error('usage: credit propose <user> --repo owner/repo --pr N');
      const p = F.proposal({ author: who, repo: opt.repo, pr: opt.pr, title: opt.title,
        amount: opt.amount || 1, scanUrl: opt.scan || DEFAULTS.scanUrl });
      if (opt.out) {
        fs.mkdirSync(opt.out, { recursive: true });
        fs.writeFileSync(path.join(opt.out, 'proposal.json'), JSON.stringify(p.grant, null, 2) + '\n');
        fs.writeFileSync(path.join(opt.out, 'proposal.md'), p.md + '\n');
        out(`proposal written to ${opt.out} (dry-run; nothing signed, ledger untouched)`);
      } else out(p.md);
      if (opt.readme) {
        const prev = fs.existsSync(opt.readme) ? fs.readFileSync(opt.readme, 'utf8') : '';
        const next = F.updateContributors(prev, { author: who, amount: opt.amount || 1, pr: opt.pr });
        if (next !== prev) { fs.writeFileSync(opt.readme, next); out(`updated contributors section in ${opt.readme}`); }
        else out(`contributors section already lists ${who} for #${opt.pr}`);
      }
      out(`sign later (owner only, from a clone): ${p.giveCmd}`);
      return 0;
    }
    default:
      out(USAGE);
      return cmd && !opt.help ? 1 : 0;
  }
}

// Only reached with an explicit --send. Opens a PR in the recipient's repo using the gh CLI.
function sendPr(pr, out) {
  const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' }).trim();
  const me = gh('api', 'user', '-q', '.login');
  const [owner, name] = pr.repo.split('/');
  let headRepo = pr.repo;
  if (owner.toLowerCase() !== me.toLowerCase()) { gh('repo', 'fork', pr.repo, '--clone=false'); headRepo = `${me}/${name}`; }
  const base = gh('api', `repos/${pr.repo}`, '-q', '.default_branch');
  const sha = gh('api', `repos/${headRepo}/git/ref/heads/${base}`, '-q', '.object.sha');
  try { gh('api', '-X', 'POST', `repos/${headRepo}/git/refs`, '-f', `ref=refs/heads/${pr.branch}`, '-f', `sha=${sha}`); } catch { /* branch exists */ }
  let fileSha = '';
  try { fileSha = gh('api', `repos/${headRepo}/contents/${pr.file}?ref=${pr.branch}`, '-q', '.sha'); } catch { /* new file */ }
  const args = ['api', '-X', 'PUT', `repos/${headRepo}/contents/${pr.file}`, '-f', `message=${pr.title}`,
    '-f', `content=${Buffer.from(pr.content).toString('base64')}`, '-f', `branch=${pr.branch}`];
  if (fileSha) args.push('-f', `sha=${fileSha}`);
  gh(...args);
  const head = headRepo === pr.repo ? pr.branch : `${me}:${pr.branch}`;
  out(gh('pr', 'create', '-R', pr.repo, '--head', head, '--base', base, '--title', pr.title, '--body', pr.body));
}

module.exports = { main, parse };
if (require.main === module)
  main(process.argv.slice(2)).then(c => process.exit(c), e => { console.error('error: ' + e.message); process.exit(2); });
