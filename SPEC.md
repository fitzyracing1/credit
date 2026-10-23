# CREDIT-1: Open Credit Attribution Format

Status: Draft · Version: `CREDIT-1` · License: MIT

## 1. Purpose
CREDIT-1 is a tiny, static, machine-readable way for any site, app, org or person
to publish **who they credit, for what, and when**. It is to attribution what
`robots.txt` is to crawling and `security.txt` is to disclosure.

## 2. Location
- Websites: `https://<domain>/.well-known/credit.json`
- GitHub repos: `credit.json` or `.well-known/credit.json` at the repo root
- Apps/people: any stable HTTPS URL; link it with `<link rel="credit" href="...">`

Served as `application/json`, UTF-8, max 1 MB.

## 3. Document
| field | type | req | notes |
|---|---|---|---|
| `credit` | `"CREDIT-1"` | yes | version tag |
| `publisher` | Entity | yes | who is giving credit |
| `updated` | RFC 3339 datetime | no | |
| `credits` | Credit[] | yes | may be empty |
| `signature` | Signature | no | see §6 |

Unknown fields are invalid in CREDIT-1 (future versions bump the tag).

## 4. Entity
`{ "type": "github"|"company"|"person"|"domain"|"eth", "id": string, "name"?: string, "url"?: uri }`

Canonical ids: `github` → `owner` or `owner/repo`; `company`/`domain` → registrable domain;
`eth` → 0x address; `person` → a stable handle. Ids compare case-insensitively.

## 5. Credit
`{ "to": Entity, "for": string(1..1000), "date": "YYYY-MM-DD", "weight"?: 1..100 (default 1), "tags"?: string[] }`

## 6. Signature (optional)
`{ "alg": "ed25519"|"eip191", "key": string, "sig": string }` over the canonical JSON
(keys sorted, no whitespace) of the document **without** the `signature` field.
`eip191` keys are 0x addresses (lets an `eth` publisher prove control).
The reference validator checks shape only; verification is left to consumers.

## 7. Scoring (informative)
For each valid document: for each credit with `to ≠ publisher`, add `weight` to
`given[publisher]` and `received[to]`. Self-credit is ignored. Scorers MUST fetch
read-only, honour `robots.txt`, and identify with a User-Agent.

Scores may be committed on-chain as a Merkle root (`CreditRegistry`), leaf =
`keccak256(keccak256(abi.encode(account, given, received, epoch)))`, sorted-pair hashing.

## 8. On-chain benefits (informative) — ⚠️ LEGAL NOTICE
The reference `SpaceCreditRouter` (for SPACE, space-money) offers two benefits:

**(a) Fee discount** — fee falls linearly with credit score, up to `maxDiscountBps`. On by default.

**(b) Revenue share** — a pro-rata slice of incoming fees paid to credit-givers by `given` score.
**OFF by default**, enabled only by an admin flag (`setRevenueShare`).

> ⚠️ **Enabling revenue share may cause credits (or credit scores) to be treated as an
> investment contract / security under U.S. securities law (e.g. the Howey test) and
> similar laws elsewhere.** Do **not** enable it without qualified legal review.
> Nothing in this repository is deployed anywhere.

## 9. Security
Credit is a claim by the publisher, not a fact. Consumers should weigh by publisher
reputation, rate-limit fetches, and cap document size. Sybil resistance is out of scope for CREDIT-1.
