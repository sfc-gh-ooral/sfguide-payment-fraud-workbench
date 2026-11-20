'use client';

// Fraud overview: fraud rate (bps), losses, alert volume, and precision on worked alerts, with daily
// trends, a map of confirmed fraud by H3 cell, the top reason codes, and the planted story cases.
import { AlertTriangle, ArrowRight, DollarSign, Radar, Target } from 'lucide-react';
import Link from 'next/link';
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTip } from '@/components/ChartTip';
import { FraudMap } from '@/components/FraudMap';
import { ErrorBox, Kpi, PageHead, PageSkeleton, Panel, PoweredBy, SourceChip, Tag, money, nice } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { STORY_CASES, fetchOverview } from '@/lib/client';
import type { DayKpi } from '@/lib/types';

const sum = (xs: DayKpi[], k: keyof DayKpi) => xs.reduce((a, d) => a + Number(d[k]), 0);
const wow = (days: DayKpi[], k: keyof DayKpi, rate = false) => {
  const a = days.slice(-7), b = days.slice(-14, -7);
  if (b.length < 7) return undefined;
  const x = rate ? sum(a, 'FRAUD_TXNS') / sum(a, 'TXNS') : sum(a, k), y = rate ? sum(b, 'FRAUD_TXNS') / sum(b, 'TXNS') : sum(b, k);
  return y ? x / y - 1 : undefined;
};

export default function Overview() {
  const o = useAsync(fetchOverview, []);
  if (o.error) return <ErrorBox error={o.error} />;
  if (o.loading || !o.data) return <PageSkeleton label="Loading the fraud overview" />;
  const { kpis: k, days, hex, cities, reasons } = o.data;
  const chart = days.map((d) => ({ day: d.DAY.slice(5), Alerts: d.ALERTS, 'Fraud (bps)': +d.FRAUD_BPS.toFixed(1), 'Fraud payments': d.FRAUD_TXNS }));
  const maxR = Math.max(...reasons.map((r) => r.N));
  const fraudTxns = sum(days, 'FRAUD_TXNS');

  return (
    <div className="space-y-4">
      <PageHead eyebrow="Northwind Financial · Fraud operations · Nov 1–14, 2026"
        title={<>Fraud is running at <span className="text-fraud mono">{k.fraudBps.toFixed(1)} bps</span>.{" "}{k.open.toLocaleString()} alerts are waiting.</>}
        sub="Card-present, card-not-present, and instant P2P payments scored by the registered XGBoost model and three rules. Synthetic data."
        right={<><SourceChip ms={o.data.ms} source={o.data.source} /><Link href="/alerts/" className="btn btn-primary">Work the queue<ArrowRight className="w-4 h-4" aria-hidden /></Link></>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Fraud rate" value={k.fraudBps} format={(n) => `${n.toFixed(1)} bps`} color="var(--fraud)" delta={wow(days, 'FRAUD_BPS', true)} goodWhenDown sub="last 7 d vs prior 7 d"
          spark={days.map((d) => d.FRAUD_BPS)} icon={<AlertTriangle className="w-4 h-4" />} />
        <Kpi label="Fraud losses" value={k.fraudLoss} format={money} delta={wow(days, 'FRAUD_LOSS')} goodWhenDown sub={`${fraudTxns.toLocaleString()} labeled fraud payments`}
          spark={days.map((d) => d.FRAUD_LOSS)} color="var(--fraud)" icon={<DollarSign className="w-4 h-4" />} />
        <Kpi label="Alerts raised" value={k.alerts} format={(n) => Math.round(n).toLocaleString()} delta={wow(days, 'ALERTS')} goodWhenDown sub={`${k.open.toLocaleString()} open now`}
          spark={days.map((d) => d.ALERTS)} icon={<Radar className="w-4 h-4" />} />
        <Kpi label="Precision, worked alerts" value={k.precision * 100} format={(n) => `${n.toFixed(1)}%`} color="var(--signal)"
          sub={`${k.worked.toLocaleString()} closed against labels`} icon={<Target className="w-4 h-4" />} />
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <Panel className="lg:col-span-2" eyebrow="Daily trend" title="Alert volume and fraud rate" right={<PoweredBy>Snowflake SQL</PoweredBy>}>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ left: -14, right: -6, top: 8 }}>
                <defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--signal)" stopOpacity={0.35} /><stop offset="1" stopColor="var(--signal)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis yAxisId="a" tickLine={false} axisLine={false} />
                <YAxis yAxisId="b" orientation="right" tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ stroke: 'var(--line-strong)' }} />
                <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                <Area yAxisId="a" dataKey="Alerts" stroke="var(--signal)" strokeWidth={1.5} fill="url(#ga)" isAnimationActive={false} />
                <Bar yAxisId="a" dataKey="Fraud payments" fill="var(--fraud)" fillOpacity={0.55} barSize={8} isAnimationActive={false} />
                <Line yAxisId="b" dataKey="Fraud (bps)" stroke="var(--warn)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs muted mt-2">The alert spike on <span className="mono">11-08</span> is a promotion at a legitimate retailer (story 5): many alerts, no fraud. The <span className="mono">11-12</span> fraud spike is the card-testing burst (story 1).</p>
        </Panel>

        <Panel eyebrow="Why alerts fire" title="Top reason codes" right={<Link href="/model/" className="text-xs text-link underline">Rules</Link>}>
          <ul className="space-y-2.5">
            {reasons.slice(0, 8).map((r) => (
              <li key={r.REASON}>
                <div className="flex justify-between text-[13px]"><span>{nice(r.REASON)}</span><span className="mono muted">{r.N.toLocaleString()}</span></div>
                <div className="scorebar mt-1"><span style={{ width: `${(r.N / maxR) * 100}%`, background: 'linear-gradient(90deg, var(--signal), var(--link))' }} /></div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <Panel className="lg:col-span-2" eyebrow="Where fraud lands" title="Confirmed fraud by H3 cell (resolution 3)" right={<PoweredBy>Geospatial H3</PoweredBy>}>
          <FraudMap cities={cities} hex={hex} label={`Map of confirmed fraud in ${hex.length} H3 cells across the US; larger circles mean more fraud`} />
          <p className="text-xs muted mt-2">Bubble size = confirmed fraud payments in the cell (<span className="mono">H3_LATLNG_TO_CELL_STRING</span> on each payment&apos;s location). Hover a bubble for counts.</p>
        </Panel>
        <Panel eyebrow="Start here" title="Planted stories in this data">
          <ul className="space-y-2">
            {STORY_CASES.map((c, i) => (
              <li key={c.id}>
                <Link href={`/case/?id=${c.id}`} className="inset panel-hover flex items-center gap-3 p-2.5 no-underline">
                  <span className="mono text-[11px] font-bold text-signal w-5">0{i + 1}</span>
                  <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{c.title}</span><span className="block text-xs muted truncate">{c.hint}</span></span>
                  <Tag mono>{c.id}</Tag>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
