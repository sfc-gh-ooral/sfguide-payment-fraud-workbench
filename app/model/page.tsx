'use client';

// Model & rules: the registered XGBoost model, its Feature Store features, and a threshold slider that
// shows the precision / recall trade-off and alert volume on labeled synthetic data.
import { Boxes, Cpu, Database, Layers } from 'lucide-react';
import { useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTip } from '@/components/ChartTip';
import { ErrorBox, PageHead, PageSkeleton, Panel, PoweredBy, SourceChip, Tag, nice } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { fetchModel } from '@/lib/client';

const RULES = [
  ['Card testing', 'Twenty-five or more card-not-present authorizations under $3 at one merchant within an hour, on a payment under $3.'],
  ['Impossible travel', 'Two swipes on one card more than 500 km apart at an implied speed over 900 km/h (ST_DISTANCE on the two points).'],
  ['Shared device', 'The device has been used by five or more accounts, a common sign of a mule ring.'],
];

function Stat({ label, value, base, unit = '', good }: { label: string; value: number; base: number; unit?: string; good: 'up' | 'down' }) {
  const d = value - base, ok = good === 'up' ? d >= 0 : d <= 0;
  return (
    <div className="inset p-3">
      <div className="eyebrow">{label}</div>
      <div className="mono text-[22px] font-bold leading-tight mt-1">{value.toLocaleString(undefined, { maximumFractionDigits: 1 })}{unit}</div>
      <div className={`mono text-[11px] ${Math.abs(d) < 0.05 ? 'muted' : ok ? 'text-clear' : 'text-fraud'}`}>{Math.abs(d) < 0.05 ? 'at baseline 0.50' : `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit} vs 0.50`}</div>
    </div>
  );
}

