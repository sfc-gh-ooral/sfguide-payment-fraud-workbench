'use client';

// Alert queue: model score, reason codes, and an SLA timer, with sort, filters, and a detail drawer.
// Analysts confirm fraud, mark a false positive, or escalate here, or open the full case.
import { ArrowDownUp, ArrowRight, Search, ShieldAlert, ShieldCheck, Siren, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertModel } from '@/components/AlertModel';
import { Empty, ErrorBox, PageHead, Panel, PoweredBy, Skeleton, SourceChip, Tag, nice, priorityTone, sla, statusTone, usd } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { fetchAlerts, sendAction } from '@/lib/client';
import type { Alert } from '@/lib/types';

const TABS = [['OPEN', 'Open'], ['CONFIRMED_FRAUD', 'Confirmed fraud'], ['FALSE_POSITIVE', 'False positive']] as const;
const ACTIONS = [
  { k: 'CONFIRM_FRAUD', label: 'Confirm fraud', cls: 'btn-fraud', icon: ShieldAlert },
  { k: 'FALSE_POSITIVE', label: 'False positive', cls: 'btn-clear', icon: ShieldCheck },
  { k: 'ESCALATE', label: 'Escalate', cls: 'btn-warn', icon: Siren },
] as const;
const DONE_LABEL: Record<string, string> = { CONFIRM_FRAUD: 'Confirmed fraud', FALSE_POSITIVE: 'False positive', ESCALATE: 'Escalated' };
type SortKey = 'SCORE' | 'AMOUNT' | 'SLA_MIN_LEFT';

function ScoreCell({ s }: { s: number }) {
  const c = s >= 0.9 ? 'var(--fraud)' : s >= 0.6 ? 'var(--warn)' : 'var(--signal)';
  return <div className="w-[84px]"><div className="mono font-bold text-[13px]" style={{ color: c }}>{s.toFixed(3)}</div><div className="scorebar mt-1"><span style={{ width: `${s * 100}%`, background: c }} /></div></div>;
}
function SlaPill({ min, open }: { min: number; open: boolean }) {
  if (!open) return <span className="text-xs muted">Closed</span>;
  const s = sla(min);
  return <Tag tone={s.tone} mono>{s.tone === 'fraud' && <span className="pulse" aria-hidden />}{s.text}</Tag>;
}

