import React from 'react';
import { RARITY_META } from '@/lib/config';
import type { Rarity } from '@/lib/types';

/* Shared neo-brutalist primitives. */

export function Tag({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-block font-mono text-[11px] uppercase tracking-wide text-ink-soft ${className}`}>
      {children}
    </span>
  );
}

export function Chip({
  children, className = '', tone = 'surface',
}: { children: React.ReactNode; className?: string; tone?: 'surface' | 'lime' | 'pink' | 'ink' }) {
  const tones: Record<string, string> = {
    surface: 'bg-surface text-ink',
    lime: 'bg-lime text-ink',
    pink: 'bg-pink text-ink',
    ink: 'bg-ink text-paper',
  };
  return (
    <span className={`inline-block rounded-lg border-[2px] border-ink px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

const RARITY_TEXT_ON: Record<Rarity, string> = {
  common: 'text-white',
  uncommon: 'text-white',
  rare: 'text-white',
  epic: 'text-white',
  grail: 'text-ink',
};

export function RarityBadge({ rarity, className = '', rotate = true }: { rarity: Rarity; className?: string; rotate?: boolean }) {
  return (
    <span
      className={`inline-block rounded-lg border-[2.5px] border-ink px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-widest shadow-hard-sm ${RARITY_TEXT_ON[rarity]} ${className}`}
      style={{ backgroundColor: RARITY_META[rarity].color, transform: rotate ? 'rotate(-3deg)' : undefined }}
    >
      {RARITY_META[rarity].label}
    </span>
  );
}

export function GradeStamp({ grade, className = '' }: { grade: number; className?: string }) {
  return (
    <span
      className={`flex h-12 w-12 flex-col items-center justify-center rounded-full border-[3px] border-ink bg-ink leading-none ${className}`}
      title={`Condition grade ${grade.toFixed(1)} / 10`}
    >
      <span className="text-[15px] font-bold text-lime">{grade.toFixed(1)}</span>
      <span className="font-mono text-[8px] uppercase tracking-wide text-paper/70">grade</span>
    </span>
  );
}
