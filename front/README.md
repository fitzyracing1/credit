# credit front — credit in front of bots

A reusable composite Action (`fitzyracing1/credit/front@main`) the owner installs on
repos **they own**. It puts the repo's credit balance in front of bot (and human) PRs,
and proposes — never signs — credit for merged contributions.

Install: copy [`examples/workflows/credit-front.yml`](../examples/workflows/credit-front.yml)
into `.github/workflows/` of your repo.

## Modes

| mode | trigger | what it does |
|---|---|---|
| `bot-prs` | Dependabot / Renovate opens or updates a PR | one **sticky** comment: `CREDIT.json` balance, [scan page](https://fitzyracing1.github.io/credit/) link, give-credit line. Re-runs update the same comment. |
| `every-pr` | any PR opened or updated | same sticky comment on every PR |
| `on-merge` | a PR is merged | **UNSIGNED** grant proposal for the PR author (all-contributors style): dry-run comment on the PR + `credit-proposal` run artifact (`proposal.json` + `proposal.md`) + a PR updating the README "Contributors credit" section (branch `credit/contributors`) |

The sticky comment is found by the `<!-- credit-front -->` marker and updated in place.
The README block lives between `<!-- credit-contributors -->` and
`<!-- /credit-contributors -->` and is idempotent per (author, PR) — re-runs never
double-count. Bot authors never get proposals.

## What it will never do

- **Sign or append to the ledger.** Grants are ed25519-signed; the private key lives in
  `~/.config/credit` on the owner's machine and never enters CI. The proposal comment
  prints the exact `credit give … --for "…"` command; `give` stays dry-run unless the
  owner adds `--send`.
- **Touch any other repo.** It hard-checks that the PR's base repo equals
  `GITHUB_REPOSITORY` and otherwise skips — no comments on other people's repos.
- **Use secrets beyond `GITHUB_TOKEN`**, publish to npm, or touch the (off) `rails/`.

## Inputs

| input | default | notes |
|---|---|---|
| `mode` | *(required)* | `bot-prs` \| `every-pr` \| `on-merge` |
| `ledger-url` | the public `grants.jsonl` raw URL | ledger is verified (lit/dark) before rendering; dark = no comment |
| `scan-url` | `https://fitzyracing1.github.io/credit/` | |
| `token` | `${{ github.token }}` | pull-requests write; plus contents write for on-merge |
| `bots` | `dependabot[bot],dependabot-preview[bot],renovate[bot],renovate-bot` | matched case-insensitively |
| `amount` | `1` | credit proposed per merged PR |
| `readme` | `README.md` | file holding the contributors section |
| `open-pr` | `true` | `false` = on-merge posts the comment/artifact but skips the README PR |

Output `result`: `commented` | `updated` | `proposed` | `skipped`.

## Why `pull_request_target` in the example workflow

Dependabot-triggered `pull_request` runs get a read-only `GITHUB_TOKEN` and could not
comment. `pull_request_target` runs with normal permissions and is safe here because PR
head code is **never** checked out or executed — only the action repo and (for on-merge)
this repo's default branch.
