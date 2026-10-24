'use strict';
// Signed, hash-chained, append-only grant log (ledger/grants.jsonl).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const GENESIS = '0'.repeat(64);

function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object')
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

function parseRecipient(s) {
  if (typeof s !== 'string' || !s) throw new Error('recipient required');
  const re = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
  if (s.includes('/')) {
    const [o, r, ...rest] = s.split('/');
    if (rest.length || !re.test(o) || !/^[A-Za-z0-9._-]{1,100}$/.test(r)) throw new Error('bad repo: ' + s);
    return { type: 'repo', id: `${o}/${r}` };
  }
  if (!re.test(s)) throw new Error('bad github user: ' + s);
  return { type: 'user', id: s };
}

function keyDir() { return process.env.CREDIT_HOME || path.join(os.homedir(), '.config', 'credit'); }

function keygen({ force = false } = {}) {
  const dir = keyDir();
  const priv = path.join(dir, 'ed25519.key');
  if (fs.existsSync(priv) && !force) throw new Error('key exists at ' + priv + ' (use --force to replace)');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const pub = publicKeyB64(publicKey);
  fs.writeFileSync(path.join(dir, 'ed25519.pub'), pub + '\n');
  return { pub, dir };
}
function publicKeyB64(k) { return k.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64'); }
function pubFromB64(b64) {
  const raw = Buffer.from(b64, 'base64');
  if (raw.length !== 32) throw new Error('bad pubkey');
  return crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
}
function loadKey() {
  const p = path.join(keyDir(), 'ed25519.key');
  if (!fs.existsSync(p)) throw new Error('no key; run `credit keygen`');
  const privateKey = crypto.createPrivateKey(fs.readFileSync(p));
  return { privateKey, pub: publicKeyB64(crypto.createPublicKey(privateKey)) };
}

function readLog(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l, i) => {
    try { return JSON.parse(l); } catch { throw new Error(`line ${i + 1}: invalid JSON`); }
  });
}

function bodyOf(e) { const { sig, hash, ...b } = e; return b; }
function entryHash(body, sig) { return sha256(canonical(body) + sig); }

function makeGrant(log, { from, to, amount, reason, ts }, key) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0 || amt > 1e9) throw new Error('amount must be a positive number');
  if (!reason || !String(reason).trim()) throw new Error('--for "reason" is required');
  const last = log[log.length - 1];
  const body = {
    v: 1, seq: log.length, prev: last ? last.hash : GENESIS,
    ts: ts || new Date().toISOString(), from, pubkey: key.pub,
    to: typeof to === 'string' ? parseRecipient(to) : to,
    amount: amt, for: String(reason).trim(),
  };
  const sig = crypto.sign(null, Buffer.from(canonical(body)), key.privateKey).toString('base64');
  return { ...body, sig, hash: entryHash(body, sig) };
}

function appendGrant(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
}

// trusted: optional { from: [pubkeys] } — if given, each grant's pubkey must be listed for its `from`.
function verifyLog(log, trusted) {
  const results = [];
  let prev = GENESIS, ok = true;
  log.forEach((e, i) => {
    const errs = [];
    const body = bodyOf(e);
    if (e.seq !== i) errs.push('seq mismatch');
    if (e.prev !== prev) errs.push('broken chain');
    if (entryHash(body, e.sig) !== e.hash) errs.push('hash mismatch');
    try {
      if (!crypto.verify(null, Buffer.from(canonical(body)), pubFromB64(e.pubkey), Buffer.from(e.sig, 'base64'))) errs.push('bad signature');
    } catch { errs.push('bad signature'); }
    if (trusted && !(trusted[e.from] || []).includes(e.pubkey)) errs.push('untrusted key for ' + e.from);
    if (errs.length) ok = false;
    results.push({ seq: i, ok: errs.length === 0, errs });
    prev = e.hash;
  });
  return { ok, count: log.length, head: prev, results };
}

function balances(log) {
  const out = {};
  for (const e of log) {
    const k = `${e.to.type}:${e.to.id}`;
    const b = (out[k] ||= { to: e.to, total: 0, grants: 0, from: {} });
    b.total += e.amount; b.grants++; b.from[e.from] = (b.from[e.from] || 0) + e.amount;
  }
  return out;
}

module.exports = { GENESIS, canonical, sha256, parseRecipient, keyDir, keygen, loadKey, pubFromB64,
  readLog, makeGrant, appendGrant, verifyLog, balances, bodyOf, entryHash };
