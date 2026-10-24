'use strict';
// Builds CREDIT.json for a recipient, plus PR / email drafts. Pure functions: nothing is sent here.
const { balances } = require('./ledger');

function creditJson(log, to, ledgerUrl) {
  const b = balances(log)[`${to.type}:${to.id}`] || { total: 0, grants: 0, from: {} };
  const mine = log.filter(e => e.to.type === to.type && e.to.id === to.id);
  return {
    credit: 'CREDIT-1/balance', recipient: to, balance: b.total, grants: b.grants,
    from: b.from, ledger: ledgerUrl, head: log.length ? log[log.length - 1].hash : null,
    last: mine.slice(-10).map(e => ({ seq: e.seq, from: e.from, amount: e.amount, for: e.for, ts: e.ts, hash: e.hash })),
    note: 'Credit is recognition only. It is not money, a security, or a claim on anything.',
  };
}

function targetRepo(to) { return to.type === 'repo' ? to.id : `${to.id}/${to.id}`; } // user -> profile repo

function prDraft(entry, credit, scanUrl) {
  const repo = targetRepo(entry.to);
  return {
    repo, branch: 'credit/update-balance', file: 'CREDIT.json',
    title: `Credit: +${entry.amount} from ${entry.from}`,
    body: [`${entry.from} gave **${entry.amount} credit** to \`${entry.to.id}\` for: ${entry.for}`, '',
      `Signed grant #${entry.seq} \`${entry.hash.slice(0, 16)}…\` in the public append-only ledger.`,
      `Verify: ${scanUrl}#${entry.to.type}:${entry.to.id}`, '',
      'This PR only adds/updates `CREDIT.json`. Credit is recognition, not payment. Feel free to close it.'].join('\n'),
    content: JSON.stringify(credit, null, 2) + '\n',
  };
}

function emailDraft(entry, to_email, scanUrl) {
  return {
    to: to_email || `<email for ${entry.to.id}>`,
    subject: `${entry.from} gave you credit for ${entry.for}`,
    body: `Hi,\n\n${entry.from} recorded ${entry.amount} credit to ${entry.to.id} for: ${entry.for}\n\n` +
      `It's a signed entry in a public ledger: ${scanUrl}#${entry.to.type}:${entry.to.id}\n\n` +
      `No action needed. Credit is recognition, not money.\n\n— ${entry.from}`,
  };
}

function shieldsBadge(log, to) {
  const b = balances(log)[`${to.type}:${to.id}`];
  return { schemaVersion: 1, label: 'credit', message: b ? `${b.total} (${b.grants} grants)` : '0', color: b ? 'yellow' : 'lightgrey' };
}

module.exports = { creditJson, prDraft, emailDraft, shieldsBadge, targetRepo };
