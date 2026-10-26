# credit — CREDIT-1

**Give credit where it's due — in a file anyone can read.**

Open source runs on gratitude that nobody can see. CREDIT-1 is a dead-simple open
standard: drop a `/.well-known/credit.json` on your site (or repo) listing who you
credit — GitHub repos, companies, people — for what, and when. Crawlers tally it,
anyone can verify it, and protocols can reward it.

```json
{
  "credit": "CREDIT-1",
  "publisher": { "type": "github", "id": "fitzyracing1" },
  "credits": [
    { "to": { "type": "github", "id": "foundry-rs/foundry" }, "for": "Solidity toolchain", "date": "2026-10-23", "weight": 10 }
  ]
}
```

## What's here
| path | what |
|---|---|
| `SPEC.md` | the CREDIT-1 spec |
| `schema/credit-1.schema.json` | JSON Schema (2020-12) |
| `examples/` | example documents (one intentionally invalid) |
| `tools/credit_validate.py` | zero-dep validator CLI — prints `lit` / `dark` |
| `tools/credit_score.py` | zero-dep scorer; fetches read-only, honours robots.txt |
| `front/action.yml` | "credit in front of bots" Action — sticky PR comments + on-merge dry-run proposals |
| `src/CreditRegistry.sol` | on-chain Merkle roots of credit scores |
| `src/SpaceCreditRouter.sol` | SPACE fee router: credit discount + (off) revenue share |

```sh
python3 tools/credit_validate.py examples/*.json
python3 tools/credit_score.py examples/.well-known/credit.json example.com
python3 -m unittest discover -s tests
forge test
```

## space-money integration
Targets the SPACE token from [space-money](https://github.com/fitzyracing1/space-money)
(mainnet `0x0af05969C412Dc1E07be5fC5A4e141214aAe846e`). This repo does **not** touch that
contract and **nothing is deployed** — tests run against a mock on a local EVM only.

- **Fee discount** (on): higher credit score → lower router fee (up to 50% off).
- **Revenue share** (**OFF by default**, admin flag): a pro-rata slice of fees to credit-givers.

> ## ⚠️ Legal warning — revenue share
> Turning on revenue share **may make credits an investment contract / security under
> securities law**. It ships disabled. **Get legal review before enabling.** See SPEC §8.

## Give credit (CLI, `repo-credit`)
[![credit](https://img.shields.io/endpoint?url=https://fitzyracing1.github.io/credit/badges/repo-fitzyracing1--credit.json)](https://fitzyracing1.github.io/credit/)

Signed (ed25519), hash-chained, append-only grants in [`ledger/grants.jsonl`](ledger/grants.jsonl).
Node ≥ 20, zero dependencies. **Not published to npm** — run from a clone (`npm link` for a global `credit`).

```sh
node cli/credit.js keygen --as <your-github-user>   # private key -> ~/.config/credit (never committed/printed)
node cli/credit.js give octocat/hello 5 --for "saved me a week"   # appends grant; PR + email are DRY-RUN
node cli/credit.js give octocat 5 --for "..." --send               # actually opens the CREDIT.json PR
node cli/credit.js verify                                          # lit / dark
node cli/credit.js site                                            # refresh docs/ (scan page + badges)
npm test
```

- **Scan page**: `docs/` is GitHub Pages-ready (Settings → Pages → `main` / `docs`). Verifies every grant in the browser and shows lit/dark.
- **Badges**: `https://img.shields.io/endpoint?url=https://fitzyracing1.github.io/credit/badges/<user|repo>-<id>.json` (`/` → `--`).
- **Repo wallet**: add [`examples/workflows/credit-wallet.yml`](examples/workflows/credit-wallet.yml) to your repo; the [`action.yml`](action.yml) fetches the ledger, verifies it, and opens a PR in *your* repo syncing `CREDIT.json` — plus (unless `funding: "false"`) the same scan-page funding pointers as below, never overwriting existing values.
- **Crawler-readable**: `credit site` also writes [`docs/feed.json`](docs/feed.json) (balances per recipient + every signed grant with hash/signature) and [`docs/feed.xml`](docs/feed.xml) (Atom) so ecosyste.ms / thanks.dev-style crawlers can read the ledger; both are linked from the scan page's `<head>`. `package.json#funding` and [`.github/FUNDING.yml`](.github/FUNDING.yml) point at the scan page (`custom:` only — no sponsor accounts; credit is not money). `credit funding --dir <repo>` drops the same two pointers into any repo.
- **Credit in front of bots**: add [`examples/workflows/credit-front.yml`](examples/workflows/credit-front.yml) to a repo *you own*; the [`front/action.yml`](front/action.yml) Action keeps **one sticky comment** on PRs with the repo's `CREDIT.json` balance, a scan-page link, and a give-credit line (`bot-prs` mode = Dependabot/Renovate only, `every-pr` = all PRs), and on merge (`on-merge` mode, all-contributors style) **proposes** an *unsigned* grant for the PR author — dry-run comment + run artifact + a README "Contributors credit" PR. It **never signs or appends to the ledger** (the key never enters CI; `give` stays dry-run unless the owner runs `--send`), only ever acts on the repo it's installed in, and needs no secret beyond `GITHUB_TOKEN`. Details: [`front/README.md`](front/README.md).
- **Future rails (OFF)**: `rails/` holds an ERC-20-style token mirror (no deploy) and a bank-payout adapter interface (no provider), gated by `config/rails.json`. ⚠️ **Needs legal review** before enabling either.
- Credit is recognition only — not money, not a security.

## License
MIT © 2026 Joshua Almeida

## Plans

This project is free, and its license stays as is. Support it through [GitHub Sponsors](https://github.com/sponsors/fitzyracing1):

- **Free**: use the code, community support.
- **Pro ($49/month)**: priority issues and support.
- **Team ($199/month)**: priority support for your team plus early access.
