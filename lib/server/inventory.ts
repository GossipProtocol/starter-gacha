/* ─────────────────────────────────────────────────────────────────────────
   SERVER-ONLY inventory. One implementation behind two doors: the operator
   routes (GET and POST /v1/inventory, x-api-key) and the back-of-house
   admin routes (/api/admin/stock, x-admin-key, default machine).

   Rarity is derived from the intake price against the machine's bands and
   never hand-assigned, because that is how the odds table and the shelf
   drift apart.
   ───────────────────────────────────────────────────────────────────────── */

import 'server-only';
import { db, type TeeInsert, type TeeRow } from './db';
import { ApiError } from './http';
import type { Category, MachineConfig, Rarity, Size } from '../types';

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'grail'];
const CATEGORIES: Category[] = ['surprise', 'music', 'sports', 'designer'];
const SIZES: Size[] = ['S', 'M', 'L', 'XL', 'XXL'];

/** In-house SKU prefix. Zero-padded, so lexicographic max is numeric max. */
export const SKU_PREFIX = 'TM-';

/** Bucket a house-assigned price into a rarity via the machine's standard
 *  tier bands, so the sticker rarity and the odds tables stay coherent. */
export function rarityForPrice(machine: MachineConfig, price: number): Rarity {
  const bands = machine.tierTable.standard;
  for (const r of RARITY_ORDER) if (price <= bands[r].max) return r;
  return 'grail';
}

export interface IntakeRow {
  name: string;
  brand?: string;
  era?: string;
  category?: string;
  size?: string;
  quality?: string | number | null;
  price?: number | string;
  images?: string[];
}

export function listInventory(machineId: string): Promise<TeeRow[]> {
  return db().listTees(machineId);
}

/** Intake: validate rows, assign SKUs, derive rarity, insert. */
export async function intakeInventory(machine: MachineConfig, rowsIn: IntakeRow[]): Promise<TeeRow[]> {
  const rows = (rowsIn ?? []).filter((r) => (r?.name ?? '').trim().length > 0);
  if (rows.length === 0) throw new ApiError('invalid_request', 'No rows with a name');
  if (rows.length > 500) throw new ApiError('invalid_request', 'At most 500 rows per intake');

  let next = (await db().lastSkuNumber(machine.id, SKU_PREFIX)) + 1;

  const inserts: TeeInsert[] = rows.map((r, i) => {
    const price = Number(r.price);
    if (!Number.isFinite(price) || price <= 0) throw new ApiError('invalid_request', `Row ${i + 1}: price must be a positive number`);
    const category = ((r.category ?? 'surprise') + '').trim().toLowerCase() as Category;
    if (!CATEGORIES.includes(category)) throw new ApiError('invalid_request', `Row ${i + 1}: category must be one of ${CATEGORIES.join(', ')}`);
    const size = ((r.size ?? 'L') + '').trim().toUpperCase() as Size;
    if (!SIZES.includes(size)) throw new ApiError('invalid_request', `Row ${i + 1}: size must be one of ${SIZES.join(', ')}`);
    const quality = r.quality === null || r.quality === undefined || r.quality === '' ? null : Number(r.quality);
    return {
      machine_id: machine.id,
      sku: `${SKU_PREFIX}${String(next++).padStart(4, '0')}`,
      name: r.name.trim(),
      brand: (r.brand ?? '').trim(),
      era: (r.era ?? '').trim(),
      category,
      size,
      quality: quality !== null && Number.isFinite(quality) ? quality : null,
      price,
      rarity: rarityForPrice(machine, price),
      images: Array.isArray(r.images) ? r.images.filter((u) => typeof u === 'string') : [],
      status: 'available',
    };
  });

  return db().insertTees(inserts);
}
