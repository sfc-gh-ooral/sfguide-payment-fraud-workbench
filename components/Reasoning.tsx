'use client';

// Staged progress for AI calls. The steps mirror what the live path actually does. Steps advance on a
// timer; the last one holds until the real (or sample) answer arrives.
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SAMPLE_DELAY_MS } from '@/lib/sample-timing';

export type ReasoningKind = 'summary' | 'ask';

const STEPS: Record<ReasoningKind, string[]> = {
  summary: [
    'Reading the alert, timeline, and link graph from PAYMENT_FRAUD_WB',
    'Assembling reason codes, devices, and linked accounts as case facts',
    'Drafting the case summary and next step with AI_COMPLETE',
  ],
  ask: [
    'Sending the question to the Cortex Agent',
    'Planning with the ALERTS_SV semantic view',
    'Generating SQL with Cortex Analyst and running it on the warehouse',
    'Writing the answer from the query results',
  ],
};

export function Reasoning({ kind, compact = false }: { kind: ReasoningKind; compact?: boolean }) {
  const steps = STEPS[kind];
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const per = SAMPLE_DELAY_MS[kind] / steps.length;
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const ms = Date.now() - t0;
      setElapsed(ms);
      setStep(Math.min(steps.length - 1, Math.floor(ms / per)));
    }, 120);
    return () => window.clearInterval(id);
  }, [kind, steps.length]);

  return (
    <div className="reasoning" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
          <span className="reasoning-orb" aria-hidden />Reasoning
        </div>
        <span className="text-[11px] muted tabular">{(elapsed / 1000).toFixed(1)}s</span>
      </div>
      <ol className="space-y-1.5">
        {(compact ? steps.slice(Math.max(0, step - 1), step + 1) : steps).map((s) => {
          const i = steps.indexOf(s);
          const state = i < step ? 'done' : i === step ? 'active' : 'todo';
          return (
            <li key={s} className={`reasoning-step ${state} flex items-center gap-2 text-xs`}>
              {state === 'done' ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--positive)' }} aria-hidden />
                : state === 'active' ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent)' }} aria-hidden />
                : <span className="w-3.5 h-3.5 rounded-full border" style={{ borderColor: 'var(--border)' }} aria-hidden />}
              <span>{s}</span>
            </li>
          );
        })}
      </ol>
      <div className="reasoning-bar mt-3" aria-hidden><span style={{ width: `${Math.min(96, (elapsed / SAMPLE_DELAY_MS[kind]) * 100)}%` }} /></div>
    </div>
  );
}
