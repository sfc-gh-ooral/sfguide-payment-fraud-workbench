'use client';

// Case detail: the alert, the account's payment and login timeline, a map of in-store swipes, the
// account-device-IP link graph, an AI case summary with its evidence, and the analyst's decision.
import { ArrowLeft, FileText, ShieldAlert, ShieldCheck, Siren, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { FraudMap } from '@/components/FraudMap';
import { LinkGraph } from '@/components/LinkGraph';
import { ErrorBox, PageSkeleton, Panel, PoweredBy, Reasoning, SampleAiBadge, SourceChip, StreamText, Tag, nice, priorityTone, sla, statusTone, usd } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { SAMPLE_CASE_IDS, STORY_CASES, fetchCase, fetchOverview, fetchSummary, sendAction } from '@/lib/client';
import { SAMPLE_DELAY_MS } from '@/lib/sample-timing';
import type { AiText } from '@/lib/types';

const ACTIONS = [
  { k: 'CONFIRM_FRAUD', label: 'Confirm fraud', cls: 'btn-fraud', icon: ShieldAlert },
  { k: 'FALSE_POSITIVE', label: 'False positive', cls: 'btn-clear', icon: ShieldCheck },
  { k: 'ESCALATE', label: 'Escalate', cls: 'btn-warn', icon: Siren },
] as const;

function CaseView() {
  const id = useSearchParams().get('id') ?? SAMPLE_CASE_IDS[0];
  const c = useAsync(() => fetchCase(id), [id]);
  const cities = useAsync(() => fetchOverview().then((o) => o.cities), []);
  const [ai, setAi] = useState<{ loading?: boolean; data?: AiText; error?: string; streamed?: boolean }>({});
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<string>();
  useEffect(() => { setAi({}); setSaved(undefined); setNote(''); }, [id]);
  const summarize = () => { setAi({ loading: true }); fetchSummary(id).then((data) => setAi({ data }), (e) => setAi({ error: String(e.message ?? e) })); };
  const decide = async (action: string) => {
    setSaved('saving');
    try { await sendAction(id, action, note); setSaved(action); } catch (e) { setSaved(`error: ${e instanceof Error ? e.message : e}`); }
  };

  if (c.error) return <ErrorBox error={c.error} />;
  if (c.loading || !c.data) return <PageSkeleton label="Loading the case" />;
  const { alert: a, timeline, nodes, edges, actions } = c.data;
  const s = sla(a.SLA_MIN_LEFT);
  const pts = [...timeline].filter((t) => t.KIND === 'TXN' && t.LAT != null).reverse();
  const path = pts.filter((t) => t.CHANNEL === 'CARD_PRESENT').slice(-4).map((t) => ({ lat: t.LAT!, lon: t.LON!, text: t.TS.slice(11, 16), bad: t.FLAGGED }));
  const accounts = nodes.filter((n) => n.type === 'ACCOUNT').length;
  const devices = nodes.filter((n) => n.type === 'DEVICE').length, ips = nodes.filter((n) => n.type === 'IP').length;
  const events = timeline.filter((t) => t.KIND === 'EVENT').length;
  const story = STORY_CASES.find((x) => x.id === id);
  const steps = [
    `Reading ${timeline.length} timeline items (${events} login events) for ${a.ACCOUNT_ID}…`,
    `Linking ${accounts} accounts, ${devices} devices and ${ips} IPs from the graph…`,
    `Weighing ${a.REASON_CODES.length + a.RULES.length} signals against the score ${a.SCORE.toFixed(3)}…`,
    'Drafting the case summary and next step with AI_COMPLETE…',
  ];
  const sources = [
    { label: `${timeline.length} timeline items`, src: 'RAW.TRANSACTIONS · RAW.ACCOUNT_EVENTS' },
    { label: `${a.REASON_CODES.length} reason codes, score ${a.SCORE.toFixed(3)}`, src: 'APP.ALERTS · ML.SCORES' },
    { label: `${accounts} linked accounts`, src: 'APP.LINK_EDGES (recursive CTE)' },
  ];

  return (
    <div className="space-y-4">
      <div className="rise">
        <Link href="/alerts/" className="text-xs muted inline-flex items-center gap-1 no-underline hover:text-[var(--ink)]"><ArrowLeft className="w-3.5 h-3.5" aria-hidden />Alert queue</Link>
        <div className="flex items-start justify-between gap-3 flex-wrap mt-1">
          <div className="min-w-0">
            <div className="eyebrow text-signal">{story ? `Story case · ${story.title}` : 'Case'}</div>
            <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight"><span className="mono">{a.ALERT_ID}</span> · {a.CUSTOMER_NAME}</h1>
            <p className="text-[13px] muted mono">{a.ACCOUNT_ID} · {nice(a.CHANNEL)} · {usd(a.AMOUNT)}{a.MERCHANT_NAME ? ` · ${a.MERCHANT_NAME}` : ''} · {a.CREATED_TS}</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <Tag tone={priorityTone(a.PRIORITY)} mono>{a.PRIORITY} · {a.SCORE.toFixed(3)}</Tag>
            {a.STATUS === 'OPEN' ? <Tag tone={s.tone} mono>{s.tone === 'fraud' && <span className="pulse" aria-hidden />}{s.text}</Tag> : <Tag tone={statusTone(a.STATUS)}>{nice(a.STATUS)}</Tag>}
            <SourceChip ms={c.data.ms} source={c.data.source} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">{a.RULES.map((r) => <Tag key={r} tone="warn">Rule · {nice(r)}</Tag>)}{a.REASON_CODES.map((r) => <Tag key={r}>{nice(r)}</Tag>)}</div>
      </div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-3 items-start">
        <section className="panel ai-panel rise p-4 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
            <div><div className="eyebrow text-ai">AI case summary</div><h2 className="text-[14px] font-semibold">Summary, signals, and recommended next step</h2></div>
            {ai.data?.source === 'sample' ? <SampleAiBadge /> : <PoweredBy>Cortex AI_COMPLETE</PoweredBy>}
          </div>
          {ai.loading ? <Reasoning steps={steps} durationMs={SAMPLE_DELAY_MS.summary} /> : ai.error ? <ErrorBox error={ai.error} /> : ai.data ? (
            <>
              <StreamText text={ai.data.text} onDone={() => setAi((x) => ({ ...x, streamed: true }))} />
              {ai.streamed && (
                <div className="rise mt-3 pt-3 border-t border-line">
                  <div className="eyebrow mb-1.5">Evidence used</div>
                  <ol className="space-y-1">{sources.map((x, i) => <li key={x.label} className="text-xs flex gap-2"><span className="mono text-ai">[{i + 1}]</span><span>{x.label}</span><span className="muted mono ml-auto text-right">{x.src}</span></li>)}</ol>
                  <p className="text-[11px] muted mt-2">{ai.data.source === 'live' ? `Generated live by ${ai.data.model} in ${(ai.data.latencyMs / 1000).toFixed(1)} s from the facts on this page.` : 'Scripted sample captured from a live AI_COMPLETE run on this case. Run Live mode for real output.'} AI-generated: an analyst checks it before acting.</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-[13px]">
              <p className="muted mb-3">Draft a case note from the timeline, reason codes, and link graph on this page. You decide; the note is a draft.</p>
              <button className="btn btn-ai" onClick={summarize}><Sparkles className="w-4 h-4" aria-hidden />Summarize case</button>
            </div>
          )}
        </section>

        <Panel eyebrow="Human in the loop" title="Decision">
          {a.STATUS !== 'OPEN' && !saved ? <p className="text-sm">Closed as <Tag tone={statusTone(a.STATUS)}>{nice(a.STATUS)}</Tag></p> : (
            <>
              <label className="eyebrow" htmlFor="note">Analyst note</label>
              <textarea id="note" className="field mt-1 mb-3" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you checked and why" />
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2">
                {ACTIONS.map(({ k, label, cls, icon: I }) => <button key={k} className={`btn ${cls} justify-center`} disabled={saved === 'saving'} onClick={() => decide(k)}><I className="w-4 h-4" aria-hidden />{label}</button>)}
              </div>
              {saved && saved !== 'saving' && <p className={`text-sm mt-3 rise ${saved.startsWith('error') ? 'text-fraud' : 'text-clear'}`} role="status">
                {saved.startsWith('error') ? saved : `Recorded: ${nice(saved)}${c.data.source === 'live' ? ' (written to APP.ALERT_ACTIONS)' : ' (kept in this browser in Sample mode)'}.`}</p>}
            </>
          )}
          <div className="mt-4">
            <div className="eyebrow mb-1.5">Before you decide</div>
            <ul className="space-y-1.5">
              {[
                `Score ${a.SCORE.toFixed(3)} with ${a.REASON_CODES.length} reason code${a.REASON_CODES.length === 1 ? '' : 's'}${a.RULES.length ? ` and ${a.RULES.length} rule hit` : ''}`,
                `${accounts <= 1 ? 'No' : accounts - 1} other account${accounts === 2 ? '' : 's'} linked to ${a.ACCOUNT_ID} within two hops (shared device or IP)`,
                `${events} login or profile event${events === 1 ? '' : 's'} in the window`,
                'Customer contact through a verified channel, if you confirm fraud',
              ].map((x) => (
                <li key={x}><label className="flex items-start gap-2 text-[13px] cursor-pointer"><input type="checkbox" className="mt-0.5 accent-[var(--signal)]" /><span>{x}</span></label></li>
              ))}
            </ul>
          </div>
          {actions.length > 0 && (
            <div className="mt-4"><div className="eyebrow mb-1.5">History</div>
              <ul className="space-y-1">{actions.map((x, i) => <li key={i} className="text-xs flex gap-2"><FileText className="w-3.5 h-3.5 muted shrink-0" aria-hidden /><span className="mono muted">{x.ACTED_AT}</span><span>{nice(x.ACTION)}{x.NOTE ? ` · ${x.NOTE}` : ''}</span></li>)}</ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Panel eyebrow="Link analysis" title={`${accounts} account${accounts === 1 ? '' : 's'}, ${devices} device${devices === 1 ? '' : 's'}, ${ips} IP${ips === 1 ? '' : 's'} reached`} right={<PoweredBy>Recursive CTE in SQL</PoweredBy>}>
          <LinkGraph nodes={nodes} edges={edges} focus={a.ACCOUNT_ID} />
        </Panel>
        <Panel eyebrow="Geography" title="Where the card was used" right={<PoweredBy>Geospatial ST_DISTANCE</PoweredBy>}>
          {cities.data ? <FraudMap cities={cities.data} path={path} label="Map of the case's recent in-store transactions, in time order" /> : <div className="skel h-64" />}
          <p className="text-xs muted mt-2">{path.length > 1 ? 'Recent in-store swipes on this card, joined in time order; magenta = flagged. Distance and implied speed come from ST_DISTANCE between consecutive swipes.' : 'No in-store swipes in this window; card-not-present and P2P payments geolocate to the customer’s IP.'}</p>
        </Panel>
      </div>

      <Panel pad={false} eyebrow="Timeline" title="48 hours before to 12 hours after the alert">
        <ol className="relative p-4 space-y-0">
          {timeline.map((t) => {
            const hit = t.ID === a.TXN_ID;
            const dot = t.KIND === 'EVENT' ? 'var(--link)' : t.FLAGGED ? 'var(--fraud)' : 'var(--line-strong)';
            return (
              <li key={t.ID} className={`grid grid-cols-[92px_14px_1fr_auto] gap-x-3 items-start py-1.5 rounded ${hit ? 'bg-[color-mix(in_srgb,var(--fraud)_9%,transparent)]' : ''}`}>
                <span className="mono text-[11.5px] muted pt-0.5 pl-1">{t.TS.slice(5, 16)}</span>
                <span className="relative flex justify-center h-full"><span className="absolute top-0 bottom-[-8px] w-px bg-[var(--line)]" /><span className="relative mt-1.5 w-2.5 h-2.5 rounded-full" style={{ background: dot, boxShadow: t.FLAGGED ? '0 0 10px var(--fraud)' : undefined }} /></span>
                <span className="min-w-0 text-[13px]">{t.KIND === 'EVENT' ? <strong className="text-link">{t.LABEL}</strong> : t.LABEL} {t.FLAGGED && <Tag tone="fraud">Alert</Tag>}
                  <span className="block text-[11.5px] muted mono truncate">{t.CHANNEL ? nice(t.CHANNEL) : 'Login event'}{t.DEVICE_ID ? ` · ${t.DEVICE_ID}` : ''}</span></span>
                <span className="mono text-[13px] font-semibold text-right pr-1">{t.AMOUNT != null ? usd(t.AMOUNT) : ''}</span>
              </li>
            );
          })}
        </ol>
      </Panel>
    </div>
  );
}

export default function CasePage() {
  return <Suspense fallback={<PageSkeleton label="Loading the case" />}><CaseView /></Suspense>;
}
