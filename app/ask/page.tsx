'use client';

// Ask: plain-language questions about alerts, answered by a Cortex Agent that uses Cortex Analyst over
// the ALERTS_SV semantic view. Answers stream in and cite the semantic view and the SQL that ran.
import { Bot, ChevronDown, Database, Send, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ErrorBox, PageHead, PoweredBy, Reasoning, SampleAiBadge, StreamText } from '@/components/ui';
import { SAMPLE_QUESTIONS, ask } from '@/lib/client';
import { SAMPLE_DELAY_MS } from '@/lib/sample-timing';
import type { AiText } from '@/lib/types';

const STEPS = [
  'Sending the question to the Cortex Agent FRAUD_AGENT…',
  'Planning against the ALERTS_SV semantic view (alerts, merchants, channels, dispositions)…',
  'Generating SQL with Cortex Analyst and running it on the warehouse…',
  'Writing the answer from the result rows…',
];

function Turn({ q, a, error }: { q: string; a?: AiText; error?: string }) {
  const [done, setDone] = useState(false);
  return (
    <li className="space-y-3 rise">
      <div className="flex gap-3 justify-end"><div className="inset px-3.5 py-2.5 text-[13.5px] max-w-[85%]">{q}</div><UserRound className="w-7 h-7 p-1.5 rounded inset shrink-0" aria-hidden /></div>
      <div className="flex gap-3">
        <Bot className="w-7 h-7 p-1.5 rounded shrink-0 text-ai border border-[color-mix(in_srgb,var(--ai)_45%,transparent)]" aria-hidden />
        <div className="panel ai-panel p-4 flex-1 min-w-0">
          {error ? <ErrorBox error={error} /> : !a ? <Reasoning steps={STEPS} durationMs={SAMPLE_DELAY_MS.ask} /> : (
            <>
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="eyebrow text-ai">Fraud agent</span>
                {a.source === 'sample' ? <SampleAiBadge /> : <span className="mono text-[11px] muted">{a.model} · {(a.latencyMs / 1000).toFixed(1)} s</span>}
              </div>
              <StreamText text={a.text} onDone={() => setDone(true)} />
              {done && (
                <div className="rise mt-3 pt-3 border-t border-line space-y-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"><Database className="w-3.5 h-3.5 text-link" aria-hidden /><span className="muted">Source</span><span className="mono break-all">PAYMENT_FRAUD_WB.APP.ALERTS_SV</span><span className="muted">via Cortex Analyst</span></div>
                  {a.sql && (
                    <details className="text-xs group"><summary className="cursor-pointer muted inline-flex items-center gap-1">SQL that ran<ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" aria-hidden /></summary>
                      <pre className="inset mono text-[11.5px] p-3 mt-2 overflow-x-auto whitespace-pre-wrap">{a.sql}</pre></details>
                  )}
                  {a.source === 'sample' && <p className="text-[11px] muted">Scripted sample captured from a live Cortex Agent run. Run Live mode to ask anything.</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export default function AskPage() {
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState<{ q: string; a?: AiText; error?: string }[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const busy = turns.length > 0 && !turns[turns.length - 1].a && !turns[turns.length - 1].error;
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns.length]);
  const go = (question: string) => {
    if (!question.trim() || busy) return;
    setQ('');
    setTurns((t) => [...t, { q: question }]);
    ask(question).then((a) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x))),
      (e) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: String(e.message ?? e) } : x))));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <PageHead eyebrow="Ask" title="Ask the alert book" sub="Questions in plain English about alerts, merchants, channels, and dispositions. The agent writes and runs the SQL; you check the answer."
        right={<PoweredBy>Cortex Agents · Cortex Analyst</PoweredBy>} />

      {turns.length === 0 && (
        <div className="grid sm:grid-cols-3 gap-2">
          {SAMPLE_QUESTIONS.map((s) => (
            <button key={s} onClick={() => go(s)} className="panel panel-hover rise p-3.5 text-left text-[13px] font-medium">
              <span className="eyebrow text-signal block mb-1">Try</span>{s}
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-6">{turns.map((t, i) => <Turn key={i} {...t} />)}</ul>
      <div ref={end} />

      <form className="panel p-2 flex gap-2 sticky bottom-20 md:bottom-4" onSubmit={(e) => { e.preventDefault(); go(q); }}>
        <input className="field !border-0 !bg-transparent" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Which merchants had card-testing patterns this week?" aria-label="Question" />
        <button className="btn btn-primary" disabled={busy || !q.trim()} aria-label="Send"><Send className="w-4 h-4" aria-hidden /><span className="hidden sm:inline">Ask</span></button>
      </form>
      {turns.length > 0 && <div className="flex flex-wrap gap-2">{SAMPLE_QUESTIONS.map((s) => <button key={s} className="btn btn-sm" disabled={busy} onClick={() => go(s)}>{s}</button>)}</div>}
    </div>
  );
}
