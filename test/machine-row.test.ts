/* The public odds route and the roll both read the machine row. This test
   feeds a row with odds that differ from lib/config.ts and checks that the
   view shows them and the roll follows them, and that a malformed row is
   refused rather than served. */

import { describe, expect, mock, test } from 'bun:test';

mock.module('server-only', () => ({}));

const { machineFromRow } = await import('../lib/server/machines');
const { machineView } = await import('../lib/server/api');
const { rollRarityFrom } = await import('../lib/rng');
const { DEFAULT_MACHINE } = await import('../lib/config');

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'custom',
    name: 'Custom',
    operator_key_hash: 'x',
    tier_table: JSON.parse(JSON.stringify(DEFAULT_MACHINE.tierTable)),
    tier_meta: JSON.parse(JSON.stringify(DEFAULT_MACHINE.tierMeta)),
    buyback: JSON.parse(JSON.stringify(DEFAULT_MACHINE.buyback)),
    treasury_seed: DEFAULT_MACHINE.treasurySeed,
    status: 'active' as const,
    ...overrides,
  };
}

describe('machine row', () => {
  test('the view and the roll follow the row, not the default table', () => {
    const r = row();
    // A grail-only standard tier that lib/config.ts does not have.
    r.tier_table.standard = {
      common: { chance: 0, min: 0, max: 1 }, uncommon: { chance: 0, min: 1, max: 2 },
      rare: { chance: 0, min: 2, max: 3 }, epic: { chance: 0, min: 3, max: 4 },
      grail: { chance: 100, min: 4, max: 5 },
    };
    r.tier_meta.standard.price = 123;
    const machine = machineFromRow(r);
    const view = machineView(machine, { common: 0, uncommon: 0, rare: 0, epic: 0, grail: 0 });
    const standard = view.tiers.find((t) => t.id === 'standard')!;
    expect(standard.priceUsdc).toBe(123);
    expect(standard.odds.find((o) => o.rarity === 'grail')!.chancePct).toBe(100);
    for (let i = 0; i < 200; i++) expect(rollRarityFrom(machine.tierTable, 'standard')).toBe('grail');
  });

  test('a table that does not sum to 100 is refused', () => {
    const r = row();
    r.tier_table.starter.common.chance = 50;
    expect(() => machineFromRow(r)).toThrow(/sum to/);
  });

  test('a bad treasury seed is refused', () => {
    expect(() => machineFromRow(row({ treasury_seed: 'abc' }))).toThrow(/treasury_seed/);
  });
});
