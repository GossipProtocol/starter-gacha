import React from 'react';
import { CATEGORY_META } from '@/lib/config';
import { usd } from '@/lib/format';
import type { Tee } from '@/lib/types';
import TeeArtwork from './TeeArtwork';
import { Chip, GradeStamp, RarityBadge, Tag } from './ui';

export default function TeeCard({
  tee, buyback, statusNote, valueLabel = 'Est. value', dim = false, children, className = '',
}: {
  tee: Tee;
  buyback?: number;
  statusNote?: string;
  valueLabel?: string;
  dim?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  const photo = tee.images[0];

  return (
    <div className={`overflow-hidden rounded-2xl border-[4px] border-ink bg-surface shadow-hard ${className}`}>
      <div className={`relative aspect-[4/5] border-b-[4px] border-ink bg-heather ${dim ? 'opacity-60 grayscale' : ''}`}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={tee.name} className="h-full w-full object-cover" />
        ) : (
          <TeeArtwork tee={tee} className="h-full w-full" />
        )}
        <RarityBadge rarity={tee.rarity} className="absolute left-3 top-3" />
        <GradeStamp grade={tee.grade} className="absolute right-3 top-3 shadow-hard-sm" />
        {statusNote && (
          <span className="absolute bottom-3 left-3 rounded-md border-[2px] border-ink bg-paper px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide shadow-hard-sm">
            {statusNote}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5 p-4">
        <Tag>{tee.brand} · {tee.era}{tee.origin ? ` · ${tee.origin}` : ''}</Tag>
        <h3 className="text-lg font-bold uppercase leading-[0.98]">{tee.name}</h3>

        <div className="flex flex-wrap gap-1.5">
          <Chip tone="lime">Size {tee.size}</Chip>
          <Chip tone="pink" className="-rotate-2">{CATEGORY_META[tee.category].label}</Chip>
        </div>

        <div className="flex items-end justify-between gap-2 border-t-[3px] border-ink pt-2.5">
          <div>
            <Tag>{valueLabel}</Tag>
            <div className="text-2xl font-bold leading-none tabular-nums">{usd(tee.estValue)}</div>
          </div>
          {buyback != null && (
            <div className="text-right">
              <Tag>Buyback</Tag>
              <div className="text-lg font-bold leading-tight tabular-nums">{usd(buyback)}</div>
            </div>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}
