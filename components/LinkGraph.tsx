'use client';

// Link graph for a case: accounts, devices, and IPs found by the recursive CTE, laid out in rings
// by hop distance from the alerted account. Deterministic layout, so screenshots are stable.
import type { GraphEdge, GraphNode } from '@/lib/types';

const W = 560, H = 420, CX = W / 2, CY = H / 2;
const COLOR = { ACCOUNT: 'var(--signal)', DEVICE: 'var(--warn)', IP: 'var(--link)' } as const;

export function LinkGraph({ nodes, edges, focus }: { nodes: GraphNode[]; edges: GraphEdge[]; focus: string }) {
  const rings = new Map<number, GraphNode[]>();
  for (const n of nodes) rings.set(n.depth, [...(rings.get(n.depth) ?? []), n]);
  const maxDepth = Math.max(1, ...rings.keys());
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, ns] of rings) {
    const r = d === 0 ? 0 : (d / maxDepth) * (Math.min(W, H) / 2 - 34);
    ns.forEach((n, i) => {
      const a = (i / ns.length) * Math.PI * 2 + d * 0.6 - Math.PI / 2;
      pos.set(n.id, { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) });
    });
  }
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded" style={{ background: 'var(--surface-2)' }} role="img"
        aria-label={`Link graph: ${nodes.filter((n) => n.type === 'ACCOUNT').length} accounts, ${nodes.filter((n) => n.type === 'DEVICE').length} devices, ${nodes.filter((n) => n.type === 'IP').length} IPs`}>
        <defs><filter id="lg-glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        {[1, 2, 3].map((r) => <circle key={r} cx={CX} cy={CY} r={(r / 3) * (Math.min(W, H) / 2 - 34)} fill="none" stroke="var(--line)" strokeDasharray="2 5" />)}
        {edges.map((e) => {
          const a = pos.get(e.a), b = pos.get(e.b);
          return a && b ? <line key={e.a + e.b} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--line-strong)" strokeOpacity={0.55} /> : null;
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!;
          const big = n.id === focus;
          return (
            <g key={n.id}>
              {n.type === 'ACCOUNT'
                ? <circle cx={p.x} cy={p.y} r={big ? 13 : 8} fill={big || n.id.startsWith('A0600') ? 'var(--fraud)' : COLOR.ACCOUNT} stroke="var(--surface)" strokeWidth={2} filter={big ? 'url(#lg-glow)' : undefined} />
                : <rect x={p.x - 6} y={p.y - 6} width={12} height={12} rx={n.type === 'IP' ? 6 : 2} fill={COLOR[n.type]} stroke="var(--surface)" strokeWidth={2} />}
              <text x={p.x} y={p.y + (big ? 26 : 19)} fontSize={big ? 11 : 9} fontWeight={big ? 700 : 500} textAnchor="middle" fill="var(--ink)">{n.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 text-[11px] muted mt-2 flex-wrap">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLOR.ACCOUNT }} />Account</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLOR.DEVICE }} />Device</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLOR.IP }} />IP address</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--fraud)' }} />Alerted or new mule-pattern account</span>
        <span>Rings = hops from the alerted account</span>
      </div>
    </div>
  );
}
