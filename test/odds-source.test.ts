/* The odds the API publishes must be the odds it rolls with. Both come
   from the machine row, so nothing under lib/server or app/api may import
   the default tables from lib/config.ts. This test greps for it. */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');
const BANNED = /\b(TIER_TABLE|TIER_META|BUYBACK_PCT|DEFAULT_BUYBACK|DEFAULT_MACHINE|rollRarity|buybackPctFor|buybackValueFor)\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('odds source', () => {
  test('server code never reads odds from lib/config.ts', () => {
    const files = [...walk(join(ROOT, 'lib/server')), ...walk(join(ROOT, 'app/api'))];
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const importsConfig = /from '(\.\.\/|@\/lib\/)config'/.test(src) || /import\('\.\.\/config'\)/.test(src);
      if (!importsConfig) continue;
      // lib/server/db.ts seeds the sandbox machine from DEFAULT_MACHINE; that
      // is the one allowed read, and it writes a machine row, not a roll.
      if (f.endsWith('lib/server/db.ts')) continue;
      const importLine = src.match(/import\s*\{[^}]*\}\s*from\s*'(\.\.\/|@\/lib\/)config'/)?.[0] ?? '';
      if (BANNED.test(importLine)) offenders.push(f.replace(ROOT + '/', ''));
    }
    expect(offenders).toEqual([]);
  });
});
