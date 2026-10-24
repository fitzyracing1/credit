'use strict';
/*
 * FUTURE RAILS — STUBS, SWITCHED OFF.
 * ⚠️ NEEDS LEGAL REVIEW before enabling either rail. Turning credit into a token or a cash payout
 * may create a security, money transmission, tax reporting and KYC/AML obligations.
 * Nothing here deploys a contract or talks to a bank. Both require enabled=true AND legalReviewed=true
 * in config/rails.json, and even then only the no-op/simulated behaviour below exists.
 */
const fs = require('node:fs');
const path = require('node:path');
const { balances } = require('../lib/ledger');

function loadConfig(file = path.join(__dirname, '..', 'config', 'rails.json')) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function gate(cfg, name) {
  const c = cfg[name] || {};
  if (!c.enabled) throw new Error(`${name} is OFF (config/rails.json). Needs legal review before enabling.`);
  if (!c.legalReviewed) throw new Error(`${name} enabled without legalReviewed=true. Refusing: needs legal review.`);
  return c;
}

// ERC-20 style mirror: computes what balances WOULD be minted. Never deploys or signs a transaction.
class TokenMirror {
  constructor(cfg = loadConfig()) { this.cfg = gate(cfg, 'tokenMirror'); }
  static interface() {
    return ['name()', 'symbol()', 'decimals()', 'totalSupply()', 'balanceOf(address)', 'mint(address,uint256) onlyLedgerRelayer'];
  }
  // addressBook: { "user:alice": "0x..." }
  plan(log, addressBook) {
    return Object.entries(balances(log)).filter(([k]) => addressBook[k])
      .map(([k, b]) => ({ to: addressBook[k], amount: String(BigInt(Math.round(b.total * 1e6)) * 10n ** 12n), recipient: k }));
  }
  deploy() { throw new Error('TokenMirror.deploy: not implemented by design (no deploy). Needs legal review.'); }
}

// Bank-payout adapter interface. No real provider exists; implementations must subclass PayoutProvider.
class PayoutProvider {
  get name() { return 'abstract'; }
  async quote(_recipient, _credit) { throw new Error('not implemented'); }
  async payout(_recipient, _amountMinor, _currency, _idempotencyKey) { throw new Error('not implemented'); }
}
class NullPayoutProvider extends PayoutProvider {
  get name() { return 'null'; }
  async quote() { return { amountMinor: 0, currency: 'USD', note: 'null provider: no money moves' }; }
  async payout() { return { status: 'simulated', moved: false }; }
}
function bankPayout(cfg = loadConfig(), provider = new NullPayoutProvider()) {
  gate(cfg, 'bankPayout');
  if (!(provider instanceof PayoutProvider)) throw new Error('provider must extend PayoutProvider');
  return provider;
}

module.exports = { loadConfig, TokenMirror, PayoutProvider, NullPayoutProvider, bankPayout };
