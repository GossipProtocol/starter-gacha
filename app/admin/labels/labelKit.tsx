'use client';

/* Barcode label primitives. Two print targets:
   · ROLLO — direct thermal roll, 2in × 1in, one label per page. The Rollo
     driver takes browser prints as long as @page matches the label size.
   · AVERY 5163 — US Letter sheets, 2in × 4in, 10 per sheet (fallback for a
     regular printer).
   The barcode is Code 128 of the in-house SKU, which is the database key,
   so a scan always resolves to exactly one piece. */

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import type { StockTee } from '../types';

export type LabelFormat = 'rollo' | 'avery';

export function Barcode({ value, height = 46 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    try {
      JsBarcode(svg, value, {
        format: 'CODE128',
        displayValue: false,
        height,
        width: 2,
        margin: 0,
        background: 'transparent',
        lineColor: '#0C0C0C',
      });
      // Freeze natural size into a viewBox so the barcode fills its slot.
      const w = svg.getAttribute('width');
      const h = svg.getAttribute('height');
      if (w && h) {
        svg.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.removeAttribute('width');
        svg.removeAttribute('height');
      }
    } catch {
      /* unencodable value: leave the slot empty rather than crash the run */
    }
  }, [value, height]);
  return <svg ref={ref} style={{ width: '100%', height: '100%' }} />;
}

function qualityText(tee: StockTee): string {
  return tee.quality != null ? `${tee.quality}/10` : '';
}

/** Rollo 2in × 1in thermal label. One per page. */
export function ThermalLabel({ tee }: { tee: StockTee }) {
  const quality = qualityText(tee);
  return (
    <div
      className="thermal-label bg-white text-ink overflow-hidden flex flex-col"
      style={{
        width: '2in',
        height: '1in',
        padding: '0.05in 0.07in',
        breakAfter: 'page',
        pageBreakAfter: 'always',
      }}
    >
      <div className="flex items-baseline justify-between" style={{ lineHeight: 1.1 }}>
        <span className="font-bold" style={{ fontSize: '5pt', letterSpacing: '0.1em' }}>
          THRIFTING MACHINE
        </span>
        {quality && (
          <span className="font-mono" style={{ fontSize: '5pt' }}>Q {quality}</span>
        )}
      </div>
      <div
        className="font-bold"
        style={{ fontSize: '7pt', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {tee.name}
      </div>
      <div
        className="font-mono"
        style={{ fontSize: '5.5pt', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {[tee.brand, tee.size && `SIZE ${tee.size.toUpperCase()}`].filter(Boolean).join(' · ') || ' '}
      </div>
      <div className="mt-auto" style={{ height: '0.34in' }}>
        <Barcode value={tee.sku} height={34} />
      </div>
      <div className="font-mono text-center" style={{ fontSize: '5.5pt', letterSpacing: '0.18em', lineHeight: 1.2 }}>
        {tee.sku}
      </div>
    </div>
  );
}

/** Avery 5163 2in × 4in label (sheet fallback). */
export function Label({ tee }: { tee: StockTee }) {
  const quality = qualityText(tee);
  return (
    <div
      className="bg-white text-ink overflow-hidden flex flex-col"
      style={{ width: '4in', height: '2in', padding: '0.14in 0.18in' }}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-bold" style={{ fontSize: '8pt', letterSpacing: '0.14em' }}>
          THRIFTING MACHINE
        </span>
        {quality && (
          <span className="font-mono" style={{ fontSize: '8pt' }}>QUALITY {quality}</span>
        )}
      </div>
      <div
        className="font-bold leading-tight"
        style={{
          fontSize: '12.5pt',
          marginTop: '0.03in',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {tee.name}
      </div>
      <div className="font-mono" style={{ fontSize: '8.5pt', marginTop: '0.02in' }}>
        {[tee.brand, tee.size && `SIZE ${tee.size.toUpperCase()}`].filter(Boolean).join(' · ') || ' '}
      </div>
      <div className="mt-auto" style={{ height: '0.52in' }}>
        <Barcode value={tee.sku} />
      </div>
      <div className="font-mono text-center" style={{ fontSize: '8.5pt', letterSpacing: '0.22em' }}>
        {tee.sku}
      </div>
    </div>
  );
}

/** Avery 5163: 0.5in top margin, 0.15625in side margin, 2 cols × 4in with a
 *  0.1875in gutter, 5 rows × 2in, no row gap. */
export function Sheet({ tees }: { tees: StockTee[] }) {
  return (
    <div
      className="label-sheet bg-white border-2 border-ink shadow-hard-sm"
      style={{
        width: '8.5in',
        height: '11in',
        paddingTop: '0.5in',
        paddingLeft: '0.15625in',
        display: 'grid',
        gridTemplateColumns: '4in 4in',
        gridAutoRows: '2in',
        columnGap: '0.1875in',
        breakAfter: 'page',
        pageBreakAfter: 'always',
        alignContent: 'start',
      }}
    >
      {tees.map((tee) => (
        <Label key={tee.id} tee={tee} />
      ))}
    </div>
  );
}

export const LABELS_PER_SHEET = 10;

const PRINT_COMMON = `
  header, footer, .no-print { display: none !important; }
  body { background: #fff !important; }
  .labels-root { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  .label-sheet, .thermal-label { border: none !important; box-shadow: none !important; margin: 0 !important; }
`;

export function printCss(format: LabelFormat): string {
  const page = format === 'rollo' ? 'size: 2in 1in; margin: 0;' : 'size: letter; margin: 0;';
  return `@media print {\n${PRINT_COMMON}\n@page { ${page} }\n}`;
}
