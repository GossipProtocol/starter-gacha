import { describe, expect, test } from 'bun:test';
import { DEFAULT_MACHINE, TIER_TABLE } from '../lib/config';
import { rollRarityFrom } from '../lib/rng';
import type { Rarity, Tier } from '../lib/types';

const TIERS: Tier[] = ['starter', 'standard', 'legendary'];
const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'grail'];

describe('default machine', () => {
  test('every tier sums to 100', () => {
    for (const tier of TIERS) {
      const sum = RARITIES.reduce((s, r) => s + TIER_TABLE[tier][r].chance, 0);
      expect(Math.abs(sum - 100)).toBeLessThan(0.001);
    }
  });

  test('bands are ordered within a tier', () => {
    for (const tier of TIERS) {
      for (let i = 1; i < RARITIES.length; i++) {
        expect(TIER_TABLE[tier][RARITIES[i]].min).toBeGreaterThanOrEqual(TIER_TABLE[tier][RARITIES[i - 1]].max);
      }
    }
  });

  test('the roll follows the table it is given', () => {
    const N = 100_000;
    const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
    for (let i = 0; i < N; i++) counts[rollRarityFrom(DEFAULT_MACHINE.tierTable, 'standard')] += 1;
    for (const r of ['common', 'uncommon', 'rare'] as Rarity[]) {
      const pct = (counts[r] / N) * 100;
      expect(Math.abs(pct - TIER_TABLE.standard[r].chance)).toBeLessThan(1);
    }
  });

  test('treasury seed is 32 bytes of hex', () => {
    expect(DEFAULT_MACHINE.treasurySeed).toMatch(/^[0-9a-f]{64}$/);
  });
});
