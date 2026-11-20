'use client';

// Fraud overview: fraud rate in basis points, losses, alert volume, and precision on worked
// alerts, with a daily trend and a map of confirmed fraud by H3 cell.
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Link from 'next/link';
import { FraudMap } from '@/components/FraudMap';
import { Card, ErrorBox, Kpi, PoweredBy, SourceChip, Thinking, money, nice } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { fetchOverview } from '@/lib/client';

export default function Overview() {
  const { data: o, error, loading } = useAsync(fetchOverview, []);
  if (error) return <ErrorBox error={error} />;
  if (loading || !o) return <Thinking label="Loading the fraud overview" />;
  const k = o.kpis;
  const days = o.days.map((d) => ({ ...d, day: d.DAY.slice(5) }));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Payment fraud, Nov 1 to 14, 2026</h1>
          <p className="text-sm muted">Card present, card not present, and P2P instant payments on synthetic data.</p>
        </div>
        <SourceChip ms={o.ms} source={o.source} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Fraud rate" value={`${k.fraudBps.toFixed(1)} bps`} sub={`of ${k.txns.toLocaleString()} payments`} />
        <Kpi label="Fraud losses" value={money(k.fraudLoss)} sub="chargebacks and confirmed fraud" />
        <Kpi label="Alerts" value={k.alerts.toLocaleString()} sub={`${k.open.toLocaleString()} open in the queue`} />
        <Kpi label="Precision (worked)" value={`${(k.precision * 100).toFixed(0)}%`} sub={`of ${k.worked.toLocaleString()} worked alerts were fraud`} />
      </div>
      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 min-w-0" title="Daily fraud rate and alert volume" right={<PoweredBy>Snowflake SQL</PoweredBy>}>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={days} margin={{ left: -10, right: 4, top: 6 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted)' }} interval={1} />
                <YAxis yAxisId="a" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis yAxisId="b" orientation="right" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar isAnimationActive={false} yAxisId="a" dataKey="ALERTS" name="Alerts" fill="var(--brand)" fillOpacity={0.55} radius={[3, 3, 0, 0]} />
                <Line isAnimationActive={false} yAxisId="b" dataKey="FRAUD_BPS" name="Fraud rate (bps)" stroke="var(--negative)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs muted mt-2">Nov 8: a legitimate promotion at Quillmont Outfitters lifts alerts without lifting fraud. Nov 12: a card-testing burst lifts both.</p>
        </Card>
        <Card className="lg:col-span-2 min-w-0" title="Top reason codes in the open queue">
          <ul className="space-y-2">
            {o.reasons.map((r) => {
              const max = o.reasons[0]?.N || 1;
              return (
                <li key={r.REASON} className="text-sm">
                  <div className="flex justify-between"><span>{nice(r.REASON)}</span><span className="tabular muted">{r.N}</span></div>
                  <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${(r.N / max) * 100}%`, background: 'var(--accent)' }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <Link href="/alerts" className="btn btn-ai mt-4 inline-flex no-underline">Open the alert queue</Link>
        </Card>
      </div>
      <Card title="Confirmed fraud by location, Nov 1 to 14" right={<PoweredBy>Geospatial H3 functions</PoweredBy>}>
        <FraudMap cities={o.cities} hex={o.hex} label="Map of the US with bubbles sized by confirmed fraud count per H3 resolution-3 cell" />
        <p className="text-xs muted mt-2">Bubbles aggregate confirmed fraud to H3 resolution-3 cells with H3_LATLNG_TO_CELL_STRING. Card-not-present payments are placed at the customer&apos;s IP location.</p>
      </Card>
    </div>
  );
}
