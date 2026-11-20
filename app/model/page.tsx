'use client';

// Model & rules: the registered XGBoost model, its features from the Feature Store, and a
// threshold slider showing the precision / recall trade-off and alert volume on labeled data.
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, ErrorBox, Kpi, PoweredBy, SourceChip, Thinking, nice } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { fetchModel } from '@/lib/client';

const RULES = [
  ['Card testing', 'Twenty-five or more card-not-present authorizations under $3 at one merchant within an hour, on a payment under $3.'],
  ['Impossible travel', 'Two swipes on one card more than 500 km apart at an implied speed over 900 km/h (ST_DISTANCE on the two points).'],
  ['Shared device', 'The device has been used by five or more accounts, a common sign of a mule ring.'],
];

export default function ModelPage() {
  const m = useAsync(fetchModel, []);
  const [t, setT] = useState(0.5);
  if (m.error) return <ErrorBox error={m.error} />;
  if (m.loading || !m.data) return <Thinking label="Loading the model" />;
  const { eval: e, curve } = m.data;
  const p = curve.reduce((best, c) => (Math.abs(c.THRESHOLD - t) < Math.abs(best.THRESHOLD - t) ? c : best), curve[0]);
  const data = curve.map((c) => ({ t: c.THRESHOLD, Precision: +(c.PRECISION * 100).toFixed(1), Recall: +(c.RECALL * 100).toFixed(1) }));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Model &amp; rules</h1>
          <p className="text-sm muted">{e.algorithm} {m.data.registry.name} {m.data.registry.version}: trained on {e.trainingWindow}, tested on {e.testWindow}.</p>
        </div>
        <div className="flex gap-2 flex-wrap"><PoweredBy>Model Registry</PoweredBy><PoweredBy>Feature Store</PoweredBy><SourceChip ms={m.data.ms} source={m.data.source} /></div>
      </div>
      <Card title="Alert threshold" right={<span className="text-sm font-semibold tabular">{p.THRESHOLD.toFixed(2)}</span>}>
        <input type="range" min={0.05} max={0.95} step={0.05} value={t} onChange={(ev) => setT(Number(ev.target.value))} className="w-full" aria-label="Model score threshold" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <Kpi label="Precision" value={`${(p.PRECISION * 100).toFixed(1)}%`} sub="alerts that were fraud" />
          <Kpi label="Recall" value={`${(p.RECALL * 100).toFixed(1)}%`} sub={`of ${e.testFraud.toLocaleString()} fraud payments caught`} />
          <Kpi label="Alerts per day" value={p.ALERTS_PER_DAY.toFixed(0)} sub={`${p.ALERTS.toLocaleString()} over 14 days`} />
          <Kpi label="Fraud caught" value={p.TRUE_POS.toLocaleString()} sub="true positives" />
        </div>
        <div className="h-[260px] mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: -10, right: 8, top: 6 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="t" type="number" domain={[0.05, 0.95]} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted)' }} unit="%" />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12 }} />
              <ReferenceLine x={p.THRESHOLD} stroke="var(--accent)" strokeDasharray="4 3" />
              <Line isAnimationActive={false} dataKey="Precision" stroke="var(--brand)" strokeWidth={2} dot={false} />
              <Line isAnimationActive={false} dataKey="Recall" stroke="var(--negative)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs muted mt-2">Model alerts only (rules add more), measured on {e.testRows.toLocaleString()} labeled November payments in this synthetic data set. Real portfolios are noisier, and labels arrive weeks late.</p>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="min-w-0" title={`Feature importance · AUC ${e.auc.toFixed(3)} · average precision ${e.avgPrecision.toFixed(3)}`}>
          <ul className="space-y-2">
            {e.importance.slice(0, 10).map((f) => (
              <li key={f.feature} className="text-sm">
                <div className="flex justify-between"><span>{nice(f.feature)}</span><span className="tabular muted">{(f.importance * 100).toFixed(1)}%</span></div>
                <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--surface-2)' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${(f.importance / e.importance[0].importance) * 100}%`, background: 'var(--brand)' }} /></div>
              </li>
            ))}
          </ul>
          <p className="text-xs muted mt-3">{e.features.length} velocity features from the Feature Store view {e.featureView} (a Dynamic Table refreshed daily). Trained on {e.trainRows.toLocaleString()} rows ({e.trainFraud.toLocaleString()} fraud).</p>
        </Card>
        <Card className="min-w-0" title="Rules that run alongside the model" right={<PoweredBy>Snowflake SQL</PoweredBy>}>
          <ul className="space-y-3">
            {RULES.map(([n, d]) => <li key={n} className="text-sm"><strong>{n}</strong><div className="text-2">{d}</div></li>)}
          </ul>
          <p className="text-xs muted mt-3">Scoring runs in batch with the registered model (model.run in the warehouse); a daily task is created suspended. Real-time scoring would use Snowpipe Streaming and model serving on Snowpark Container Services, which this example doesn&apos;t build.</p>
        </Card>
      </div>
    </div>
  );
}
