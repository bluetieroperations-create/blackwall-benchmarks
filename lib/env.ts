// Tiny dependency-free .env loader. Imported (for side effect) at the top of each
// benchmark run.ts so `npm run <bench>` works without manually sourcing .env.
//
// Reads <repo-root>/.env, parses KEY=VALUE lines (ignoring blanks and #comments),
// strips surrounding quotes, and sets process.env[KEY] ONLY if it is not already
// set — so a real environment variable always wins over the file (and nothing is
// clobbered in CI). Missing .env is a no-op, not an error: --dry-run needs no keys.
//
// No `dotenv` dependency — just node:fs — to keep the public repo's footprint minimal.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// lib/env.ts lives in <root>/lib, so the repo root is one directory up.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export function loadEnv(path: string = join(ROOT, '.env')): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return; // no .env file — fine for --dry-run; live run will report missing keys.
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue; // don't override already-set env
    process.env[key] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Auto-run on import so a bare `import '../../lib/env.ts'` is enough.
loadEnv();
