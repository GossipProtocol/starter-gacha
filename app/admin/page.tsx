'use client';

/* STOCK — the inventory of record. Import intake rows straight from the
   spreadsheet (name · company · size · quality · price); SKUs are assigned
   by the server (TM-0001…) so barcodes always match the database. */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch, useAdminKey } from './ui';
import type { StockTee } from './types';

const INTAKE_COLUMNS = ['name', 'company', 'size', 'quality', 'price', 'category', 'era'] as const;
type IntakeCol = (typeof INTAKE_COLUMNS)[number];
const COL_ALIASES: Record<IntakeCol, string[]> = {
  name: ['name', 'item', 'title', 'shirt', 'tee'],
  company: ['company', 'company name', 'brand', 'label', 'maker'],
  size: ['size'],
  quality: ['quality', 'grade', 'condition', 'cond'],
  price: ['price', 'value', 'estvalue', 'est value', 'appraised'],
  category: ['category', 'cat'],
  era: ['era', 'year', 'decade'],
};

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === delim && !quoted) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseIntake(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const table = lines.map((l) => splitLine(l, delim));
  const first = table[0].map((c) => c.toLowerCase());
  const hasHeader = first.some((c) => Object.values(COL_ALIASES).some((a) => a.includes(c)));
  const col: Record<IntakeCol, number> = { name: 0, company: 1, size: 2, quality: 3, price: 4, category: 5, era: 6 };
  if (hasHeader) {
    INTAKE_COLUMNS.forEach((k) => { col[k] = first.findIndex((c) => COL_ALIASES[k].includes(c)); });
  }
  const body = hasHeader ? table.slice(1) : table;
  return body
    .map((cells) => {
      const get = (k: IntakeCol) => (col[k] >= 0 ? cells[col[k]] ?? '' : '');
      return {
        name: get('name'),
        brand: get('company'),
        size: get('size'),
        quality: get('quality'),
        price: parseFloat(get('price').replace(/[$,]/g, '')) || 0,
        category: get('category') || undefined,
        era: get('era') || undefined,
      };
    })
    .filter((r) => r.name.length > 0);
}

export default function StockPage() {
  const key = useAdminKey();
  const [tees, setTees] = useState<StockTee[] | null>(null);
  const [error, setError] = useState('');
  const [paste, setPaste] = useState('');
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await adminFetch<{ tees: StockTee[] }>('/api/admin/stock', key);
      setTees(res.tees);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [key]);

  useEffect(() => { load(); }, [load]);

  const parsed = useMemo(() => parseIntake(paste), [paste]);
  const counts = useMemo(() => {
    const c = { available: 0, reserved: 0, shipped: 0 };
    (tees ?? []).forEach((t) => { c[t.status] += 1; });
    return c;
  }, [tees]);

  async function runImport() {
    setImporting(true);
    setNotice('');
    try {
      const res = await adminFetch<{ tees: StockTee[] }>('/api/admin/stock', key, {
        method: 'POST',
        body: JSON.stringify({ rows: parsed }),
      });
      setNotice(`Imported ${res.tees.length} piece${res.tees.length === 1 ? '' : 's'} (${res.tees[0]?.sku} … ${res.tees[res.tees.length - 1]?.sku})`);
      setPaste('');
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Import failed');
    }
    setImporting(false);
  }

  return (
    <div>
      <div className="flex items-baseline gap-4 flex-wrap">
        <h1 className="font-bold text-3xl tracking-tight">STOCK</h1>
        <span className="font-mono text-sm text-ink-soft">
          {counts.available} available · {counts.reserved} in play · {counts.shipped} shipped
        </span>
        <Link href="/admin/labels" className="ml-auto press shadow-hard-sm bg-pink border-2 border-ink rounded-xl px-4 py-2 font-bold text-sm">
          PRINT LABELS →
        </Link>
      </div>

      <div className="mt-5 bg-surface border-2 border-ink rounded-2xl shadow-hard p-4">
        <h2 className="font-bold">INTAKE</h2>
        <p className="text-ink-soft text-sm mt-1">
          Paste rows from the intake sheet. Columns: name · company · size · quality · price
          (category and era optional). SKUs and rarity are assigned on import.
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Paste spreadsheet rows here…"
          spellCheck={false}
          className="mt-3 w-full h-32 font-mono text-sm bg-paper border-2 border-ink rounded-xl p-3 outline-none resize-y"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={runImport}
            disabled={importing || parsed.length === 0}
            className="press shadow-hard bg-lime border-2 border-ink rounded-xl px-5 py-2 font-bold"
          >
            {importing ? '…' : `IMPORT ${parsed.length || ''}`.trim()}
          </button>
          {notice && <span className="font-mono text-sm">{notice}</span>}
        </div>
      </div>

      {error && (
        <p className="mt-5 font-mono text-sm text-red-700 bg-surface border-2 border-ink rounded-xl p-3">{error}</p>
      )}

      <div className="mt-5 bg-surface border-2 border-ink rounded-2xl shadow-hard overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-mono text-xs text-ink-soft border-b-2 border-ink">
              {['SKU', 'NAME', 'COMPANY', 'SIZE', 'QUALITY', 'PRICE', 'RARITY', 'STATUS'].map((h) => (
                <th key={h} className="px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(tees ?? []).map((t) => (
              <tr key={t.id} className="border-b border-heather last:border-0">
                <td className="px-3 py-2 font-mono">{t.sku}</td>
                <td className="px-3 py-2 font-bold">{t.name}</td>
                <td className="px-3 py-2">{t.brand}</td>
                <td className="px-3 py-2 font-mono">{t.size}</td>
                <td className="px-3 py-2 font-mono">{t.quality ?? ''}</td>
                <td className="px-3 py-2 font-mono">${t.price}</td>
                <td className="px-3 py-2">{t.rarity}</td>
                <td className="px-3 py-2 font-mono">{t.status}</td>
              </tr>
            ))}
            {tees !== null && tees.length === 0 && (
              <tr><td className="px-3 py-6 text-ink-soft" colSpan={8}>No stock yet. Import the intake sheet above.</td></tr>
            )}
            {tees === null && !error && (
              <tr><td className="px-3 py-6 text-ink-soft" colSpan={8}>Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