export default function ModelPage() {
  const m = useAsync(fetchModel, []);
  const [t, setT] = useState(0.5);
  if (m.error) return <ErrorBox error={m.error} />;
  if (m.loading || !m.data) return <PageSkeleton label="Loading the model" />;
  const { eval: e, curve, registry } = m.data;
  const near = (x: number) => curve.reduce((best, c) => (Math.abs(c.THRESHOLD - x) < Math.abs(best.THRESHOLD - x) ? c : best), curve[0]);
  const p = near(t), b = near(0.5);
  const data = curve.map((c) => ({ t: c.THRESHOLD.toFixed(2), Precision: +(c.PRECISION * 100).toFixed(1), Recall: +(c.RECALL * 100).toFixed(1), 'Alerts / day': Math.round(c.ALERTS_PER_DAY) }));

  return (
    <div className="space-y-4">
      <PageHead eyebrow="Model risk" title="Model & rules"
        sub={`${e.algorithm} ${registry.name} ${registry.version}: trained on ${e.trainingWindow}, tested on ${e.testWindow}. Measured on labeled synthetic payments.`}
        right={<SourceChip ms={m.data.ms} source={m.data.source} />} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Boxes, k: 'Model Registry', v: `${registry.name} · ${registry.version}` },
          { icon: Layers, k: 'Feature Store view', v: e.featureView },
          { icon: Cpu, k: 'AUC · avg precision', v: `${e.auc.toFixed(4)} · ${e.avgPrecision.toFixed(3)}` },
          { icon: Database, k: 'Training rows', v: `${e.trainRows.toLocaleString()} (${e.trainFraud.toLocaleString()} fraud)` },
        ].map(({ icon: I, k, v }) => (
          <div key={k} className="panel rise p-3.5 flex items-center gap-3 min-w-0"><I className="w-5 h-5 text-signal shrink-0" aria-hidden /><div className="min-w-0"><div className="eyebrow">{k}</div><div className="mono text-[13px] font-semibold truncate" title={v}>{v}</div></div></div>
        ))}
      </div>

      <Panel eyebrow="Threshold tuning" title="Precision, recall, and alert volume" right={<PoweredBy>Snowpark ML · Model Registry</PoweredBy>}>
        <div className="flex items-center gap-4 flex-wrap">
          <label htmlFor="thr" className="eyebrow">Alert when score ≥</label>
          <span className="mono text-[28px] font-bold text-signal">{p.THRESHOLD.toFixed(2)}</span>
          <input id="thr" type="range" min={0.05} max={0.95} step={0.05} value={t} onChange={(ev) => setT(Number(ev.target.value))} className="flex-1 min-w-[200px]" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
          <Stat label="Precision" value={p.PRECISION * 100} base={b.PRECISION * 100} unit="%" good="up" />
          <Stat label="Recall" value={p.RECALL * 100} base={b.RECALL * 100} unit="%" good="up" />
          <Stat label="Alerts per day" value={p.ALERTS_PER_DAY} base={b.ALERTS_PER_DAY} good="down" />
          <Stat label="Fraud caught" value={p.TRUE_POS} base={b.TRUE_POS} good="up" />
        </div>
        <div className="h-[300px] mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ left: -14, right: -6, top: 8 }}>
              <defs><linearGradient id="gr" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--fraud)" stopOpacity={0.25} /><stop offset="1" stopColor="var(--fraud)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="t" tickLine={false} axisLine={false} />
              <YAxis yAxisId="pct" domain={[0, 100]} unit="%" tickLine={false} axisLine={false} />
              <YAxis yAxisId="n" orientation="right" tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip />} cursor={{ stroke: 'var(--line-strong)' }} />
              <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="n" dataKey="Alerts / day" fill="var(--link)" fillOpacity={0.35} barSize={14} isAnimationActive={false} />
              <Area yAxisId="pct" dataKey="Recall" stroke="var(--fraud)" strokeWidth={1.5} fill="url(#gr)" isAnimationActive={false} />
              <Line yAxisId="pct" dataKey="Precision" stroke="var(--signal)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <ReferenceLine yAxisId="pct" x={p.THRESHOLD.toFixed(2)} stroke="var(--warn)" strokeDasharray="4 3" label={{ value: 'threshold', fill: 'var(--warn)', fontSize: 10, position: 'insideTopRight' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs muted mt-2">Model alerts only (rules add more), on {e.testRows.toLocaleString()} labeled November payments ({e.testFraud.toLocaleString()} fraud) in this synthetic data set. Real portfolios are noisier, and labels arrive weeks late.</p>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-3">
        <Panel eyebrow="Explainability" title="Feature importance" right={<PoweredBy>Feature Store · Dynamic Tables</PoweredBy>}>
          <ul className="space-y-2">
            {e.importance.slice(0, 10).map((f, i) => (
              <li key={f.feature} className="text-[13px]">
                <div className="flex justify-between gap-2"><span><span className="mono muted mr-2">{String(i + 1).padStart(2, '0')}</span>{nice(f.feature)}</span><span className="mono muted">{(f.importance * 100).toFixed(1)}%</span></div>
                <div className="scorebar mt-1"><span style={{ width: `${(f.importance / e.importance[0].importance) * 100}%`, background: 'linear-gradient(90deg, var(--signal), var(--link))' }} /></div>
              </li>
            ))}
          </ul>
          <p className="text-xs muted mt-3">{e.features.length} velocity features from the Feature Store view <span className="mono">{e.featureView}</span>, a Dynamic Table.</p>
        </Panel>
        <Panel eyebrow="Deterministic controls" title="Rules that run alongside the model" right={<PoweredBy>Snowflake SQL</PoweredBy>}>
          <ul className="space-y-3">
            {RULES.map(([n, d]) => <li key={n} className="inset p-3"><Tag tone="warn">Rule · {n}</Tag><p className="text-[13px] mt-1.5">{d}</p></li>)}
          </ul>
          <p className="text-xs muted mt-3">Scoring runs in batch with the registered model (<span className="mono">model.run</span> in the warehouse); a daily task is created suspended. Real-time scoring would use Snowpipe Streaming and model serving on Snowpark Container Services, which this example doesn&apos;t build.</p>
        </Panel>
      </div>
    </div>
  );
}
