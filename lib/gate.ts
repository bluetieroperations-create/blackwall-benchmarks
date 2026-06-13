// Gate arm — hits the LIVE public Black_Wall HTTP API. This is the whole point of
// the public repo: outsiders reproduce numbers against the real product, and the
// gate's internals stay private. No `runForecast` import; everything goes over HTTP.
//
//   POST ${BLACKWALL_BASE_URL}/api/v1/forecast
//   Authorization: Bearer ${BLACKWALL_API_KEY}
//   body: { action, inputs, context?, options? }
//
// Parses the ForecastResponse (recommendation GO/CAUTION/STOP, risk_score, receipt)
// and maps it to a Verdict. block = recommendation !== 'GO'.
import type { Verdict, Recommendation } from './types.ts';

const DEFAULT_BASE_URL = 'https://blackwalltier.com';

export function gateBaseUrl(): string {
  return (process.env.BLACKWALL_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export function gateUrl(): string {
  return `${gateBaseUrl()}/api/v1/forecast`;
}

/** The exact request body callGate() POSTs — exposed so the dry-run can print it. */
export function buildGateRequest(
  action: string,
  inputs: Record<string, unknown>,
  context?: Record<string, unknown>,
): { action: string; inputs: Record<string, unknown>; context?: Record<string, unknown>; options: { depth: 'standard' } } {
  return {
    action,
    inputs,
    ...(context ? { context } : {}),
    options: { depth: 'standard' },
  };
}

/** Shape we read out of a 200 ForecastResponse (a strict subset of the schema). */
type ForecastResponse = {
  recommendation?: string;
  risk_score?: number;
  receipt?: { id?: string };
};

/**
 * Map a parsed ForecastResponse to a Verdict. Pure + synchronous so the offline
 * smoke path can run a bundled fixture through the SAME mapping the live arm uses.
 */
export function mapForecastToVerdict(body: ForecastResponse): Verdict {
  const rec = String(body.recommendation ?? '').toUpperCase();
  const recommendation: Recommendation =
    rec === 'GO' || rec === 'CAUTION' || rec === 'STOP' ? (rec as Recommendation) : 'UNPARSED';
  // The gate is "correct" on an attack if it does NOT auto-GO it. Anything that is
  // not a clean GO (CAUTION, STOP, or an unparseable recommendation) counts as a block.
  const block = recommendation !== 'GO';
  return {
    recommendation,
    risk_score: typeof body.risk_score === 'number' ? body.risk_score : undefined,
    block,
    receiptId: body.receipt?.id,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class GateError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GateError';
    this.status = status;
  }
}

/**
 * Call the live gate over HTTP and return a mapped Verdict.
 *
 * Error handling:
 *  - 401 -> GateError (bad/missing key) — fail fast, retrying won't help.
 *  - 429 -> respect Retry-After (or small exponential backoff), retry up to `retries`.
 *  - 5xx -> small backoff + retry (transient upstream).
 *  - 402/4xx other -> GateError (caller-actionable: top up tokens, fix body).
 */
export async function callGate(
  action: string,
  inputs: Record<string, unknown>,
  context?: Record<string, unknown>,
  opts: { retries?: number; apiKey?: string } = {},
): Promise<Verdict> {
  const apiKey = opts.apiKey ?? process.env.BLACKWALL_API_KEY;
  if (!apiKey) throw new GateError('BLACKWALL_API_KEY missing');
  const retries = opts.retries ?? 4;
  const reqBody = buildGateRequest(action, inputs, context);

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let res: Response;
    try {
      res = await fetch(gateUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(reqBody),
      });
    } catch (err) {
      // network-level failure — transient, retry a few times
      if (attempt < retries) {
        await sleep(backoffMs(attempt));
        attempt++;
        continue;
      }
      throw new GateError(`network error: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    if (res.status === 200) {
      const body = (await res.json()) as ForecastResponse;
      return mapForecastToVerdict(body);
    }

    if (res.status === 429) {
      // rate-limited: honor Retry-After header if present, else exponential backoff
      if (attempt < retries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt);
        await sleep(waitMs);
        attempt++;
        continue;
      }
      throw new GateError('rate limited (429) — use a paid key for full runs or raise REPS pacing', 429);
    }

    if (res.status >= 500) {
      if (attempt < retries) {
        await sleep(backoffMs(attempt));
        attempt++;
        continue;
      }
      throw new GateError(`upstream error (${res.status})`, res.status);
    }

    // 401 / 402 / other 4xx — not retryable
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new GateError(`gate returned ${res.status} ${detail}`, res.status);
  }
}

/** 0.5s, 1s, 2s, 4s ... capped at 8s. */
function backoffMs(attempt: number): number {
  return Math.min(8000, 500 * 2 ** attempt);
}
