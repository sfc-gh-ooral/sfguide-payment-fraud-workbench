'use client';

// Alert queue: model score, reason codes, and an SLA timer. Analysts confirm fraud, mark a false
// positive, or escalate right from the queue, or open the case for the full investigation.
import Link from 'next/link';
import { useState } from 'react';
import { Card, ErrorBox, PoweredBy, SourceChip, Tag, Thinking, nice, sla, usd } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { STORY_CASES, fetchAlerts, sendAction } from '@/lib/client';
import type { Alert } from '@/lib/types';

const TABS = [['OPEN', 'Open'], ['CONFIRMED_FRAUD', 'Confirmed fraud'], ['FALSE_POSITIVE', 'False positive']] as const;
const ACTION_LABEL: Record<string, string> = { CONFIRM_FRAUD: 'Confirmed fraud', FALSE_POSITIVE: 'False positive', ESCALATE: 'Escalated' };

export default function AlertQueue() {
  const [status, setStatus] = useState<string>('OPEN');
  const [done, setDone] = useState<Record<string, string>>({});
  const q = useAsync(() => fetchAlerts(status), [status]);
  const act = async (a: Alert, action: string) => {
    setDone((d) => ({ ...d, [a.ALERT_ID]: 'saving' }));
    try { await sendAction(a.ALERT_ID, action, 'From the alert queue'); setDone((d) => ({ ...d, [a.ALERT_ID]: action })); }
    catch (e) { setDone((d) => ({ ...d, [a.ALERT_ID]: `error: ${e instanceof Error ? e.message : e}` })); }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="seg flex" role="tablist" aria-label="Alert status">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={status === id} aria-pressed={status === id} onClick={() => setStatus(id)} className="px-3 py-1.5 text-xs font-medium">{label}</button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap"><PoweredBy>Snowpark ML (XGBoost)</PoweredBy><SourceChip ms={q.data?.ms} source={q.data?.source} /></div>
      </div>
      <Card title="Cases to start with">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {STORY_CASES.map((c) => (
            <Link key={c.id} href={`/case/?id=${c.id}`} className="card card-hover p-3 no-underline block">
              <div className="text-sm font-semibold">{c.title}</div><div className="text-xs muted">{c.id} · {c.hint}</div>
            </Link>
          ))}
        </div>
      </Card>
      {q.error ? <ErrorBox error={q.error} /> : q.loading || !q.data ? <Thinking label="Loading alerts" /> : (
        <Card title={`${q.data.total.toLocaleString()} alerts${q.data.total > q.data.rows.length ? ` · showing the top ${q.data.rows.length}` : ''}`}>
          <div className="relative overflow-x-auto">
            <table className="data-table w-full text-sm min-w-[880px]">
              <thead><tr><th className="text-left">Alert</th><th className="text-left">Payment</th><th className="text-right">Score</th><th className="text-left">Reasons</th><th className="text-left">SLA</th><th className="text-left">Action</th></tr></thead>
              <tbody>
                {q.data.rows.map((a) => {
                  const s = sla(a.SLA_MIN_LEFT);
                  const d = done[a.ALERT_ID] ?? a.LAST_ACTION ?? undefined;
                  return (
                    <tr key={a.ALERT_ID}>
                      <td><Link href={`/case/?id=${a.ALERT_ID}`} className="font-semibold underline-offset-2">{a.ALERT_ID}</Link>
                        <div className="text-xs muted">{a.CUSTOMER_NAME} · {a.ACCOUNT_ID}</div>
                        <div className="mt-1"><Tag tone={a.PRIORITY === 'HIGH' ? 'danger' : a.PRIORITY === 'MEDIUM' ? 'warning' : 'neutral'}>{a.PRIORITY}</Tag></div></td>
                      <td><div className="tabular font-medium">{usd(a.AMOUNT)}</div>
                        <div className="text-xs muted">{nice(a.CHANNEL)}{a.MERCHANT_NAME ? ` · ${a.MERCHANT_NAME}` : ''}</div>
                        <div className="text-xs muted tabular">{a.CREATED_TS.slice(5, 16)}</div></td>
                      <td className="text-right tabular font-semibold">{a.SCORE.toFixed(3)}</td>
                      <td><div className="flex flex-wrap gap-1 max-w-[280px]">
                        {a.RULES.map((r) => <Tag key={r} tone="danger">Rule: {nice(r)}</Tag>)}
                        {a.REASON_CODES.slice(0, 4).map((r) => <Tag key={r}>{nice(r)}</Tag>)}
                      </div></td>
                      <td>{status === 'OPEN' ? <Tag tone={s.tone}>{s.text}</Tag> : <span className="text-xs muted">Closed</span>}</td>
                      <td>{d && d !== 'saving' ? <span className="text-xs font-medium" style={{ color: d.startsWith('error') ? 'var(--negative)' : 'var(--positive)' }}>{ACTION_LABEL[d] ?? d}</span>
                        : status === 'OPEN' ? (
                          <div className="flex gap-1 flex-wrap">
                            <button className="btn !py-1 !px-2 text-xs" disabled={d === 'saving'} onClick={() => act(a, 'CONFIRM_FRAUD')}>Confirm fraud</button>
                            <button className="btn !py-1 !px-2 text-xs" disabled={d === 'saving'} onClick={() => act(a, 'FALSE_POSITIVE')}>False positive</button>
                            <button className="btn !py-1 !px-2 text-xs" disabled={d === 'saving'} onClick={() => act(a, 'ESCALATE')}>Escalate</button>
                          </div>) : <span className="text-xs muted">{nice(a.STATUS)}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs muted mt-3">SLA: 4 hours for high priority, 12 for medium, 24 for low, counted to the data set&apos;s &ldquo;now&rdquo; (Nov 15, 09:00). In Live mode, actions are written to APP.ALERT_ACTIONS.</p>
        </Card>
      )}
    </div>
  );
}
