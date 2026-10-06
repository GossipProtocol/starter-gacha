'use client';

import { useState } from 'react';

/* Cheap, dependency-free confetti. Mounted only during epic/grail reveals. */
export default function Confetti({ palette }: { palette?: string[] }) {
  const colors = palette ?? ['#C2F032', '#FFB3D9', '#5B8CFF', '#C46BFF', '#FFD23F', '#0C0C0C'];
  const [pieces] = useState(() =>
    Array.from({ length: 80 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 2.2 + Math.random() * 1.8,
      size: 7 + Math.random() * 9,
      color: colors[i % colors.length],
      rot: Math.random() * 360,
      round: Math.random() > 0.5,
    }))
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            top: '-24px',
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.2,
            background: p.color,
            borderRadius: p.round ? '50%' : '2px',
            transform: `rotate(${p.rot}deg)`,
            animation: `tm-fall ${p.dur}s linear ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
