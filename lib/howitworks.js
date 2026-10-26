'use strict';
// Static "How it works" page, written to docs/how-it-works.html by `credit site`.
// Plain-English explainer; keep facts in sync with README.md, SPEC.md and lib/*.
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function howItWorksHtml({ scanUrl, ledgerUrl }) {
  const pre = s => `<pre><code>${esc(s)}</code></pre>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>How it works — credit</title>
<style>
body{font:15px/1.6 system-ui,sans-serif;margin:0;background:#0f1115;color:#e6e6e6}
header{padding:16px 24px;border-bottom:1px solid #2a2d35;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
h1{font-size:18px;margin:0} main{padding:16px 24px;max-width:860px}
h2{margin-top:32px;border-bottom:1px solid #22252c;padding-bottom:4px} a{color:#9ecbff} code{color:#9ecbff;font-size:13px}
pre{background:#161920;border:1px solid #2a2d35;border-radius:8px;padding:12px;overflow:auto}
.card{background:#161920;border:1px solid #2a2d35;border-radius:8px;padding:12px 16px;margin:12px 0}
.lit{color:#ffd54a;font-weight:600}.dark{color:#888;font-weight:600}
table{border-collapse:collapse} td,th{padding:6px 10px;border-bottom:1px solid #22252c;text-align:left;vertical-align:top}
</style></head><body>
<header><h1>credit</h1><nav><a href="./">Scan</a> · <a href="how-it-works.html"><b>How it works</b></a> · <a href="https://github.com/fitzyracing1/credit">GitHub</a></nav></header>
<main id="how-it-works">
<h2>What is credit?</h2>
<p>Credit is a public, verifiable way to say <b>“thank you”</b> to a GitHub user or repo, recording who helped and for what.</p>
<div class="card"><b>Credit is recognition only.</b> It is not money, not a security, and not a claim on anything. Nobody gets paid, and you can't cash it out.</div>

<h2>What do the numbers (like 5 or 10) mean?</h2>
<p>The number is the <b>weight</b>: how much thanks you're giving. Bigger means “this helped me more”. It's a relative signal you pick, not a price. A recipient's <b>balance</b> is the sum of the weights everyone has given them.</p>
<table><tr><th>Weight</th><th>Real example</th></tr>
<tr><td><b>10</b></td><td>credited <code>foundry-rs/foundry</code> for the Solidity toolchain</td></tr>
<tr><td><b>5</b></td><td>“saved me a week”</td></tr></table>
<p>The CREDIT-1 standard caps weight at <b>1–100</b> per credit (default 1), and the credit-wallet app caps its proposals at 100 too.</p>

<h2>How to give credit</h2>
<p>From a clone of the repo (Node ≥ 20, no dependencies):</p>
${pre(`node cli/credit.js keygen --as <your-github-user>   # makes your ed25519 key in ~/.config/credit (never printed or committed)
node cli/credit.js give octocat/hello 5 --for "saved me a week"
node cli/credit.js verify                                 # prints lit or dark`)}
<ul>
<li><code>give</code> signs the grant with your key and appends it to the ledger.</li>
<li>It also prepares a pull request that adds a <code>CREDIT.json</code> to the recipient's repo. <b>By default this is a dry run</b>: it only prints the PR. Add <code>--send</code> to actually open it. Emails are only ever drafted, never sent.</li>
<li><code>verify</code> checks every signature and the hash chain: <span class="lit">lit</span> = everything checks out, <span class="dark">dark</span> = something fails.</li>
</ul>

<h2>The CREDIT.json file</h2>
<p>A recipient's repo can hold a <code>CREDIT.json</code> showing their balance, copied from the public ledger (<code>credit balance &lt;user|owner/repo&gt;</code> prints it):</p>
${pre(`{
  "credit": "CREDIT-1/balance",
  "recipient": { "type": "repo", "id": "octocat/hello" },
  "balance": 5,
  "grants": 1,
  "from": { "fitzyracing1": 5 },
  "ledger": "${ledgerUrl}",
  "head": "<hash of the latest ledger entry>",
  "last": [ { "seq": 2, "from": "fitzyracing1", "amount": 5, "for": "saved me a week", "ts": "…", "hash": "…" } ],
  "note": "Credit is recognition only. It is not money, a security, or a claim on anything."
}`)}
<p>Separately, anyone can publish who <i>they</i> credit in a <code>/.well-known/credit.json</code> (the CREDIT-1 document, where each credit has a <code>weight</code>). See the <a href="https://github.com/fitzyracing1/credit/blob/main/SPEC.md">spec</a>.</p>

<h2>The credit-wallet GitHub App</h2>
<p><a href="https://github.com/fitzyracing1/credit-wallet">credit-wallet</a> is an opt-in, approve-first app for repo owners:</p>
<ol>
<li>A contributor's PR is <b>merged</b> on a repo where you installed the app.</li>
<li>The app writes an <b>unsigned proposal</b> to its pending queue. Nothing is granted yet.</li>
<li>You, the owner, review and <b>approve</b> (or reject) it: <code>credit-wallet approve alice/proj#7</code>.</li>
<li>Approve prints a <code>credit give</code> command. <b>You sign it with your own key.</b></li>
</ol>
<div class="card">The app <b>never signs</b> and never holds or reads signing keys. It <b>never comments</b>, opens issues, or opens PRs in anyone else's repo. Bots and the owner's own PRs are skipped.</div>

<h2>The signed, hash-chained ledger</h2>
<p>Every grant is one line in <a href="https://github.com/fitzyracing1/credit/blob/main/ledger/grants.jsonl"><code>ledger/grants.jsonl</code></a>, an append-only public file. Each entry:</p>
<ul>
<li>is <b>signed</b> (ed25519) by the giver's key, so nobody else can forge it;</li>
<li>has a sequence number and the <code>prev</code> hash of the entry before it, plus its own SHA-256 <code>hash</code>, which forms a <b>chain</b>. Editing or deleting any old entry breaks every later link.</li>
</ul>
<p>The <a href="./">scan page</a> re-checks every signature and link in your browser and shows <span class="lit">lit</span> or <span class="dark">dark</span>. Crawlers can read the same data from <a href="feed.json">feed.json</a> and <a href="feed.xml">feed.xml</a>.</p>
<p><a href="${scanUrl}">← Back to the scan page</a></p>
</main></body></html>
`;
}
module.exports = { howItWorksHtml };
