'use client';

// Recharts tooltip in the Ferrovane panel style.
export function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-3 py-2 text-xs mono">
      <div className="muted mb-1">{label}</div>
      {payload.map((p) => <div key={p.name} className="flex items-center gap-2"><span style={{ color: p.color }}>■</span>{p.name}<span className="ml-auto pl-4 font-semibold">{p.value.toLocaleString()}</span></div>)}
    </div>
  );
}
