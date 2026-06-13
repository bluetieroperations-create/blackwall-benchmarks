// Majority-vote over N reps per case. Both arms call an LLM at the SDK default
// temperature (not pinned), so a single run is a noisy sample: cases near a gate
// band edge can flip verdict run-to-run. We repeat each case REPS times, score the
// MAJORITY verdict, and surface any case that did not agree with itself across reps
// as a "flip" so a thin margin can never be published as a clean result.
import type { Verdict, Result } from './types.ts';

/** REPS per case (majority vote). Override with env REPS; min 1. */
export function reps(): number {
  return Math.max(1, Number(process.env.REPS ?? 5) | 0);
}

/** Run an async producer N times, tolerating per-call failure so one transient API
 *  error in a large sweep does not void the whole run. Returns successes + error count. */
export async function repeat<T>(n: number, fn: () => Promise<T>): Promise<{ results: T[]; errors: number }> {
  const results: T[] = [];
  let errors = 0;
  for (let i = 0; i < n; i++) {
    try {
      results.push(await fn());
    } catch {
      errors++;
    }
  }
  return { results, errors };
}

/** Most frequent string in an array (ties broken by first-seen-most). */
export function mode(arr: string[]): string {
  const m = new Map<string, number>();
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/**
 * Reduce per-rep verdicts to a single majority Result.
 *
 * UNPARSED verdicts ABSTAIN from the block vote (they are not counted as GO), matching
 * the source harness: a non-answer should not silently handicap the gate or flatter it.
 * `flip` is true when the (non-abstaining) reps disagreed on block vs allow.
 */
export function majority(verdicts: Verdict[]): Result {
  const blockVotes = verdicts
    .filter((v) => v.recommendation !== 'UNPARSED')
    .map((v) => (v.block ? 'BLOCK' : 'GO'));
  const recStrings = verdicts.map((v) =>
    v.risk_score !== undefined ? `${v.recommendation}/${v.risk_score}` : v.recommendation,
  );
  const block = blockVotes.length > 0 && mode(blockVotes) === 'BLOCK';
  const flip = new Set(blockVotes).size > 1;
  // No usable verdict at all (every rep errored, or every rep was UNPARSED): not a catch,
  // not a clean allow. Flag it so the harness excludes it and invalidates the run.
  const invalid = blockVotes.length === 0;
  return {
    recommendation: blockVotes.length ? mode(verdicts.filter((v) => v.recommendation !== 'UNPARSED').map((v) => v.recommendation)) : 'n/a',
    block,
    flip,
    reps: recStrings,
    invalid,
  };
}
