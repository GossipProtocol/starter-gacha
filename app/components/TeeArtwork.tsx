import type { Tee } from '@/lib/types';

/* Deterministic vector flat-lay — a stand-in until real product photography
   drops into Tee.images[]. Varies shirt color + print motif by piece so a
   grid doesn't look cloned. Reads as merch, not an icon. */

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const SHIRTS = [
  '#C9C8C2', // heather grey
  '#2B2A28', // washed black
  '#33414F', // faded navy
  '#E7E2D4', // vintage cream
  '#3B4A3A', // forest
  '#5A2E2E', // maroon
  '#9E3B36', // washed red
  '#C2A878', // tan
  '#C7A33A', // mustard
];

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

const SPORTS_NUMS = ['23', '32', '8', '3', '45', '99', '33', '12'];

const TEE_PATH =
  'M66,72 L96,72 Q120,92 144,72 L174,72 L222,112 L200,136 L180,116 L180,250 L60,250 L60,116 L40,136 L18,112 Z';

export default function TeeArtwork({ tee, className }: { tee: Tee; className?: string }) {
  const h = hashStr(tee.id);
  const shirt = SHIRTS[h % SHIRTS.length];
  const ink = luminance(shirt) > 150 ? '#23221F' : '#EFEBDD';
  const font = 'var(--font-space-grotesk), system-ui, sans-serif';

  let motif: React.ReactNode = null;
  if (tee.category === 'music') {
    if (h % 2 === 0) {
      motif = (
        <g stroke={ink} strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.82}>
          <circle cx={120} cy={162} r={40} />
          <path d="M104,150 l10,10 M114,150 l-10,10" />
          <path d="M126,150 l10,10 M136,150 l-10,10" />
          <path d="M102,180 q9,14 18,3 q9,14 18,-3" />
        </g>
      );
    } else {
      motif = (
        <g fill={ink} opacity={0.82}>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const heights = [26, 52, 38, 64, 30, 46];
            const x = 86 + i * 16;
            const ht = heights[i];
            return <rect key={i} x={x} y={186 - ht} width={9} height={ht} rx={2} />;
          })}
        </g>
      );
    }
  } else if (tee.category === 'sports') {
    const num = SPORTS_NUMS[h % SPORTS_NUMS.length];
    motif = (
      <g opacity={0.85}>
        <text x={120} y={182} textAnchor="middle" fontFamily={font} fontWeight={700} fontSize={72} fill={ink}>{num}</text>
        <rect x={78} y={120} width={84} height={6} fill={ink} />
      </g>
    );
  } else if (tee.category === 'designer') {
    const initials = tee.brand.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'AR';
    motif = (
      <g opacity={0.8}>
        <rect x={92} y={132} width={56} height={56} fill="none" stroke={ink} strokeWidth={3} />
        <text x={120} y={170} textAnchor="middle" fontFamily={font} fontWeight={400} fontSize={26} letterSpacing={2} fill={ink}>{initials}</text>
        <line x1={84} y1={206} x2={156} y2={206} stroke={ink} strokeWidth={2} />
      </g>
    );
  } else {
    motif = (
      <g stroke={ink} strokeWidth={5} strokeLinecap="round" opacity={0.82} fill="none">
        <circle cx={120} cy={162} r={14} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const r1 = 22, r2 = 40;
          const rad = (deg * Math.PI) / 180;
          return (
            <line
              key={deg}
              x1={120 + r1 * Math.cos(rad)} y1={162 + r1 * Math.sin(rad)}
              x2={120 + r2 * Math.cos(rad)} y2={162 + r2 * Math.sin(rad)}
            />
          );
        })}
      </g>
    );
  }

  return (
    <svg viewBox="0 0 240 280" className={className} role="img" aria-label={`${tee.name} flat lay`} preserveAspectRatio="xMidYMid meet">
      <rect x={0} y={0} width={240} height={280} fill="#EDEBE4" />
      <ellipse cx={120} cy={256} rx={78} ry={10} fill="#000000" opacity={0.06} />
      <path d={TEE_PATH} fill={shirt} stroke="#0C0C0C" strokeWidth={3.5} strokeLinejoin="round" />
      <path d="M96,72 Q120,92 144,72" fill="none" stroke="#0C0C0C" strokeWidth={3.5} />
      <path d="M99,78 Q120,95 141,78" fill="none" stroke="#0C0C0C" strokeWidth={1.5} opacity={0.5} />
      {motif}
    </svg>
  );
}