export default function AlertQueue() {
  const [status, setStatus] = useState<string>('OPEN');
  const [done, setDone] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Alert>();
  const [term, setTerm] = useState('');
  const [prio, setPrio] = useState('ALL');
  const [chan, setChan] = useState('ALL');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'SCORE', dir: -1 });
  const q = useAsync(() => fetchAlerts(status), [status]);

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (q.data?.rows ?? []).filter((a) => (prio === 'ALL' || a.PRIORITY === prio) && (chan === 'ALL' || a.CHANNEL === chan)
      && (!t || [a.ALERT_ID, a.ACCOUNT_ID, a.CUSTOMER_NAME, a.MERCHANT_NAME ?? '', ...a.REASON_CODES, ...a.RULES].join(' ').toLowerCase().includes(t)))
      .sort((a, b) => (a[sort.k] - b[sort.k]) * sort.dir);
  }, [q.data, term, prio, chan, sort]);
  const channels = [...new Set((q.data?.rows ?? []).map((a) => a.CHANNEL))];

  const act = async (a: Alert, action: string) => {
    setDone((d) => ({ ...d, [a.ALERT_ID]: 'saving' }));
    try { await sendAction(a.ALERT_ID, action, 'From the alert queue'); setDone((d) => ({ ...d, [a.ALERT_ID]: action })); }
    catch (e) { setDone((d) => ({ ...d, [a.ALERT_ID]: `error: ${e instanceof Error ? e.message : e}` })); }
  };
  const SortTh = ({ k, children, right }: { k: SortKey; children: string; right?: boolean }) => (
    <th className={right ? 'text-right' : ''} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button className="sort-btn" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>{children}<ArrowDownUp className={`w-3 h-3 ${sort.k === k ? 'text-signal' : ''}`} aria-hidden /></button>
    </th>
  );
  const actionCell = (a: Alert) => {
    const d = done[a.ALERT_ID] ?? a.LAST_ACTION ?? undefined;
    if (d && d !== 'saving') return <Tag tone={d.startsWith('error') ? 'fraud' : statusTone(d)}>{DONE_LABEL[d] ?? d}</Tag>;
    if (status !== 'OPEN') return <Tag tone={statusTone(a.STATUS)}>{nice(a.STATUS)}</Tag>;
    return (
      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        {ACTIONS.map(({ k, label, cls, icon: I }) => <button key={k} className={`btn btn-sm ${cls} !px-1.5`} disabled={d === 'saving'} onClick={() => act(a, k)} title={label} aria-label={`${label}: ${a.ALERT_ID}`}><I className="w-3.5 h-3.5" aria-hidden /></button>)}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <PageHead eyebrow="Work queue" title="Alert queue"
        sub="Highest risk first. SLA: 4 h for high priority, 12 h for medium, 24 h for low, counted to the data set's “now” (Nov 15, 09:00)."
        right={<><PoweredBy>Snowflake SQL</PoweredBy><SourceChip ms={q.data?.ms} source={q.data?.source} /></>} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="seg" role="tablist" aria-label="Alert status">
          {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={status === id} aria-pressed={status === id} onClick={() => { setStatus(id); setSel(undefined); }}>{label}</button>)}
        </div>
        <label className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="w-4 h-4 muted absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
          <input className="field !pl-8" placeholder="Search alert, account, merchant, reason" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search alerts" />
        </label>
        <select className="field !w-auto" value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Priority">
          <option value="ALL">All priorities</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
        </select>
        <select className="field !w-auto" value={chan} onChange={(e) => setChan(e.target.value)} aria-label="Channel">
          <option value="ALL">All channels</option>{channels.map((c) => <option key={c} value={c}>{nice(c)}</option>)}
        </select>
      </div>

      <div className={`grid gap-3 ${sel ? 'xl:grid-cols-[1fr_400px]' : ''}`}>
        <Panel pad={false} eyebrow={q.data ? `${q.data.total.toLocaleString()} alerts${q.data.total > q.data.rows.length ? ` · top ${q.data.rows.length} shown` : ''}` : 'Loading'} title={`${rows.length} matching`}>
          {q.error ? <div className="p-4"><ErrorBox error={q.error} /></div> : q.loading || !q.data ? (
            <div className="p-4 space-y-2" role="status" aria-label="Loading alerts">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          ) : rows.length === 0 ? <div className="p-4"><Empty title="No alerts match">Clear the search or filters to see the full queue.</Empty></div> : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="dtable">
                  <thead><tr><th>Alert</th><th>Payment</th><SortTh k="AMOUNT" right>Amount</SortTh><SortTh k="SCORE">Score</SortTh><th>Reasons</th><SortTh k="SLA_MIN_LEFT">SLA</SortTh><th>Action</th></tr></thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.ALERT_ID} className={`cursor-pointer ${sel?.ALERT_ID === a.ALERT_ID ? 'is-selected' : ''}`} onClick={() => setSel(a)}>
                        <td><div className="flex items-center gap-2"><Tag tone={priorityTone(a.PRIORITY)} mono>{a.PRIORITY[0]}</Tag><span className="mono font-semibold">{a.ALERT_ID}</span></div>
                          <div className="text-xs muted mt-0.5">{a.CUSTOMER_NAME} · <span className="mono">{a.ACCOUNT_ID}</span></div></td>
                        <td><div className="text-[13px]">{nice(a.CHANNEL)}</div><div className="text-xs muted truncate max-w-[180px]">{a.MERCHANT_NAME ?? 'Instant payment'} · <span className="mono">{a.CREATED_TS.slice(5, 16)}</span></div></td>
                        <td className="text-right mono font-semibold">{usd(a.AMOUNT)}</td>
                        <td><ScoreCell s={a.SCORE} /></td>
                        <td><div className="flex flex-wrap gap-1 max-w-[260px]">{a.RULES.map((r) => <Tag key={r} tone="warn">Rule · {nice(r)}</Tag>)}{a.REASON_CODES.slice(0, 3).map((r) => <Tag key={r}>{nice(r)}</Tag>)}</div></td>
                        <td><SlaPill min={a.SLA_MIN_LEFT} open={status === 'OPEN'} /></td>
                        <td>{actionCell(a)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="md:hidden divide-y divide-[var(--line)]">
                {rows.map((a) => (
                  <li key={a.ALERT_ID} className="p-3" onClick={() => setSel(a)}>
                    <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Tag tone={priorityTone(a.PRIORITY)} mono>{a.PRIORITY[0]}</Tag><span className="mono font-semibold">{a.ALERT_ID}</span></span><span className="mono font-semibold">{usd(a.AMOUNT)}</span></div>
                    <div className="text-xs muted mt-1">{a.CUSTOMER_NAME} · {nice(a.CHANNEL)}</div>
                    <div className="flex items-center justify-between mt-2 gap-2"><ScoreCell s={a.SCORE} /><SlaPill min={a.SLA_MIN_LEFT} open={status === 'OPEN'} /></div>
                    <div className="flex flex-wrap gap-1 mt-2">{a.REASON_CODES.slice(0, 3).map((r) => <Tag key={r}>{nice(r)}</Tag>)}</div>
                    <div className="mt-2">{actionCell(a)}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        {sel && (
          <aside className="panel drawer p-4 h-fit xl:sticky xl:top-[110px] space-y-4" aria-label={`Alert ${sel.ALERT_ID} details`}>
            <div className="flex items-start justify-between gap-2">
              <div><div className="eyebrow">Alert detail</div><div className="mono text-lg font-bold">{sel.ALERT_ID}</div><div className="text-sm muted">{sel.CUSTOMER_NAME} · <span className="mono">{sel.ACCOUNT_ID}</span></div></div>
              <button className="btn btn-sm !p-1.5" onClick={() => setSel(undefined)} aria-label="Close details"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="inset p-2.5"><div className="eyebrow">Score</div><ScoreCell s={sel.SCORE} /></div>
              <div className="inset p-2.5"><div className="eyebrow">Amount</div><div className="mono font-bold">{usd(sel.AMOUNT)}</div></div>
              <div className="inset p-2.5"><div className="eyebrow">Channel</div><div className="text-[13px]">{nice(sel.CHANNEL)}</div></div>
              <div className="inset p-2.5"><div className="eyebrow">Linked accounts</div><div className={`mono font-bold ${sel.LINKED_ACCOUNTS > 2 ? 'text-fraud' : ''}`}>{sel.LINKED_ACCOUNTS}</div></div>
            </div>
            <div><div className="eyebrow mb-1.5">Why it fired</div><div className="flex flex-wrap gap-1">{sel.RULES.map((r) => <Tag key={r} tone="warn">Rule · {nice(r)}</Tag>)}{sel.REASON_CODES.map((r) => <Tag key={r}>{nice(r)}</Tag>)}</div></div>
            <AlertModel alertId={sel.ALERT_ID} />
            <div className="text-xs muted mono">{sel.MERCHANT_NAME ?? 'Instant payment'} · {sel.CREATED_TS}</div>
            <div className="flex items-center justify-between gap-2"><SlaPill min={sel.SLA_MIN_LEFT} open={status === 'OPEN'} />{actionCell(sel)}</div>
            <Link href={`/case/?id=${sel.ALERT_ID}`} className="btn btn-primary w-full justify-center">Open case: timeline, map, link graph, AI summary<ArrowRight className="w-4 h-4" aria-hidden /></Link>
            <p className="text-[11px] muted">{q.data?.source === 'live' ? 'Actions are written to APP.ALERT_ACTIONS and update APP.ALERTS.' : 'Sample mode: actions are kept in this browser only.'}</p>
          </aside>
        )}
      </div>
    </div>
  );
}
