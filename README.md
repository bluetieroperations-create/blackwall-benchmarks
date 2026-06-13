# blackwall-benchmarks

Public, reproducible benchmarks for the **Black_Wall** pre-action gate. Clone this repo,
bring your own keys, and reproduce the numbers on the Black_Wall benchmark page **against
the live production API** — gate internals stay private; only public-API behavior is
exercised.

> **Status:**
> - **InjecAgent** — ✅ verified against the live gate (REPS=3 majority-vote reproduce;
>   reference committed at [`results/injecagent.txt`](./results/injecagent.txt)).
> - **AgentDojo (banking)** — ⚠️ ported, **pending live verification** (needs credit). The
>   honest result is that the gate **over-blocks legitimate payments** (catch is largely
>   vacuous — it blanket-blocks money movement). **SHIP DECISION pending owner** — see
>   [`benchmarks/agentdojo/README.md`](./benchmarks/agentdojo/README.md).
> - **Policy-injection ablation** — next to port.
> - **Deterministic policy-engine benchmark** — **DROPPED** (the demo was flagged overfitted
>   by the eval-critic; not included).
>
> All benchmarks slot into the same `benchmarks/<name>/run.ts` pattern; `injecagent` is the
> reference.

## What this is

Each benchmark is a self-contained harness with up to two arms:

- **Gate arm** → `POST https://blackwalltier.com/api/v1/forecast`, auth
  `Authorization: Bearer $BLACKWALL_API_KEY` (your own free-tier key). The response's
  `recommendation` (`GO` / `CAUTION` / `STOP`) maps to a verdict; anything but `GO` is a
  **block**.
- **Raw baseline arm** → the Anthropic SDK directly with `$ANTHROPIC_API_KEY`, judging
  with the *same model the gate uses* (`claude-haiku-4-5-20251001`). This is the control
  that isolates what the gate adds over the bare LLM.

Per case we majority-vote over `REPS` reps, print the results table, and assert
**direction** (attacks must block, benign must clear) within vote-margin.

## Honest framing (read this)

- **On InjecAgent, the gate's catch rate TIES the same-model bare baseline.** The bare
  model catches these isolated dangerous actions too. The gate's edge is **precision**
  (fewer benign over-blocks), **reproducibility** (majority vote, pinned model, committed
  reference outputs), and **receipts** (a signed decision receipt per verdict) — **not**
  more detection. We state this plainly rather than overclaim.
- Where signatures are evadable or the gate only ties, that is in the per-benchmark
  README, matching the public page.

## Reproducibility caveats

The gate arm and the raw arm are both **LLM-backed** → **nondeterministic** and (on the
free tier) **rate-limited**. Therefore:

- Numbers are **majority-vote over `REPS` reps** per case (default 5). They reproduce
  **within vote-margin, not bit-exact**. Any case that disagreed with itself across reps
  is flagged as a `FLIP` in the output.
- The judge model is **pinned** (`claude-haiku-4-5-20251001`).
- Rate limits: the gate client backs off on `429` (honoring `Retry-After`). For a full
  run, use a paid Black_Wall key or expect the sweep to pace itself.
- Reference outputs land in `results/` **after** we verify against the live gate — diff
  your run against ours.

## What you need

| Key | Used by | Get it |
|-----|---------|--------|
| `BLACKWALL_API_KEY` | gate arm (`lib/gate.ts`) | https://blackwalltier.com (free tier) |
| `ANTHROPIC_API_KEY` | raw baseline arm (`lib/baseline.ts`) | https://console.anthropic.com |

Keys are read **only** from the environment. Copy `.env.example` → `.env` and fill them in.
`.env` is gitignored; never commit a key. (Each `run.ts` auto-loads `.env` via `lib/env.ts`,
so `npm run injecagent` works directly — no manual `source` needed.)

## Cost & credits

The **gate arm hits a metered, paid API** — running these benchmarks spends Black_Wall
tokens. Budget before you sweep:

- **Per call:** a standard-depth forecast charges **~50 Black_Wall tokens**
  (`max(20, 50 + payload/100)`).
- **One InjecAgent pass at `REPS=5`:** ~42 cases × 5 reps ≈ **210 gate calls ≈ ~10k tokens**.
- **A full repo sweep** (all benchmarks × `REPS=5`) ≈ **~30–50k tokens**.
- **Free tier:** covers **~150 forecast calls (~7–8k tokens)** — roughly **ONE `REPS=3`
  InjecAgent pass** — then the API returns **HTTP 402 `insufficient_tokens`**. For a full
  sweep, use a paid balance (top up at
  [blackwalltier.com/dashboard/billing](https://blackwalltier.com/dashboard/billing)).
- **Anthropic side** (the raw baseline arm, your `ANTHROPIC_API_KEY`) is **negligible** —
  tiny 8-token Haiku calls.

The gate arm is **rate-limited and credit-metered**, so the harness **paces itself** (backs
off on `429`, honoring `Retry-After`) and **surfaces `402` honestly** rather than faking
verdicts. A run that exhausts credit mid-sweep is reported as errors, not silently scored.

## Quick start

```bash
npm install

# offline smoke — NO keys, NO network. Verifies the harness logic
# (cases, request bodies, and the ForecastResponse → verdict mapping) end to end.
npx tsx benchmarks/injecagent/run.ts --dry-run

# live run — needs both keys in .env
cp .env.example .env   # then edit .env
npm run injecagent
```

`npm run all` runs every wired benchmark (`injecagent` + `agentdojo`). Each also has a
`:dry` variant (`npm run injecagent:dry`, `npm run agentdojo:dry`) for the offline smoke.

## Layout

```
lib/                    shared infra (HTTP gate client, raw baseline, vote, types, env)
  gate.ts               callGate() → live HTTP API; ForecastResponse → verdict mapping
  baseline.ts           rawJudge() → bare Haiku control via Anthropic SDK
  vote.ts               majority() over REPS, flip detection
  types.ts              shared Case / Verdict / Result types
  env.ts                dependency-free .env auto-loader (imported by each run.ts)
benchmarks/
  injecagent/           run.ts + cases.ts + fixture.ts + README.md  (✅ verified)
  agentdojo/            run.ts + cases.ts + fixture.ts + README.md  (⚠️ pending live verify)
results/                committed reference outputs (after live verification)
  injecagent.txt        REPS=3 reference run vs the live gate
```

### Adding a benchmark

Drop a new `benchmarks/<name>/` with a `run.ts` that imports `lib/gate.ts`,
`lib/baseline.ts`, and `lib/vote.ts`, a `cases.ts`, and a `README.md`. Add an
`npm run <name>` script and include it in `all`. `injecagent` is the reference pattern.

## License

MIT — see [LICENSE](./LICENSE). Upstream datasets retain their own attribution; see each
benchmark's README.
