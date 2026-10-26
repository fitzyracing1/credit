'use strict';
// Public leaderboard + static SVG badges, written by `credit site`.
// Only grants that verify (signature + hash chain [+ trusted key, if keys given]) are counted.
const L = require('./ledger');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = to => `${to.type}-${to.id.replace(/\//g, '--')}`;

function rank(log, trusted) {
  const res = L.verifyLog(log, trusted);
  const by = {};
  log.forEach((e, i) => {
    if (!res.results[i].ok) return;
    const k = `${e.to.type}:${e.to.id}`;
    const r = (by[k] ||= { to: e.to, slug: slug(e.to), total: 0, grants: [] });
    r.total += e.amount; r.grants.push(e);
  });
  const rows = Object.values(by).sort((a, b) => b.total - a.total || a.to.id.localeCompare(b.to.id));
  return { ok: res.ok, count: res.count, verified: res.results.filter(r => r.ok).length, rows };
}

function badgeSvg(value) {
  const l = 'credit', v = String(value), lw = 6 * l.length + 12, vw = 7 * v.length + 12, w = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${l}: ${esc(v)}"><title>${l}: ${esc(v)}</title>` +
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
    `<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)">` +
    `<rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="#dfb317"/><rect width="${w}" height="20" fill="url(#s)"/></g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">` +
    `<text x="${lw / 2}" y="14">${l}</text><text x="${lw + vw / 2}" y="14">${esc(v)}</text></g></svg>\n`;
}

function snippet(row, scanUrl) {
  return `[![credit](${scanUrl}badge/${row.slug}.svg)](${scanUrl}leaderboard.html#${row.slug})`;
}

function leaderboardHtml(board, { scanUrl }) {
  const status = board.ok ? '<span class="lit">lit</span>' : '<span class="dark">dark</span>';
  const list = board.rows.map((r, i) => `<tr><td>${i + 1}</td><td><a href="#${r.slug}">${esc(r.to.id)}</a> <small>(${r.to.type})</small></td><td><b>${r.total}</b></td><td>${r.grants.length}</td></tr>`).join('');
  const entries = board.rows.map(r => `<section class="card" id="${r.slug}"><h3>${esc(r.to.id)} <img src="badge/${r.slug}.svg" alt="credit ${r.total}"></h3>
<table><tr><th>from</th><th>weight</th><th>for</th><th>date</th><th>hash</th></tr>${r.grants.map(g => `<tr><td>${esc(g.from)}</td><td>${g.amount}</td><td>${esc(g.for)}</td><td>${esc(g.ts.slice(0, 10))}</td><td><code title="${esc(g.hash)}">${esc(g.hash.slice(0, 16))}…</code> <span class="lit">lit</span></td></tr>`).join('')}</table>
<p>README badge:</p><pre><code>${esc(snippet(r, scanUrl))}</code></pre></section>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Leaderboard — credit</title>
<style>
body{font:15px/1.6 system-ui,sans-serif;margin:0;background:#0f1115;color:#e6e6e6}
header{padding:16px 24px;border-bottom:1px solid #2a2d35;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
h1{font-size:18px;margin:0} main{padding:16px 24px;max-width:980px} a{color:#9ecbff} code{color:#9ecbff;font-size:13px}
pre{background:#0f1115;border:1px solid #2a2d35;border-radius:6px;padding:8px;overflow:auto}
.card{background:#161920;border:1px solid #2a2d35;border-radius:8px;padding:12px 16px;margin:12px 0}
.lit{color:#ffd54a;font-weight:600}.lit::before{content:"● "}.dark{color:#888;font-weight:600}.dark::before{content:"○ "}
table{border-collapse:collapse;width:100%} td,th{padding:6px 10px;border-bottom:1px solid #22252c;text-align:left;vertical-align:top} th{color:#9aa0aa;font-weight:500}
h3 img{vertical-align:middle;margin-left:8px}
</style></head><body>
<header><h1>credit</h1><nav><a href="./">Scan</a> · <a href="leaderboard.html"><b>Leaderboard</b></a> · <a href="how-it-works.html">How it works</a> · <a href="https://github.com/fitzyracing1/credit">GitHub</a></nav></header>
<main>
<div class="card">Ledger ${status}: ${board.verified} of ${board.count} grants verify (signature + hash chain). Only verified grants are counted. Credit is recognition only, not money. <a href="how-it-works.html">What do the numbers mean?</a></div>
<h2>Top recipients by verified credit</h2>
<table><tr><th>#</th><th>recipient</th><th>credit</th><th>grants</th></tr>${list || '<tr><td colspan="4">No verified grants yet.</td></tr>'}</table>
<h2>Grants per recipient</h2>
${entries}
</main></body></html>
`;
}
module.exports = { rank, badgeSvg, snippet, leaderboardHtml, slug };
