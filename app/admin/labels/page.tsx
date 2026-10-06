'use client';

/* LABELS — print barcode stickers for stock, straight from the database. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch, useAdminKey } from '../ui';
import type { StockTee } from '../types';
import { LABELS_PER_SHEET, LabelFormat, Sheet, ThermalLabel, printCss } from './labelKit';

export default function LabelsPage() {
  const key = useAdminKey();
  const [tees, setTees] = useState<StockTee[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<LabelFormat>('rollo');

  const load = useCallback(async () => {
    try {
      const res = await adminFetch<{ tees: StockTee[] }>('/api/admin/stock', key);
      setTees(res.tees);
      setSelected(new Set(res.tees.filter((t) => t.status === 'available').map((t) => t.id)));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [key]);

  useEffect(() => { load(); }, [load]);

  const chosen = useMemo(() => (tees ?? []).filter((t) => selected.has(t.id)), [tees, selected]);
  const sheets = useMemo(() => {
    const out: StockTee[][] = [];
    for (let i = 0; i < chosen.length; i += LABELS_PER_SHEET) out.push(chosen.slice(i, i + LABELS_PER_SHEET));
    return out;
  }, [chosen]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="labels-root">
      <style>{printCss(format)}</style>

      <div className="no-print">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-bold text-3xl tracking-tight">LABELS</h1>
          <span className="font-mono text-sm text-ink-soft">
            {format === 'rollo'
              ? `${chosen.length} label${chosen.length === 1 ? '' : 's'}`
              : `${chosen.length} selected · ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}`}
          </span>
          <button
            onClick={() => setSelected(new Set((tees ?? []).map((t) => t.id)))}
            className="border-2 border-ink rounded-lg px-2 py-1 font-mono text-xs bg-surface press"
          >
            ALL
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="border-2 border-ink rounded-lg px-2 py-1 font-mono text-xs bg-surface press"
          >
            NONE
          </button>
          <div className="ml-auto flex items-center gap-2">
            {(['rollo', 'avery'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`border-2 border-ink rounded-lg px-2 py-1 font-mono text-xs press ${format === f ? 'bg-pink' : 'bg-surface'}`}
              >
                {f === 'rollo' ? 'ROLLO 2×1' : 'AVERY 5163'}
              </button>
            ))}
            <button
              onClick={() => window.print()}
              disabled={chosen.length === 0}
              className="press shadow-hard bg-lime border-2 border-ink rounded-xl px-5 py-2 font-bold"
            >
              PRINT LABELS
            </button>
          </div>
        </div>
        <p className="mt-2 font-mono text-xs text-ink-soft">
          {format === 'rollo'
            ? 'ROLLO DIRECT THERMAL · 2IN × 1IN ROLL · ONE LABEL PER PAGE · PRINT AT 100% SCALE'
            : 'AVERY 5163 · 2IN × 4IN · 10 PER LETTER SHEET · PRINT AT 100% SCALE, MARGINS OFF'}
        </p>

        {error && (
          <p className="mt-4 font-mono text-sm text-red-700 bg-surface border-2 border-ink rounded-xl p-3">{error}</p>
        )}

        <div className="mt-4 bg-surface border-2 border-ink rounded-2xl shadow-hard max-h-64 overflow-y-auto">
          {(tees ?? []).map((t) => (
            <label key={t.id} className="flex items-center gap-3 px-3 py-1.5 border-b border-heather last:border-0 cursor-pointer text-sm">
              <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
              <span className="font-mono">{t.sku}</span>
              <span className="font-bold">{t.name}</span>
              <span className="font-mono text-xs text-ink-soft ml-auto">{t.size} · {t.status}</span>
            </label>
          ))}
          {tees !== null && tees.length === 0 && (
            <p className="px-3 py-6 text-ink-soft text-sm">No stock yet. Import the intake sheet on the STOCK page first.</p>
          )}
          {tees === null && !error && <p className="px-3 py-6 text-ink-soft text-sm">Loading…</p>}
        </div>
      </div>

      {format === 'rollo' ? (
        <div className="mt-6 flex flex-wrap gap-3">
          {chosen.map((tee) => (
            <div key={tee.id} className="border-2 border-ink shadow-hard-sm">
              <ThermalLabel tee={tee} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-6 overflow-x-auto">
          {sheets.map((sheetTees, i) => (
            <Sheet key={i} tees={sheetTees} />
          ))}
        </div>
      )}
    </div>
  );
}
