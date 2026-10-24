'use strict';
// Crawler-readable credit data: public JSON + Atom feeds and funding pointers
// (ecosyste.ms / thanks.dev-style tools). Deterministic for a given ledger —
// no clock reads — so generated files diff cleanly and CI can cmp them.
const { balances } = require('./ledger');

const NOTE = 'Credit is recognition only. It is not money, a security, or a claim on anything.';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function feedJson(log, { ledgerUrl, scanUrl } = {}) {
  return {
    credit: 'CREDIT-1/feed', version: 1,
    ledger: ledgerUrl, scan: scanUrl,
    head: log.length ? log[log.length - 1].hash : null,
    count: log.length,
    updated: log.length ? log[log.length - 1].ts : null,
    balances: Object.values(balances(log))
      .sort((a, b) => `${a.to.type}:${a.to.id}`.localeCompare(`${b.to.type}:${b.to.id}`))
      .map(b => ({ to: b.to, balance: b.total, grants: b.grants, from: b.from })),
    grants: log, // full signed entries: seq, prev, ts, from, pubkey, to, amount, for, sig, hash
    note: NOTE,
  };
}

function feedAtom(log, { scanUrl = '', ledgerUrl = '' } = {}) {
  const base = String(scanUrl).replace(/\/?$/, '/');
  const updated = log.length ? log[log.length - 1].ts : '1970-01-01T00:00:00.000Z';
  const entries = log.map(e => [
    '  <entry>',
    `    <id>${esc(base)}#grant-${esc(e.hash)}</id>`,
    `    <title>+${esc(e.amount)} credit to ${esc(e.to.id)} from ${esc(e.from)}</title>`,
    `    <updated>${esc(e.ts)}</updated>`,
    `    <link href="${esc(base)}#${esc(e.to.type)}:${esc(e.to.id)}"/>`,
    `    <author><name>${esc(e.from)}</name></author>`,
    `    <summary>${esc(e.for)}</summary>`,
    `    <content type="text">grant #${e.seq}: ${esc(e.amount)} credit from ${esc(e.from)} to ${esc(e.to.type)}:${esc(e.to.id)} for "${esc(e.for)}" — hash ${esc(e.hash)} sig ${esc(e.sig)} (ed25519; verify against ${esc(ledgerUrl)})</content>`,
    '  </entry>',
  ].join('\n'));
  return ['<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    '  <title>credit — signed public grant feed</title>',
    `  <id>${esc(base)}</id>`,
    `  <link href="${esc(base)}"/>`,
    `  <link rel="self" href="${esc(base)}feed.xml"/>`,
    `  <updated>${esc(updated)}</updated>`,
    '  <author><name>credit ledger</name></author>',
    `  <subtitle>${esc(NOTE)}</subtitle>`,
    ...entries,
    '</feed>', ''].join('\n');
}

function fundingYml(scanUrl) {
  return ['# Points crawlers at the public credit scan page (signed, verifiable ledger).',
    '# Credit is recognition only — not money. No sponsor accounts are involved.',
    `custom: ["${scanUrl}"]`, ''].join('\n');
}

module.exports = { feedJson, feedAtom, fundingYml };
