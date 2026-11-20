'use client';

// Alert drawer: the alert's velocity features, read from the Feature Store view, and a re-score with
// the registered model version (predict_proba in the warehouse). Sample mode replays a captured run.
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorBox, PoweredBy, Reasoning, Skeleton, SourceChip, Tag } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { fetchFeatures, rescoreAlert } from '@/lib/client';
import { SAMPLE_DELAY_MS } from '@/lib/sample-timing';
import type { Rescore } from '@/lib/types';

const LABEL: Record<string, string> = {
  AMOUNT: 'Amount ($)', IS_CNP: 'Card not present', IS_P2P: 'P2P', HOUR_OF_DAY: 'Hour of day', CARD_TXN_1H: 'Card txns, 1 h',
  ACCT_AMT_24H: 'Account spend, 24 h ($)', AMT_TO_AVG: 'Amount vs 30-day avg', NEW_DEVICE: 'New device', DEVICE_ACCOUNTS: 'Accounts on device',
  MERCH_SMALL_1H: 'Merchant <$3 CNP, 1 h', KM_FROM_PREV: 'km from previous swipe', KMH_FROM_PREV: 'Implied km/h', FIRST_TIME_PAYEE: 'First-time payee',
  PW_RESET_24H: 'Password reset, 24 h',
};
const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 }));

export function AlertModel({ alertId }: { alertId: string }) {
  const f = useAsync(() => fetchFeatures(alertId), [alertId]);
  const [rs, setRs] = useState<{ loading?: boolean; data?: Rescore; error?: string }>({});
  useEffect(() => setRs({}), [alertId]);
  const run = () => { setRs({ loading: true }); rescoreAlert(alertId).then((data) => setRs({ data }), (e) => setRs({ error: String(e.message ?? e) })); };

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5"><span className="eyebrow">Model inputs</span><span className="flex items-center gap-2"><PoweredBy>Feature Store · Dynamic Table</PoweredBy><SourceChip ms={f.data?.ms} source={f.data?.source} /></span></div>
        {f.error ? <ErrorBox error={f.error} /> : !f.data ? <Skeleton className="h-28" /> : (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {Object.entries(f.data.features).map(([k, v]) => <div key={k} className="flex justify-between gap-2 border-b border-[var(--line)] py-0.5"><dt className="muted">{LABEL[k] ?? k}</dt><dd className="mono font-semibold">{fmt(v)}</dd></div>)}
          </dl>
        )}
        {f.data && <p className="text-[11px] muted mt-1">Row for this payment in <span className="mono">{f.data.view}</span>.</p>}
      </div>
      <div className="inset p-2.5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="eyebrow">Re-score with the registered model</span>
          {rs.data?.source === 'sample' ? <Tag tone="ai" title="Captured from a live run; not scored now">Sample model response</Tag> : <PoweredBy>Snowpark ML · Model Registry</PoweredBy>}
        </div>
        {rs.loading ? <Reasoning durationMs={SAMPLE_DELAY_MS.rescore} steps={[
          'Reading the feature row from FEATURES.TXN_VELOCITY$1…',
          'Loading ML.FRAUD_XGB version V1 from the Model Registry…',
          'Running predict_proba in the warehouse…',
        ]} /> : rs.error ? <ErrorBox error={rs.error} /> : rs.data ? (
          <div className="text-[13px] rise">
            <div className="flex items-baseline gap-2"><span className="mono text-xl font-bold">{rs.data.score.toFixed(4)}</span><span className="muted text-xs">fraud probability</span></div>
            <p className="text-xs muted mt-1">{rs.data.model} {rs.data.version} · stored score {rs.data.stored.toFixed(4)}
              {rs.data.source === 'live' ? ` · scored live in ${rs.data.ms.toLocaleString()} ms` : ' · captured from a live run; run Live mode to score now'}</p>
          </div>
        ) : <button className="btn btn-sm" onClick={run} disabled={!f.data}><RefreshCw className="w-3.5 h-3.5" aria-hidden />Re-score this alert</button>}
      </div>
    </div>
  );
}
