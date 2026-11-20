'use client';

// Case detail: the alert, the account's transaction and login timeline, a map of the case's
// payments, the account-device-IP link graph, an AI case summary, and the analyst's decision.
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { FraudMap } from '@/components/FraudMap';
import { LinkGraph } from '@/components/LinkGraph';
import { Reasoning } from '@/components/Reasoning';
import { Card, ErrorBox, Markdown, PoweredBy, SampleAiBadge, SourceChip, Tag, Thinking, nice, sla, usd } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { SAMPLE_CASE_IDS, fetchCase, fetchOverview, fetchSummary, sendAction } from '@/lib/client';
import type { AiText } from '@/lib/types';

const ACTIONS = [['CONFIRM_FRAUD', 'Confirm fraud'], ['FALSE_POSITIVE', 'False positive'], ['ESCALATE', 'Escalate']] as const;

function CaseView() {
  const id = useSearchParams().get('id') ?? SAMPLE_CASE_IDS[0];
  const c = useAsync(() => fetchCase(id), [id]);
  const cities = useAsync(() => fetchOverview().then((o) => o.cities), []);
  const [ai, setAi] = useState<{ loading?: boolean; data?: AiText; error?: string }>({});
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<string>();
  useEffect(() => { setAi({}); setSaved(undefined); setNote(''); }, [id]);
  const summarize = () => { setAi({ loading: true }); fetchSummary(id).then((data) => setAi({ data }), (e) => setAi({ error: String(e.message ?? e) })); };
  const decide = async (action: string) => {
    setSaved('saving');
    try { await sendAction(id, action, note); setSaved(action); } catch (e) { setSaved(`error: ${e instanceof Error ? e.message : e}`); }
  };

  if (c.error) return <ErrorBox error={c.error} />;
  if (c.loading || !c.data) return <Thinking label="Loading the case" />;
  const { alert: a, timeline, nodes, edges, actions } = c.data;
  const s = sla(a.SLA_MIN_LEFT);
  const pts = [...timeline].filter((t) => t.KIND === 'TXN' && t.LAT != null).reverse();
  const path = pts.filter((t) => t.CHANNEL === 'CARD_PRESENT').slice(-4).map((t) => ({ lat: t.LAT!, lon: t.LON!, text: t.TS.slice(11, 16), bad: t.FLAGGED }));
  const accounts = nodes.filter((n) => n.type === 'ACCOUNT').length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/alerts" className="text-xs muted">← Alert queue</Link>
          <h1 className="text-xl font-bold">{a.ALERT_ID} · {a.CUSTOMER_NAME}</h1>
          <p className="text-sm muted">{a.ACCOUNT_ID} · {nice(a.CHANNEL)} · {usd(a.AMOUNT)}{a.MERCHANT_NAME ? ` at ${a.MERCHANT_NAME}` : ''} · {a.CREATED_TS}</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Tag tone={a.PRIORITY === 'HIGH' ? 'danger' : 'warning'}>{a.PRIORITY} · score {a.SCORE.toFixed(3)}</Tag>
          {a.STATUS === 'OPEN' && <Tag tone={s.tone}>{s.text}</Tag>}
          <SourceChip ms={c.data.ms} source={c.data.source} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {a.RULES.map((r) => <Tag key={r} tone="danger">Rule: {nice(r)}</Tag>)}
        {a.REASON_CODES.map((r) => <Tag key={r}>{nice(r)}</Tag>)}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="min-w-0" title="AI case summary and next step" right={ai.data?.source === 'sample' ? <SampleAiBadge /> : <PoweredBy>Cortex AI_COMPLETE</PoweredBy>}>
          {ai.loading ? <Reasoning kind="summary" /> : ai.error ? <ErrorBox error={ai.error} /> : ai.data ? (
            <>
              <Markdown text={ai.data.text} />
              <p className="text-[11px] muted mt-3">{ai.data.source === 'live' ? `Generated live by ${ai.data.model} in ${(ai.data.latencyMs / 1000).toFixed(1)} s from the case facts on this page.` : 'Scripted sample captured from a live AI_COMPLETE run. Run Live mode for real output.'} AI-generated: review before acting.</p>
            </>
          ) : (
            <div className="text-sm text-2">
              <p className="mb-3">Draft a case note from the timeline, reason codes, and link graph on this page.</p>
              <button className="btn btn-ai" onClick={summarize}><Sparkles className="w-4 h-4" aria-hidden />Summarize case</button>
            </div>
          )}
        </Card>
        <Card className="min-w-0" title="Decision">
          {a.STATUS !== 'OPEN' && !saved ? <p className="text-sm">Closed as <strong>{nice(a.STATUS)}</strong>.</p> : (
            <>
              <label className="text-xs muted" htmlFor="note">Analyst note</label>
              <textarea id="note" className="field mt-1 mb-3" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you checked and why" />
              <div className="flex gap-2 flex-wrap">
                {ACTIONS.map(([k, label]) => <button key={k} className="btn" disabled={saved === 'saving'} onClick={() => decide(k)}>{label}</button>)}
              </div>
              {saved && saved !== 'saving' && <p className="text-sm mt-3" role="status" style={{ color: saved.startsWith('error') ? 'var(--negative)' : 'var(--positive)' }}>
                {saved.startsWith('error') ? saved : `Recorded: ${nice(saved)}${c.data.source === 'live' ? ' (written to APP.ALERT_ACTIONS)' : ' (kept in this browser in Sample mode)'}.`}</p>}
            </>
          )}
          {actions.length > 0 && <ul className="text-xs muted mt-3 space-y-1">{actions.map((x, i) => <li key={i}>{x.ACTED_AT}: {nice(x.ACTION)}{x.NOTE ? ` · ${x.NOTE}` : ''}</li>)}</ul>}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="min-w-0" title={`Link graph · ${accounts} account${accounts === 1 ? '' : 's'} reached`} right={<PoweredBy>Recursive CTE in SQL</PoweredBy>}>
          <LinkGraph nodes={nodes} edges={edges} focus={a.ACCOUNT_ID} />
        </Card>
        <Card className="min-w-0" title="Where the card was used" right={<PoweredBy>Geospatial ST_DISTANCE</PoweredBy>}>
          {cities.data ? <FraudMap cities={cities.data} path={path} label="Map of the case's recent in-store transactions, in time order" /> : <Thinking />}
          <p className="text-xs muted mt-2">{path.length > 1 ? 'Recent in-store swipes on this card, joined in time order. Red = flagged. Distance and implied speed come from ST_DISTANCE between consecutive swipes.' : 'No in-store swipes in this window; card-not-present and P2P payments geolocate to the customer’s IP.'}</p>
        </Card>
      </div>

      <Card title="Timeline (48 hours before to 12 hours after the alert)">
        <div className="relative overflow-x-auto">
          <table className="data-table w-full text-sm min-w-[640px]">
            <thead><tr><th className="text-left">Time</th><th className="text-left">Event</th><th className="text-left">Channel</th><th className="text-left">Device</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {timeline.map((t) => (
                <tr key={t.ID} style={t.ID === a.TXN_ID ? { background: 'color-mix(in srgb, var(--negative) 9%, transparent)' } : undefined}>
                  <td className="tabular whitespace-nowrap">{t.TS.slice(5, 16)}</td>
                  <td>{t.KIND === 'EVENT' ? <strong>{t.LABEL}</strong> : t.LABEL} {t.FLAGGED && <Tag tone="danger">Alert</Tag>}</td>
                  <td className="text-xs muted">{t.CHANNEL ? nice(t.CHANNEL) : 'Login event'}</td>
                  <td className="text-xs muted">{t.DEVICE_ID ?? '-'}</td>
                  <td className="text-right tabular">{t.AMOUNT != null ? usd(t.AMOUNT) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function CasePage() {
  return <Suspense fallback={<Thinking label="Loading the case" />}><CaseView /></Suspense>;
}
