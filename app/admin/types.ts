/* Row shapes returned by the /api/admin routes (Supabase tables). */

export interface StockTee {
  id: string;
  sku: string;
  name: string;
  brand: string;
  era: string;
  category: string;
  size: string;
  rarity: string;
  quality: number | null;
  price: number;
  status: 'available' | 'reserved' | 'shipped';
  created_at: string;
}

export interface AdminOrder {
  id: string;
  wallet: string;
  tier: string;
  price_paid: number;
  buyback_pct: number;
  buyback_value: number;
  decision: 'pending' | 'shipped' | 'soldback';
  ship_name: string | null;
  ship_address1: string | null;
  ship_address2: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_zip: string | null;
  ship_email: string | null;
  tracking: string | null;
  created_at: string;
  tee: { sku: string; name: string; brand: string; size: string; quality: number | null } | null;
}
