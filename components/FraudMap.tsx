'use client';

// A simple equirectangular map of the continental US (no map tiles or CDN): city markers for
// reference, bubbles sized by fraud count per H3 cell, and optional case points joined in time order.
import type { City, HexCell } from '@/lib/types';

const W = 640, H = 340, LON0 = -125, LON1 = -66, LAT0 = 24, LAT1 = 50;
const x = (lon: number) => ((lon - LON0) / (LON1 - LON0)) * W;
const y = (lat: number) => H - ((lat - LAT0) / (LAT1 - LAT0)) * H;

export function FraudMap({ cities, hex = [], path = [], label }: {
  cities: City[]; hex?: HexCell[]; path?: { lat: number; lon: number; text: string; bad?: boolean }[]; label: string;
}) {
  const max = Math.max(1, ...hex.map((h) => h.FRAUD_TXNS));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-lg" style={{ background: 'var(--surface-2)' }} role="img" aria-label={label}>
      {[30, 40].map((lat) => <line key={lat} x1={0} x2={W} y1={y(lat)} y2={y(lat)} stroke="var(--border)" strokeDasharray="3 4" />)}
      {[-115, -100, -85, -75].map((lon) => <line key={lon} y1={0} y2={H} x1={x(lon)} x2={x(lon)} stroke="var(--border)" strokeDasharray="3 4" />)}
      {hex.map((h) => (
        <circle key={h.H3_CELL} cx={x(h.LON)} cy={y(h.LAT)} r={4 + 22 * Math.sqrt(h.FRAUD_TXNS / max)}
          fill="var(--negative)" fillOpacity={0.28} stroke="var(--negative)" strokeOpacity={0.7}>
          <title>{`H3 cell ${h.H3_CELL}: ${h.FRAUD_TXNS} fraud transactions, $${Math.round(h.FRAUD_LOSS).toLocaleString()}`}</title>
        </circle>
      ))}
      {cities.map((c) => (
        <g key={c.CITY}>
          <circle cx={x(c.LON)} cy={y(c.LAT)} r={2.2} fill="var(--text-2)" />
          <text x={x(c.LON) + 4} y={y(c.LAT) - 3} fontSize={9} fill="var(--muted)">{c.CITY}</text>
        </g>
      ))}
      {path.length > 1 && <polyline points={path.map((p) => `${x(p.lon)},${y(p.lat)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="5 3" />}
      {path.map((p, i) => (
        <g key={i}>
          <circle cx={x(p.lon)} cy={y(p.lat)} r={6} fill={p.bad ? 'var(--negative)' : 'var(--accent)'} stroke="var(--surface)" strokeWidth={2} />
          <text x={x(p.lon) + 8} y={y(p.lat) + 12} fontSize={10} fontWeight={600} fill="var(--text)">{p.text}</text>
        </g>
      ))}
    </svg>
  );
}
