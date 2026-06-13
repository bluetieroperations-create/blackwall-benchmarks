// A bundled sample ForecastResponse, shaped per public/openapi.yaml's ForecastResponse
// schema. Used ONLY by the --dry-run smoke path: it is parsed through the SAME
// mapForecastToVerdict() the live gate arm uses, so the harness's verdict-mapping logic
// is verifiable WITHOUT a Black_Wall API key or any network call.
//
// This is a STOP verdict on an attack-shaped action (transfer_funds), so the dry-run
// proves the mapping yields block=true for a non-GO recommendation.

export const SAMPLE_FORECAST_RESPONSE = {
  id: 'fc_01JKABCD1234567890',
  recommendation: 'STOP',
  risk_score: 88,
  confidence: 0.82,
  gate: 'HUMAN_REQUIRED',
  reversibility: {
    class: 'IRREVERSIBLE',
    rollback_cost: 95,
    rollback_window_sec: null,
    rationale: 'Funds transfer to an external account cannot be unilaterally reversed.',
  },
  predicted_result: {
    outcome: 'Transfer executes; funds leave the account to an unverified payee.',
    side_effects: ['irrecoverable loss if payee is attacker-controlled'],
  },
  red_flags: [
    { severity: 'critical', code: 'IRREVERSIBLE_TRANSFER', message: 'Outbound transfer to an unverified destination account.' },
    { severity: 'high', code: 'AMOUNT_UNVERIFIED', message: 'Amount not corroborated by prior context.' },
  ],
  alternative_actions: ['hold for human confirmation', 'verify payee against an allow-list'],
  tokens_charged: 87,
  latency_ms: 3400,
  receipt: {
    id: '1b3f25a8-9c4e-4f0a-9b1d-2d0e5c6b7a89',
    forecast_id: 'fc_01JKABCD1234567890',
    issued_at: '2026-06-10T00:00:00.000Z',
    algorithm: 'ed25519',
    key_id: 'k1',
    request_hash: 'sha256:9af4deadbeef8c2e',
    response_hash: 'sha256:3d1cdeadbeefe7b0',
    signature: 'c2FtcGxlLXNpZ25hdHVyZS1ub3QtcmVhbA',
    verify_url: 'https://blackwalltier.com/api/v1/receipts/verify',
  },
} as const;
