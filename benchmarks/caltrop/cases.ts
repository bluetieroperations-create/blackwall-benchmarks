// Caltrop forgery-rejection battery.
//
// Each case is an adversarial token/URL variant that MUST be rejected by the
// deployed canary verifier. The security property under test:
//
//   every forged / malformed request is rejected with its EXPECTED 4xx code (404
//   for a refused token, 405 for a disallowed method) and produces NO fire —
//   never a 2xx (a forgery accepted AND a fire recorded) and never a 5xx (the
//   route crashing on hostile input).
//
// We assert the SPECIFIC expected code, not merely "some 4xx": a 401/403 (auth
// wall / WAF) or 429 (rate-limit) is NOT "the verifier refused the token" and must
// not score as a clean pass. A 2xx or 5xx anywhere is a real finding — that is what
// makes this benchmark non-vacuous: it can fail.
//
// HONEST DISCRIMINATION NOTE: a dumb "always return 404" stub would pass every
// `klass: 'garbage'` and `klass: 'structural'` case. The only cases that require
// real per-method handling are `klass: 'method'`. The deeper guarantee — that a
// VALID token DOES fire and a TAMPERED one does not — is proven in the PRIVATE
// forecast-app suite (it needs the production signing key and would leak the token
// format). This public suite is a REGRESSION GUARD that the live verifier never
// accepts a forgery, not a proof that the verifier works end-to-end.
//
// STEALTH NOTE: these are GENERIC forgeries; none encodes Caltrop's real token
// payload schema, so publishing this file does not let an attacker fingerprint live
// canary URLs.

export type ForgeryCase = {
  id: number;
  klass: 'garbage' | 'structural' | 'method';
  probe: string; // the weakness this case would expose if it returned 2xx or 5xx
  method?: string; // default GET
  token: string; // the raw path segment placed after /api/v1/caltrop/
  expect: number; // the exact status a correct deployment returns (404 token / 405 method)
};

// Exceeds the handler's documented token length cap (8192) but stays well under the
// platform's URL-length limit (last-good observed ~12000 chars; ~13000+ → Vercel edge
// 502 BEFORE the route runs). So this lands ON our handler and tests OUR cap → 404.
// (URLs past the platform limit are infra behavior, not Caltrop — see README.)
const OVER_CAP = 'A'.repeat(9000);

// Pathological inputs the platform rejects/normalizes UPSTREAM (a ~20k-char URL → 502,
// a lone "." → 308→404) are intentionally excluded: they test Vercel's routing, not
// Caltrop, and produce no fire either way. See README "Out of scope".
export const FORGERY_CASES: ForgeryCase[] = [
  { id: 1, klass: 'garbage', probe: 'single junk character', token: 'x', expect: 404 },
  { id: 2, klass: 'garbage', probe: 'opaque garbage, no separator', token: 'Zm9yZ2VkLW5vdC1hLXRva2Vu', expect: 404 },
  { id: 3, klass: 'structural', probe: 'well-formed two-segment shape, unsigned (random bytes both halves)', token: 'Y2FmZWJhYmU.ZGVhZGJlZWY', expect: 404 },
  { id: 4, klass: 'structural', probe: 'extra segments (multiple separators)', token: 'aaa.bbb.ccc.ddd', expect: 404 },
  { id: 5, klass: 'garbage', probe: 'illegal (non-base64url) characters', token: 'not*a*valid*token', expect: 404 },
  { id: 6, klass: 'structural', probe: 'over the handler length cap (8192), under the platform URL limit', token: OVER_CAP, expect: 404 },
  { id: 7, klass: 'structural', probe: 'leading + trailing separators', token: '.YWJj.', expect: 404 },
  { id: 8, klass: 'structural', probe: 'second segment empty (missing signature)', token: 'Y2FmZWJhYmU.', expect: 404 },
  { id: 9, klass: 'structural', probe: 'first segment empty (missing payload)', token: '.ZGVhZGJlZWY', expect: 404 },
  { id: 10, klass: 'method', probe: 'wrong HTTP method (POST) on a plausible token', method: 'POST', token: 'Y2FmZWJhYmU.ZGVhZGJlZWY', expect: 405 },
  { id: 11, klass: 'method', probe: 'wrong HTTP method (DELETE)', method: 'DELETE', token: 'Y2FmZWJhYmU.ZGVhZGJlZWY', expect: 405 },
  { id: 12, klass: 'method', probe: 'wrong HTTP method (PUT)', method: 'PUT', token: 'Y2FmZWJhYmU.ZGVhZGJlZWY', expect: 405 },
];
