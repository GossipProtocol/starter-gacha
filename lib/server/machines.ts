/* ─────────────────────────────────────────────────────────────────────────
   SERVER-ONLY machine records.

   The machine row is the only place the server reads odds, prices and
   buyback percentages from. `loadMachine` turns the row into a
   MachineConfig after checking the shape, and both the public odds route
   and the roll go through it. If you want different odds, change the row,
   not the code, and the API will publish and roll the new table together.
   ───────────────────────────────────────────────────────────────────────── */

import 'server-only';
import type { MachineConfig, Rarity, Tier, TierTable } from '../types';
import { db, type MachineRow } from './db';

const TIERS: Tier[] = ['starter', 'standard', 'legendary'];
const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'grail'];

export class MachineConfigError extends Error {
  constructor(machineId: string, detail: string) {
    super(`Machine ${machineId} has an invalid config: ${detail}`);
    this.name = 'MachineConfigError';
  }
}

/** Check the row's JSON has the exact shape of TIER_TABLE / TIER_META /
 *  DEFAULT_BUYBACK. A malformed row refuses to serve rather than rolling
 *  with a table that is not the one it publishes. */
export function machineFromRow(row: MachineRow): MachineConfig {
  const table = row.tier_table as TierTable;
  for (const tier of TIERS) {
    if (!table?.[tier]) throw new MachineConfigError(row.id, `tier_table.${tier} missing`);
    let sum = 0;
    for (const r of RARITIES) {
      const band = table[tier][r];
      if (!band || typeof band.chance !== 'number' || typeof band.min !== 'number' || typeof band.max !== 'number') {
        throw new MachineConfigError(row.id, `tier_table.${tier}.${r} malformed`);
      }
      if (band.chance < 0 || band.min > band.max) throw new MachineConfigError(row.id, `tier_table.${tier}.${r} out of range`);
      sum += band.chance;
    }
    if (Math.abs(sum - 100) > 0.001) throw new MachineConfigError(row.id, `tier_table.${tier} chances sum to ${sum}, not 100`);
    const meta = row.tier_meta?.[tier];
    if (!meta || typeof meta.price !== 'number' || meta.price <= 0 || typeof meta.label !== 'string') {
      throw new MachineConfigError(row.id, `tier_meta.${tier} malformed`);
    }
  }
  const bb = row.buyback;
  if (!bb || typeof bb.cap !== 'number' || typeof bb.designerBonus !== 'number') {
    throw new MachineConfigError(row.id, 'buyback malformed');
  }
  for (const r of RARITIES) {
    if (typeof bb.pct?.[r] !== 'number') throw new MachineConfigError(row.id, `buyback.pct.${r} missing`);
  }
  if (!/^[0-9a-f]{64}$/i.test(row.treasury_seed ?? '')) throw new MachineConfigError(row.id, 'treasury_seed must be 32 bytes of hex');
  if (row.status !== 'active' && row.status !== 'paused') throw new MachineConfigError(row.id, `status ${row.status}`);

  return {
    id: row.id,
    name: row.name,
    tierTable: table,
    tierMeta: row.tier_meta,
    buyback: { pct: bb.pct, designerBonus: bb.designerBonus, cap: bb.cap },
    treasurySeed: row.treasury_seed.toLowerCase(),
    status: row.status,
  };
}

export async function loadMachine(id: string): Promise<MachineConfig | null> {
  const row = await db().getMachine(id);
  return row ? machineFromRow(row) : null;
}
