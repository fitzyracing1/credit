'use strict';
// "Credit in front of bots": sticky PR-comment bodies and UNSIGNED grant proposals.
// Pure functions — nothing here comments, signs, sends, or appends to the ledger.
const { parseRecipient } = require('./ledger');

const MARK_FRONT = '<!-- credit-front -->';
const MARK_PROPOSE = '<!-- credit-proposal -->';
const CONTRIB_START = '<!-- credit-contributors -->';
const CONTRIB_END = '<!-- /credit-contributors -->';
const DEFAULT_BOTS = ['dependabot[bot]', 'dependabot-preview[bot]', 'renovate[bot]', 'renovate-bot'];

const isBot = (login, bots = DEFAULT_BOTS) =>
  typeof login === 'string' && bots.some(b => b.toLowerCase() === login.toLowerCase());

// One sticky comment body: balance from CREDIT.json data, scan-page link, give-credit line.
// Deterministic for a given ledger, so re-runs update the comment without churn.
function stickyComment(credit, { scanUrl, sourceRepo = 'fitzyracing1/credit' } = {}) {
  const id = credit.recipient.id;
  const n = credit.grants;
  return [
    MARK_FRONT,
    `**\`${id}\`** holds **${credit.balance} credit** (${n} grant${n === 1 ? '' : 's'}) — [scan page](${scanUrl}#${credit.recipient.type}:${id}) (ledger verifies lit).`,
    '',
    `Give credit — from a clone of [${sourceRepo}](https://github.com/${sourceRepo}):`,
    '```sh',
    `node cli/credit.js give ${id} 1 --for "what it helped with"`,
    '```',
    `<sub>${credit.note} Sticky comment by the \`credit front\` Action — it only ever posts on the repo it is installed in.</sub>`,
  ].join('\n');
}

// All-contributors style: a merged PR yields an UNSIGNED proposal the owner may sign later.
// Bot logins like dependabot[bot] fail parseRecipient, so bots can never be proposed credit.
function proposal({ author, repo, pr, title = '', amount = 1, scanUrl = '' }) {
  const to = parseRecipient(author);
  if (to.type !== 'user') throw new Error('proposals go to users, not repos');
  const base = parseRecipient(repo);
  if (base.type !== 'repo') throw new Error('--repo must be owner/repo');
  const n = Number(pr);
  if (!Number.isInteger(n) || n <= 0) throw new Error('--pr must be a positive integer');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0 || amt > 1e9) throw new Error('amount must be a positive number');
  const reason = `PR ${base.id}#${n}${String(title).trim() ? `: ${String(title).trim()}` : ''}`.slice(0, 200);
  const grant = {
    credit: 'CREDIT-1/proposal', status: 'proposed', to, amount: amt, for: reason,
    note: 'UNSIGNED dry-run proposal. Nothing was appended to the ledger; the signing key is private and never enters CI.',
  };
  const giveCmd = `node cli/credit.js give ${to.id} ${amt} --for "${reason.replace(/["`\\$]/g, '')}"`;
  const md = [
    `${MARK_PROPOSE} ${base.id}#${n}`,
    `**credit proposal (dry-run)** — @${to.id} merged ${base.id}#${n}.`,
    '',
    `Proposed: **${amt} credit** to \`${to.id}\` for: ${reason}`,
    '',
    'This is **not** in the ledger. Grants are ed25519-signed and the key never enters CI, so the owner signs from a clone:',
    '```sh',
    giveCmd,
    '```',
    scanUrl ? `Scan page: ${scanUrl}` : '',
    '<sub>Nothing was signed or sent. `give` stays dry-run unless the owner adds `--send`.</sub>',
  ].filter(Boolean).join('\n');
  return { grant, md, giveCmd };
}

// Upsert a "Contributors credit" block in a README. Idempotent per (author, pr):
// re-running for the same merged PR never double-counts.
function updateContributors(readme, { author, amount, pr }) {
  const to = parseRecipient(author);
  if (to.type !== 'user') throw new Error('contributors are users');
  const n = Number(pr);
  if (!Number.isInteger(n) || n <= 0) throw new Error('pr must be a positive integer');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('amount must be a positive number');
  const start = readme.indexOf(CONTRIB_START), end = readme.indexOf(CONTRIB_END);
  const hasBlock = start !== -1 && end > start;
  const rows = new Map();
  if (hasBlock) {
    for (const line of readme.slice(start, end).split('\n')) {
      const m = /^\| \[@([^\]]+)\]\([^)]*\) \| ([0-9][0-9.]*) \| ([^|]*) \|$/.exec(line.trim());
      if (m) rows.set(m[1], { amount: Number(m[2]), prs: new Set([...m[3].matchAll(/#(\d+)/g)].map(x => Number(x[1]))) });
    }
  }
  const r = rows.get(to.id) || { amount: 0, prs: new Set() };
  if (!r.prs.has(n)) { r.amount += amt; r.prs.add(n); }
  rows.set(to.id, r);
  const table = [...rows.entries()]
    .sort((a, b) => b[1].amount - a[1].amount || a[0].localeCompare(b[0]))
    .map(([id, v]) => `| [@${id}](https://github.com/${id}) | ${v.amount} | ${[...v.prs].sort((x, y) => x - y).map(p => `#${p}`).join(', ')} |`)
    .join('\n');
  const block = [CONTRIB_START, '## Contributors credit', '',
    'Unsigned credit **proposals** for merged PRs, maintained by the `credit front` Action.',
    'Nothing below is in the ledger until the owner signs it with `credit give` (the key never enters CI).', '',
    '| contributor | proposed credit | PRs |', '|---|---|---|', table, CONTRIB_END].join('\n');
  if (hasBlock) return readme.slice(0, start) + block + readme.slice(end + CONTRIB_END.length);
  return (readme === '' || readme.endsWith('\n') ? readme : readme + '\n') + '\n' + block + '\n';
}

module.exports = { MARK_FRONT, MARK_PROPOSE, CONTRIB_START, CONTRIB_END, DEFAULT_BOTS,
  isBot, stickyComment, proposal, updateContributors };
