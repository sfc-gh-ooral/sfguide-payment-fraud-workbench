'use client';

// Shared Ferrovane UI: panels, KPI tiles with sparkline and delta, pills, skeletons, error state,
// animated counters, staged AI reasoning, streaming text, and a tiny markdown renderer for AI text.
import { ArrowDownRight, ArrowUpRight, Bot, Check, Loader2, Sparkles, Timer } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/* ---------- formatting ---------- */
export const money = (x: number): string => {
  if (x < 0) return `−${money(-x)}`;
  return x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : x >= 1e3 ? `$${(x / 1e3).toFixed(1)}K` : `$${Math.round(x)}`;
};
export const usd = (x: number) => `$${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const nice = (code: string) => code.replace(/_/g, ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase()).replace(/\bp2p\b/i, 'P2P').replace(/\bip\b/i, 'IP');
export function sla(min: number) {
  const h = Math.floor(Math.abs(min) / 60), m = Math.abs(min) % 60;
  const t = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${String(m).padStart(2, '0')}m`;
  return min < 0 ? { text: `Overdue ${t}`, tone: 'fraud' as const } : { text: `${t} left`, tone: min < 120 ? 'warn' as const : 'neutral' as const };
}

/* ---------- layout ---------- */
export function Panel({ title, eyebrow, right, children, className = '', pad = true }: {
  title?: ReactNode; eyebrow?: string; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean;
}) {
  return (
    <section className={`panel rise min-w-0 ${className}`}>
      {(title || right || eyebrow) && (
        <header className="flex items-start justify-between gap-3 flex-wrap px-4 pt-3.5 pb-2.5 border-b border-line">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>}
          </div>
          {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function PageHead({ eyebrow, title, sub, right }: { eyebrow: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap mb-4 rise">
      <div className="min-w-0">
        <div className="eyebrow text-signal mb-1">{eyebrow}</div>
        <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight leading-tight">{title}</h1>
        {sub && <p className="text-[13px] muted mt-1 max-w-3xl">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
    </div>
  );
}

/* ---------- numbers ---------- */
export function Counter({ value, format }: { value: number; format: (n: number) => string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(value); return; }
    const t0 = performance.now(); let raf = 0;
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 900); setN(value * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(n)}</>;
}

export function Spark({ data, color = 'var(--signal)', h = 28 }: { data: number[]; color?: string; h?: number }) {
  if (data.length < 2) return null;
  const w = 100, max = Math.max(...data), min = Math.min(...data), r = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / r) * (h - 4)}`);
  const id = `sp${Math.abs(data.reduce((a, b) => a + b, 0) * 1000 | 0)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }} aria-hidden>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** KPI tile. `delta` is a fraction; `goodWhenDown` colors a fall as good (fraud, losses). */
export function Kpi({ label, value, format, sub, delta, goodWhenDown, spark, color, icon }: {
  label: string; value: number; format: (n: number) => string; sub?: ReactNode; delta?: number; goodWhenDown?: boolean;
  spark?: number[]; color?: string; icon?: ReactNode;
}) {
  const good = delta === undefined ? undefined : goodWhenDown ? delta <= 0 : delta >= 0;
  return (
    <div className="panel panel-hover rise p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-2"><span className="eyebrow truncate">{label}</span>{icon && <span className="muted">{icon}</span>}</div>
      <div className="mono text-[26px] font-bold tracking-tight leading-none mt-1" style={{ color }}><Counter value={value} format={format} /></div>
      <div className="flex items-center gap-2 text-xs muted min-h-[18px]">
        {delta !== undefined && (
          <span className={`mono inline-flex items-center gap-0.5 font-semibold ${good ? 'text-clear' : 'text-fraud'}`}>
            {delta >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" aria-hidden /> : <ArrowDownRight className="w-3.5 h-3.5" aria-hidden />}
            {Math.abs(delta * 100).toFixed(1)}%
          </span>
        )}
        <span className="truncate">{sub}</span>
      </div>
      {spark && <div className="mt-1"><Spark data={spark} color={color ?? 'var(--signal)'} /></div>}
    </div>
  );
}

/* ---------- pills ---------- */
type Tone = 'neutral' | 'fraud' | 'warn' | 'clear' | 'link' | 'signal' | 'ai';
const toneVar = (t: Tone) => (t === 'neutral' ? 'var(--muted)' : `var(--${t})`);
export function Tag({ children, tone = 'neutral', title, mono }: { children: ReactNode; tone?: Tone; title?: string; mono?: boolean }) {
  const c = toneVar(tone);
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap border ${mono ? 'mono' : ''}`}
      style={{ color: tone === 'neutral' ? 'var(--ink)' : c, borderColor: `color-mix(in srgb, ${c} 38%, transparent)`, background: `color-mix(in srgb, ${c} ${tone === 'neutral' ? 6 : 11}%, transparent)` }}>
      {children}
    </span>
  );
}
export const priorityTone = (p: string): Tone => (p === 'HIGH' ? 'fraud' : p === 'MEDIUM' ? 'warn' : 'neutral');
export const statusTone = (s: string): Tone => (s.includes('FRAUD') ? 'fraud' : s.includes('FALSE') ? 'clear' : s.includes('ESCAL') ? 'warn' : 'link');

/** Names the Snowflake capability behind a component (only capabilities this example runs live). */
export function PoweredBy({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-signal mono whitespace-nowrap"><Sparkles className="w-3 h-3" aria-hidden />Powered by {children}</span>;
}
export function SampleAiBadge() {
  return <Tag tone="ai" title="Scripted answer in no-account mode, not live Cortex output"><Bot className="w-3 h-3" aria-hidden />Sample AI response</Tag>;
}
export function SourceChip({ ms, source }: { ms?: number; source?: 'live' | 'captured' }) {
  if (!source) return null;
  const live = source === 'live';
  return (
    <span className="mono inline-flex items-center gap-1 text-[11px] muted whitespace-nowrap" title={live ? 'Queried from Snowflake just now' : 'Bundled rows captured from a live run'}>
      <Timer className="w-3 h-3" aria-hidden />{live ? <><span className="text-clear">live</span> · {(ms ?? 0).toLocaleString()} ms</> : 'captured sample'}
    </span>
  );
}

/* ---------- states ---------- */
export function Skeleton({ className = '' }: { className?: string }) { return <div className={`skel ${className}`} aria-hidden />; }
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <Skeleton className="h-8 w-72" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px]" />)}</div>
      <div className="grid lg:grid-cols-3 gap-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /></div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}
export function ErrorBox({ error }: { error: string }) {
  return (
    <div role="alert" className="panel p-4 text-sm border-[color-mix(in_srgb,var(--fraud)_55%,transparent)]">
      <div className="eyebrow text-fraud mb-1">Live call failed</div>
      <p>{error}</p>
      <p className="muted text-xs mt-2">Live mode never falls back to sample data. Check that <code className="mono">sql/setup.sql</code> ran and that <code className="mono">.env.local</code> is set, or switch to Sample.</p>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="inset p-6 text-center"><div className="font-semibold">{title}</div>{children && <div className="text-sm muted mt-1">{children}</div>}</div>;
}

/* ---------- AI ---------- */
/** Staged progress for an AI call. Steps advance on a timer; the last holds until the answer arrives. */
export function Reasoning({ steps, durationMs }: { steps: string[]; durationMs: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - t0), 100);
    return () => window.clearInterval(id);
  }, []);
  const step = Math.min(steps.length - 1, Math.floor(elapsed / (durationMs / steps.length)));
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow text-ai flex items-center gap-2"><span className="pulse" />Reasoning</span>
        <span className="mono text-[11px] muted">{(elapsed / 1000).toFixed(1)} s</span>
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => {
          const st = i < step ? 'done' : i === step ? 'active' : 'todo';
          return (
            <li key={s} className={`flex items-center gap-2 text-[13px] transition-opacity ${st === 'todo' ? 'opacity-40' : ''}`}>
              {st === 'done' ? <Check className="w-4 h-4 text-clear shrink-0" aria-hidden /> : st === 'active' ? <Loader2 className="w-4 h-4 animate-spin text-ai shrink-0" aria-hidden /> : <span className="w-4 h-4 rounded-full border border-line shrink-0" aria-hidden />}
              <span>{s}</span>
            </li>
          );
        })}
      </ol>
      <div className="ai-bar" aria-hidden><span style={{ width: `${Math.min(96, (elapsed / durationMs) * 100)}%` }} /></div>
    </div>
  );
}

/** Streaming-style reveal: grows the text a few words at a time, then renders it as markdown. */
export function StreamText({ text, onDone }: { text: string; onDone?: () => void }) {
  const words = useRef(text.split(/(\s+)/));
  const [n, setN] = useState(0);
  useEffect(() => {
    words.current = text.split(/(\s+)/);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(words.current.length); return; }
    setN(0);
    const per = Math.max(2, Math.ceil(words.current.length / 90));
    const id = window.setInterval(() => setN((x) => {
      const nx = Math.min(words.current.length, x + per);
      if (nx >= words.current.length) window.clearInterval(id);
      return nx;
    }), 28);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const done = n >= words.current.length;
  useEffect(() => { if (done && n > 0) onDone?.(); }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={done ? '' : 'caret'}><Markdown text={words.current.slice(0, n).join('')} /></div>;
}

/* ---------- markdown (text is escaped by React) ---------- */
function inline(s: string, key: number): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_|\*[^*]+\*)/g).filter(Boolean);
  return <span key={key}>{parts.map((p, i) =>
    p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong>
      : p.startsWith('`') ? <code key={i} className="mono text-[12px]">{p.slice(1, -1)}</code>
        : (p.startsWith('_') && p.endsWith('_') && p.length > 2) || (p.startsWith('*') && p.endsWith('*') && p.length > 2) ? <em key={i}>{p.slice(1, -1)}</em>
          : p)}</span>;
}
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim())); i++; }
      const body = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      if (body.length) out.push(<table key={k++}><thead><tr>{body[0].map((c, j) => <th key={j}>{inline(c, j)}</th>)}</tr></thead>
        <tbody>{body.slice(1).map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, j)}</td>)}</tr>)}</tbody></table>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')); i++; }
      const li = items.map((t, j) => <li key={j}>{inline(t, j)}</li>);
      out.push(ordered ? <ol key={k++}>{li}</ol> : <ul key={k++}>{li}</ul>);
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(l)) { i++; continue; }
    if (/^#{1,4}\s/.test(l)) { out.push(<p key={k++} className="eyebrow !text-[11px] !text-ink mt-3">{l.replace(/^#+\s/, '')}</p>); i++; continue; }
    if (l.trim()) out.push(<p key={k++}>{inline(l, 0)}</p>);
    i++;
  }
  return <div className="prose-ai text-[13.5px] leading-relaxed">{out}</div>;
}
