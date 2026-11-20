'use client';

// Browser-side data access. Sample mode reads the bundled capture (lib/mock/sample.json: the same
// synthetic rows captured from a live run). Live mode calls the API routes, and a failed live call
// surfaces as an error: it never falls back to sample data.
import sample from '@/lib/mock/sample.json';
import { HOSTED_EXAMPLE } from '@/lib/hosted';
import { preferSample } from '@/lib/mode';
import { SAMPLE_DELAY_MS } from '@/lib/sample-timing';
import type { AiText, AlertQueue, CaseDetail, ModelInfo, Overview } from '@/lib/types';

interface SampleBundle {
  capturedAt: string; overview: Overview; queues: Record<string, AlertQueue>; cases: Record<string, CaseDetail>;
  model: ModelInfo; summaries: Record<string, string>; answers: { question: string; text: string; sql?: string }[];
}
const S = sample as unknown as SampleBundle;
export const CAPTURED_AT = S.capturedAt;
export const SAMPLE_QUESTIONS = S.answers.map((a) => a.question);
export const SAMPLE_CASE_IDS = Object.keys(S.cases);

/** The planted stories in the synthetic data (see data/README.md), as entry points to the case screen. */
export const STORY_CASES = [
  { id: 'AL9200001', title: 'Account takeover', hint: 'new device, reset, P2P drain' },
  { id: 'AL9400084', title: 'Mule ring', hint: '12 accounts share devices' },
  { id: 'AL9500002', title: 'Impossible travel', hint: 'Boston to Miami in 28 min' },
  { id: 'AL90000200', title: 'Card testing', hint: '$1 tests at one merchant' },
  { id: 'AL9600948', title: 'Promo false positive', hint: 'legit checkout spike' },
];

let modePromise: Promise<boolean> | undefined;
/** True when the server has a Snowflake connection and the reader hasn't chosen Sample. */
export function isLive(): Promise<boolean> {
  if (HOSTED_EXAMPLE) return Promise.resolve(false);
  // If the mode check fails, every screen shows that error: it never silently falls back to Sample.
  modePromise ??= fetch('/api/mode')
    .then((r) => { if (!r.ok) throw new Error(`Couldn't check Live or Sample mode (GET /api/mode: HTTP ${r.status}).`); return r.json(); })
    .then((j) => j.mode === 'live' && !preferSample(),
      (e) => { modePromise = undefined; throw e instanceof TypeError ? new Error(`Couldn't check Live or Sample mode (GET /api/mode: ${e.message}).`) : e; });
  return modePromise;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as T;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms: number) => ms - 800 + Math.round(Math.random() * 1600);

// Decisions made in Sample mode are kept in this browser session only.
const local = new Map<string, string>();

export async function fetchOverview(): Promise<Overview> {
  if (await isLive()) return api('/api/overview');
  return { ...S.overview, source: 'captured' };
}

export async function fetchAlerts(status: string): Promise<AlertQueue> {
  if (await isLive()) return api(`/api/alerts?status=${encodeURIComponent(status)}`);
  const q = S.queues[status];
  const rows = q.rows.map((r) => (local.has(r.ALERT_ID) ? { ...r, LAST_ACTION: local.get(r.ALERT_ID)! } : r));
  return { ...q, rows, source: 'captured' };
}

export async function fetchCase(alert: string): Promise<CaseDetail> {
  if (await isLive()) return api(`/api/case?alert=${encodeURIComponent(alert)}`);
  const c = S.cases[alert];
  if (!c) throw new Error(`${alert} isn’t in the bundled sample. Open one of the story cases from the queue, or run Live mode for every alert.`);
  const a = local.get(alert);
  return { ...c, actions: a ? [{ ACTION: a, NOTE: 'Recorded in this browser (Sample mode)', ACTED_AT: 'just now' }, ...c.actions] : c.actions, source: 'captured' };
}

export async function sendAction(alert: string, action: string, note: string): Promise<void> {
  if (await isLive()) { await api('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alert, action, note }) }); return; }
  local.set(alert, action);
  await wait(500);
}

export async function fetchModel(): Promise<ModelInfo> {
  if (await isLive()) return api('/api/model');
  return { ...S.model, source: 'captured' };
}

export async function fetchSummary(alert: string): Promise<AiText> {
  if (await isLive()) return api(`/api/summary?alert=${encodeURIComponent(alert)}`);
  const text = S.summaries[alert];
  if (!text) throw new Error('No sample summary is bundled for this case.');
  await wait(jitter(SAMPLE_DELAY_MS.summary));
  return { text, latencyMs: 0, model: 'scripted', source: 'sample' };
}

export async function ask(question: string): Promise<AiText> {
  if (await isLive()) return api('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
  const hit = S.answers.find((a) => a.question.toLowerCase() === question.trim().toLowerCase());
  await wait(jitter(SAMPLE_DELAY_MS.ask));
  if (!hit) return { text: 'This hosted example only has scripted answers for the suggested questions. Pick one of them, or run Live mode to ask the Cortex Agent anything about the alerts.', latencyMs: 0, model: 'scripted', source: 'sample' };
  return { text: hit.text, sql: hit.sql, latencyMs: 0, model: 'scripted', source: 'sample' };
}
