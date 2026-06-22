// Caltrop forgery-rejection harness — exercises the PUBLIC, unauthenticated canary
// callback route on the live deployment. Unlike the gate benchmarks, this is
// DETERMINISTIC: there is no LLM and no majority vote. Each adversarial token is a
// plain HTTP request whose status code is the verdict.
//
// Property asserted (the benchmark FAILS if violated): every forged/malformed request
// returns its EXPECTED 4xx (404 for a refused token, 405 for a disallowed method) and
// records NO fire — never a 2xx (forgery accepted + fire) and never a 5xx (crash). We
// match the SPECIFIC expected code: a 401/403/429 is not "the verifier refused it" and
// is flagged as an unexpected-code FAIL, not a clean pass.
//
// SCOPE (read the README): this measures detection INTEGRITY (no false-fires under
// adversarial input) and is a public REGRESSION GUARD that the live verifier never
// accepts a forgery. It is NOT attack COVERAGE, and NOT proof the verifier works
// end-to-end — an "always-404" stub would pass every non-method case. The positive
// path (a valid token DOES fire) is covered by the private forecast-app suite.
//
//   npx tsx benchmarks/caltrop/run.ts            # live (no key needed — public route)
//   npx tsx benchmarks/caltrop/run.ts --dry-run  # offline: print the requests it WOULD send
import '../../lib/env.ts'; // auto-load .env (KEY=VALUE) before anything reads process.env
import { FORGERY_CASES, type ForgeryCase } from './cases.ts';

const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--dry') || process.env.DRY_RUN === '1';
const BASE = (process.env.BLACKWALL_BASE_URL ?? 'https://blackwalltier.com').replace(/\/+$/, '');
const N = FORGERY_CASES.length;

function urlFor(c: ForgeryCase): string {
  // Encode the token as a single path segment so raw bytes can't break out of the
  // /api/v1/caltrop/<token> route (which is itself part of the test — a forgery must
  // never escape the handler).
  return `${BASE}/api/v1/caltrop/${encodeURIComponent(c.token)}`;
}

function header(): void {
  console.log(`\nCALTROP — forgery-rejection battery (${N} adversarial cases) vs ${BASE}`);
  console.log(
    `Property: every forged/malformed request returns its EXPECTED 4xx (404 refuse /\n` +
    `405 method) and records no fire. A 2xx (accepted + fire), 5xx (crash), or any\n` +
    `unexpected code = FAIL. Deterministic: HTTP status is the verdict — no LLM, no key.`,
  );
}

function dryRun(): void {
  header();
  console.log(`\n*** DRY RUN (offline) — no network. Requests the harness WOULD send: ***\n`);
  for (const c of FORGERY_CASES) {
    const t = c.token.length > 40 ? `${c.token.slice(0, 37)}…(${c.token.length} chars)` : c.token;
    console.log(`[#${String(c.id).padStart(2)}] ${(c.method ?? 'GET').padEnd(6)} ${c.klass.padEnd(10)} expect ${c.expect}  ${urlFor({ ...c, token: t })}`);
    console.log(`        probe: ${c.probe}`);
  }
  console.log(`\n(${N} cases. Run without --dry-run to execute them against ${BASE}.)`);
}

async function fetchStatus(c: ForgeryCase): Promise<number> {
  const url = urlFor(c);
  const method = c.method ?? 'GET';
  // The route is static + cheap; the only backoff we need is for the free-tier 429.
  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { method, redirect: 'manual' });
    } catch (e) {
      // A network/transport failure is not a verdict — surface it loudly.
      throw new Error(`request #${c.id} (${method}) failed at the transport layer: ${(e as Error).message}`);
    }
    if (res.status === 429) {
      const parsed = Number(res.headers.get('retry-after'));
      const retry = Number.isFinite(parsed) ? parsed : 2; // tolerate missing / HTTP-date / garbage
      await new Promise((r) => setTimeout(r, Math.min(30, Math.max(1, retry)) * 1000));
      continue;
    }
    return res.status;
  }
  throw new Error(`request #${c.id} kept returning 429 after retries — rerun later or use a paid key`);
}

type Row = { c: ForgeryCase; status: number; clean: boolean; accepted: boolean; crashed: boolean };

async function live(): Promise<void> {
  header();
  console.log('');
  const rows: Row[] = [];
  for (const c of FORGERY_CASES) {
    const status = await fetchStatus(c);
    const accepted = status >= 200 && status < 300; // forgery ACCEPTED (and, for a valid GET path, a fire)
    const crashed = status >= 500;
    const clean = status === c.expect; // the exact code a correct deployment returns
    rows.push({ c, status, clean, accepted, crashed });
    const verdict = accepted ? `ACCEPTED(${status})!` : crashed ? `CRASH(${status})!` : clean ? `${status} ✓` : `UNEXPECTED(${status})!`;
    console.log(`[#${String(c.id).padStart(2)}] ${(c.method ?? 'GET').padEnd(6)} ${c.klass.padEnd(10)} -> ${verdict.padEnd(16)} ${c.probe}`);
  }

  // Per-class breakdown so the headline isn't a misleading blended fraction.
  for (const k of ['garbage', 'structural', 'method'] as const) {
    const inK = rows.filter((r) => r.c.klass === k);
    const ok = inK.filter((r) => r.clean).length;
    console.log(`  ${k.padEnd(10)}: ${ok}/${inK.length} returned the expected code`);
  }

  const clean = rows.filter((r) => r.clean).length;
  const accepted = rows.filter((r) => r.accepted).length;
  const crashed = rows.filter((r) => r.crashed).length;
  const unexpected = rows.filter((r) => !r.clean && !r.accepted && !r.crashed).length;

  console.log(`\nRESULT: ${clean}/${N} returned the expected code.  accepted(2xx): ${accepted}.  crashed(5xx): ${crashed}.  unexpected-code: ${unexpected}.`);
  console.log(
    `A non-2xx means the verifier never reached buildFireEvent, so no fire is recorded —\n` +
    `i.e. zero false-fires across the battery. (Status-only by design: the harness has no\n` +
    `read access to the private fires table.) Note: an "always-404" stub would also pass\n` +
    `every non-method case — this guards against a forgery being ACCEPTED, it does not\n` +
    `prove valid tokens fire (that positive proof is private).`,
  );

  const ok = accepted === 0 && crashed === 0 && unexpected === 0 && clean === N;
  if (!ok) {
    console.error(`\n✗ FAIL: ${accepted} accepted, ${crashed} crashed, ${unexpected} unexpected-code, ${clean}/${N} clean. Every forgery must return its expected 4xx.`);
  } else {
    console.log(`\n✓ PASS: every forged/malformed token returned its expected 4xx and recorded no fire.`);
  }
  // process.exitCode (not process.exit): let the event loop drain so a real FAIL exits
  // with 1, not the Windows libuv UV_HANDLE_CLOSING abort (exit 127 + truncated output).
  process.exitCode = ok ? 0 : 1;
}

(DRY_RUN ? Promise.resolve(dryRun()) : live()).catch((e) => {
  console.error(`\nharness error: ${(e as Error).message}`);
  process.exitCode = 1;
});
