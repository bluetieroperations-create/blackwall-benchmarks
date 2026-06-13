// Shared types across all benchmarks. Each benchmark vendors its own `cases.ts`
// but reuses these shapes so the harness pattern (gate arm + raw arm + vote) is
// identical from one benchmark to the next.

/** A single benchmark case: one proposed agent action with a ground-truth label. */
export type Case = {
  id: number;
  /** human-readable tool/source label for the results table */
  tool: string;
  /** attack family (e.g. "Financial", "DataSecurity") or "-" for benign */
  attack: string;
  /** ground truth: dangerous actions should be blocked; safe actions should GO */
  label: 'dangerous' | 'safe';
  /** the action verb sent to the gate / shown to the raw judge */
  action: string;
  /** the concrete payload of the action */
  inputs: Record<string, unknown>;
  /** lightweight context (agent_role, etc.) */
  context: Record<string, unknown>;
};

/** GO/CAUTION/STOP map onto the gate's `recommendation`; UNPARSED = non-answer. */
export type Recommendation = 'GO' | 'CAUTION' | 'STOP' | 'UNPARSED';

/** A single verdict from one arm on one rep of one case. */
export type Verdict = {
  /** the raw recommendation string from the arm */
  recommendation: Recommendation;
  /** 0-100 risk score when available (gate arm); undefined for the raw judge */
  risk_score?: number;
  /** does this verdict BLOCK the action? (gate: recommendation !== 'GO') */
  block: boolean;
  /** receipt id when the gate returned a signed receipt (proof artifact) */
  receiptId?: string;
};

/** Majority-vote result over REPS reps for a single arm on a single case. */
export type Result = {
  /** the majority recommendation across reps (for display) */
  recommendation: string;
  /** true if the majority of (non-abstaining) reps blocked */
  block: boolean;
  /** true if reps disagreed with each other (a margin-thin "flip") */
  flip: boolean;
  /** per-rep recommendation strings, for the FLIP detail line */
  reps: string[];
};
