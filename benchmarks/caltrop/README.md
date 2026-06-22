# Caltrop — forgery-rejection benchmark

A **deterministic** benchmark for the **Caltrop** canary-tripwire module. Unlike the
gate benchmarks in this repo (LLM-backed, majority-vote, nondeterministic), this one
has no model and no vote: each adversarial token is a plain HTTP request to the public
canary route, and the **HTTP status is the verdict**.

```
npx tsx benchmarks/caltrop/run.ts            # live (no key needed — public route)
npx tsx benchmarks/caltrop/run.ts --dry-run  # offline: print the requests it WOULD send
# or: npm run caltrop  /  npm run caltrop:dry
```

No Black_Wall key is required — the canary callback route is public and unauthenticated
by design (a planted decoy URL has to be fetchable by anyone/anything). Reproduce it
against your own deployment with `BLACKWALL_BASE_URL=...`.

## What it measures (and what it does not)

Caltrop plants unique, Ed25519-signed decoy URLs. A genuine fetch of one is deterministic
**proof** of exfil/recon. The property this harness checks is the inverse and is the one
that makes Caltrop **safe to expose publicly**:

> Every forged/malformed request returns its **expected 4xx** (`404` for a refused token,
> `405` for a disallowed method) and records **no fire**. Never a **2xx** (a forgery
> accepted *and* a fire recorded) and never a **5xx** (the route crashing on hostile input).

We assert the **specific** expected code, not merely "some 4xx": a `401`/`403` (auth wall /
WAF) or `429` (rate-limit) is *not* "the verifier refused the token" and is flagged as an
unexpected-code FAIL. A `2xx` or `5xx` anywhere is a real finding — that is what makes this
**non-vacuous** (it can fail; during development it did, on two mis-aimed probes — see
*Out of scope*).

**This is an integrity check / regression guard, not a coverage score.** Read these limits:

- **It does not measure attack _coverage_.** Caltrop only catches an attack that actually
  *touches* a planted decoy; whether an attack touches the bait depends on placement + the
  agent. We make **no** "% of attacks caught" claim here.
- **It does not prove the verifier _works end-to-end_.** A dumb "always return `404`" stub
  would pass every non-method case. This battery proves a forgery is never **accepted**; it
  does **not** prove a *valid* token *does* fire. That positive proof — and the
  signature-specific tamper cases — live in the **private** `forecast-app` suite (minting a
  valid token needs the production signing key, and publishing the token byte-structure
  would let attackers fingerprint live canaries). So a public reader sees half the proof,
  by design.
- **Status-only.** The harness asserts the HTTP status; it has no read access to the private
  `caltrop_fires` table. But a **non-2xx guarantees the verifier returned before any fire
  could be built**, so "rejected" implies "no fire."

### Reference result (live, `blackwalltier.com`)

```
12/12 returned the expected code.  accepted(2xx): 0.  crashed(5xx): 0.  unexpected-code: 0.
  garbage   : 3/3    structural: 6/6    method: 3/3
```

The `method` cases (POST/DELETE/PUT → `405`) are the only ones an "always-404" stub would
fail — they're the harness's real discrimination over a trivial reject-everything route.

## Out of scope (transparency)

Excluded because they exercise the platform's URL handling, not the Caltrop verifier, and
produce no fire either way:

- **URLs longer than the platform limit** (observed: ~12000 chars last-good, ~13000+ → a
  Vercel edge `502` *before* the route runs). Our own 8192-char token cap is tested by
  case 6 (9000 chars — over our cap, under the platform limit → `404` at the handler).
  *Caveat:* case 6's `404` depends on your deployment's URL limit exceeding 9000; a `502`
  there means "your platform's URL cap is below ours," not a Caltrop bug — the harness
  can't auto-distinguish.
- **A lone `.` path segment** → normalized to a `308` redirect that resolves to `404`.
- **`OPTIONS`** → `204` (CORS preflight; no token processing, no fire). Known, benign; not
  asserted because it's a 2xx by design and would trip the "no 2xx" gate.

Including these would measure Vercel, not Caltrop. They are noted here rather than hidden.

## Coverage study (future)

A genuine attack-**coverage** number ("of N exfil attacks against an agent with a planted
canary, how many trip it, with 0 false-fires on M benign tasks") needs a real LLM-agent
harness and is a separate, larger effort — intentionally not part of this deterministic
benchmark.
