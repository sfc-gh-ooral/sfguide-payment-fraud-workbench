// Captures the bundled Sample-mode data from a running Live-mode app (npm run dev with .env.local),
// so the no-account example shows the same synthetic rows and AI text captured from a live run.
// Usage: node scripts/capture-sample.mjs [http://localhost:3000]
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const STORIES = ['AL9200001', 'AL9400084', 'AL9500002', 'AL90000200', 'AL9600948', 'AL91000015'];
const QUESTIONS = [
  'Which merchants had card-testing patterns this week?',
  'How many open high-priority alerts are there by channel?',
  'Which merchant had the most false-positive alerts, and on which day?',
];
const get = async (path, init) => {
  const r = await fetch(BASE + path, init);
  const j = await r.json();
  if (!r.ok) throw new Error(`${path}: ${j.error}`);
  return j;
};

const out = { capturedAt: new Date().toISOString().slice(0, 10), overview: await get('/api/overview'), queues: {}, cases: {}, summaries: {}, answers: [] };
out.model = await get('/api/model');
for (const s of ['OPEN', 'CONFIRMED_FRAUD', 'FALSE_POSITIVE']) out.queues[s] = await get(`/api/alerts?status=${s}`);
// Bundle the story cases plus the first rows of the open queue, so every queue row on screen opens.
const ids = [...new Set([...STORIES, ...out.queues.OPEN.rows.slice(0, 12).map((r) => r.ALERT_ID),
  ...out.queues.CONFIRMED_FRAUD.rows.slice(0, 4).map((r) => r.ALERT_ID), ...out.queues.FALSE_POSITIVE.rows.slice(0, 3).map((r) => r.ALERT_ID)])];
for (const id of ids) {
  out.cases[id] = await get(`/api/case?alert=${id}`);
  out.summaries[id] = (await get(`/api/summary?alert=${id}`)).text;
  console.log('captured case', id);
}
// Queues show the bundled cases only, so each row opens in Sample mode; totals stay as captured.
for (const s of Object.keys(out.queues)) {
  const q = out.queues[s];
  const extra = ids.filter((id) => out.cases[id].alert.STATUS === s && !q.rows.some((r) => r.ALERT_ID === id)).map((id) => out.cases[id].alert);
  q.rows = [...q.rows.filter((r) => ids.includes(r.ALERT_ID)), ...extra];
}
for (const question of QUESTIONS) {
  const a = await get('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
  out.answers.push({ question, text: a.text });
  console.log('answered', question, a.latencyMs, 'ms');
}
writeFileSync('lib/mock/sample.json', JSON.stringify(out, null, 1) + '\n');
console.log('wrote lib/mock/sample.json');
