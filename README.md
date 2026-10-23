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

## License
MIT © 2026 Joshua Almeida
