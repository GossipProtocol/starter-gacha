/* ─────────────────────────────────────────────────────────────────────────
   Seed the first machine from lib/config.ts.

     bun scripts/seed-machine.ts            # creates `default` if missing
     bun scripts/seed-machine.ts --rotate   # issues a new operator key

   Writes the machines row (odds, prices, buyback, treasury seed) and prints
   the operator key ONCE. The key is never stored; only its sha256 is. Lose
   it and you rotate. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
   the environment (bun loads .env.local automatically).
   ───────────────────────────────────────────────────────────────────────── */

import { createHash, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_MACHINE } from '../lib/config';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}

const rotate = process.argv.includes('--rotate');
const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: existing, error } = await db.from('machines').select('id').eq('id', DEFAULT_MACHINE.id).maybeSingle();
  if (error) throw new Error(error.message);

  if (existing && !rotate) {
    console.log(`Machine "${DEFAULT_MACHINE.id}" already exists. Use --rotate to issue a new operator key.`);
    return;
  }

  const operatorKey = `gk_live_${randomBytes(32).toString('hex')}`;
  const operator_key_hash = createHash('sha256').update(operatorKey, 'utf8').digest('hex');

  if (existing) {
    const { error: e } = await db.from('machines').update({ operator_key_hash }).eq('id', DEFAULT_MACHINE.id);
    if (e) throw new Error(e.message);
  } else {
    const { error: e } = await db.from('machines').insert({
      id: DEFAULT_MACHINE.id,
      name: DEFAULT_MACHINE.name,
      operator_key_hash,
      tier_table: DEFAULT_MACHINE.tierTable,
      tier_meta: DEFAULT_MACHINE.tierMeta,
      buyback: DEFAULT_MACHINE.buyback,
      treasury_seed: DEFAULT_MACHINE.treasurySeed,
      status: DEFAULT_MACHINE.status,
    });
    if (e) throw new Error(e.message);
  }

  console.log(`Machine "${DEFAULT_MACHINE.id}" ${existing ? 'key rotated' : 'created'}.`);
  console.log('Operator key (shown once, put it in your operator tooling, never in this repo):');
  console.log(operatorKey);
  console.log(`Treasury seed: ${DEFAULT_MACHINE.treasurySeed}`);
  console.log('Initialize the machine on chain with this seed (see docs/ONCHAIN_SPEC.md section 3).');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
