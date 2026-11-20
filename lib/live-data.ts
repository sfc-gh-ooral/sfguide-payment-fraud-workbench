// Live-mode queries against PAYMENT_FRAUD_WB (created by sql/setup.sql). Server only.
// All inputs are validated and passed as bind variables.
import { COMPLETE_MODEL, query } from '@/lib/snowflake';
import type { AiText, Alert, AlertFeatures, Rescore, TravelHop, AlertQueue, CaseDetail, GraphEdge, GraphNode, ModelInfo, Overview, TimelineItem } from '@/lib/types';

/** "Now" in the synthetic data set. SLA timers count down from here. */
export const DATA_NOW = '2026-11-15 09:00:00';

const ALERT_COLS = `a.ALERT_ID, a.TXN_ID, TO_VARCHAR(a.CREATED_TS, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_TS, a.ACCOUNT_ID, a.CUSTOMER_NAME,
  a.CHANNEL, a.MERCHANT_NAME, a.AMOUNT::FLOAT AS AMOUNT, a.SCORE::FLOAT AS SCORE, a.PRIORITY, a.RULES, a.REASON_CODES,
  DATEDIFF(MINUTE, '${DATA_NOW}'::TIMESTAMP_NTZ, a.SLA_DUE_TS) AS SLA_MIN_LEFT, a.STATUS, a.LINKED_ACCOUNTS,
  (SELECT MAX_BY(x.ACTION, x.ACTED_AT) FROM ALERT_ACTIONS x WHERE x.ALERT_ID = a.ALERT_ID) AS LAST_ACTION`;

const asArr = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? JSON.parse(v) : []) as string[];
const fixAlert = <T extends Alert>(r: T): T => ({ ...r, RULES: asArr(r.RULES), REASON_CODES: asArr(r.REASON_CODES) });

export async function getOverview(): Promise<Overview> {
  const t0 = Date.now();
  const [days, hex, cities, k, reasons] = await Promise.all([
    query<Overview['days'][number]>(`SELECT TO_VARCHAR(d.DAY) AS DAY, d.TXNS, d.FRAUD_TXNS, d.FRAUD_BPS::FLOAT AS FRAUD_BPS, d.FRAUD_LOSS::FLOAT AS FRAUD_LOSS,
        (SELECT COUNT(*) FROM ALERTS a WHERE a.CREATED_TS::DATE = d.DAY) AS ALERTS
      FROM DAILY_KPIS d WHERE d.DAY >= '2026-11-01' ORDER BY d.DAY`),
    query<Overview['hex'][number]>('SELECT H3_CELL, LAT, LON, FRAUD_TXNS, FRAUD_LOSS::FLOAT AS FRAUD_LOSS FROM FRAUD_HEX ORDER BY FRAUD_TXNS DESC'),
    query<Overview['cities'][number]>('SELECT CITY, LAT, LON FROM PAYMENT_FRAUD_WB.RAW.CITIES ORDER BY CITY_ID'),
    query<Record<string, number>>(`SELECT
        (SELECT SUM(TXNS) FROM DAILY_KPIS WHERE DAY >= '2026-11-01') AS TXNS,
        (SELECT ROUND(SUM(FRAUD_TXNS) / SUM(TXNS) * 10000, 2) FROM DAILY_KPIS WHERE DAY >= '2026-11-01') AS BPS,
        (SELECT SUM(FRAUD_LOSS) FROM DAILY_KPIS WHERE DAY >= '2026-11-01') AS LOSS,
        COUNT(*) AS ALERTS, COUNT_IF(STATUS = 'OPEN') AS OPEN_ALERTS,
        COUNT_IF(STATUS = 'CONFIRMED_FRAUD') / NULLIF(COUNT_IF(STATUS IN ('CONFIRMED_FRAUD', 'FALSE_POSITIVE')), 0) AS PREC,
        COUNT_IF(STATUS IN ('CONFIRMED_FRAUD', 'FALSE_POSITIVE')) AS WORKED
      FROM ALERTS`),
    query<{ REASON: string; N: number }>(`SELECT f.VALUE::STRING AS REASON, COUNT(*) AS N FROM ALERTS a, LATERAL FLATTEN(a.REASON_CODES) f
      WHERE a.STATUS = 'OPEN' GROUP BY 1 ORDER BY N DESC LIMIT 8`),
  ]);
  const r = k[0];
  return {
    kpis: { txns: Number(r.TXNS), fraudBps: Number(r.BPS), fraudLoss: Number(r.LOSS), alerts: Number(r.ALERTS), open: Number(r.OPEN_ALERTS),
      precision: Number(r.PREC), worked: Number(r.WORKED) },
    days, hex, cities, reasons, ms: Date.now() - t0, source: 'live',
  };
}

export async function getAlerts(status: string): Promise<AlertQueue> {
  const t0 = Date.now();
  const rows = await query<Alert>(`SELECT ${ALERT_COLS} FROM ALERTS_ENRICHED a WHERE a.STATUS = ?
      ORDER BY DECODE(a.PRIORITY, 'HIGH', 0, 'MEDIUM', 1, 2), a.AMOUNT DESC, a.CREATED_TS DESC LIMIT 200`, [status]);
  const total = await query<{ N: number }>('SELECT COUNT(*) AS N FROM ALERTS WHERE STATUS = ?', [status]);
  return { rows: rows.map(fixAlert), total: Number(total[0].N), ms: Date.now() - t0, source: 'live' };
}

export async function getCase(alertId: string): Promise<CaseDetail> {
  const t0 = Date.now();
  const a = await query<CaseDetail['alert']>(`SELECT ${ALERT_COLS}, a.DEVICE_ID, a.IP_ID, a.LAT, a.LON, a.MERCHANT_CATEGORY
    FROM ALERTS_ENRICHED a WHERE a.ALERT_ID = ?`, [alertId]);
  if (!a[0]) throw new Error(`Alert ${alertId} not found`);
  const alert = fixAlert(a[0]);
  const [timeline, graph, actions] = await Promise.all([
    query<TimelineItem>(`SELECT * FROM (
        SELECT TO_VARCHAR(t.TS, 'YYYY-MM-DD HH24:MI:SS') AS TS, 'TXN' AS KIND, t.TXN_ID AS ID,
          COALESCE(m.MERCHANT_NAME, 'P2P to ' || t.COUNTERPARTY_ACCOUNT_ID) || COALESCE(' · ' || m.CITY, '') AS LABEL,
          t.AMOUNT::FLOAT AS AMOUNT, t.CHANNEL, t.LAT, t.LON, t.DEVICE_ID,
          EXISTS (SELECT 1 FROM ALERTS x WHERE x.TXN_ID = t.TXN_ID) AS FLAGGED
        FROM PAYMENT_FRAUD_WB.RAW.TRANSACTIONS t LEFT JOIN PAYMENT_FRAUD_WB.RAW.MERCHANTS m ON m.MERCHANT_ID = t.MERCHANT_ID
        WHERE t.ACCOUNT_ID = ? AND t.TS BETWEEN DATEADD(HOUR, -48, ?::TIMESTAMP_NTZ) AND DATEADD(HOUR, 12, ?::TIMESTAMP_NTZ)
        UNION ALL
        SELECT TO_VARCHAR(e.TS, 'YYYY-MM-DD HH24:MI:SS'), 'EVENT', e.EVENT_ID, REPLACE(e.EVENT_TYPE, '_', ' ') || ' · ' || e.DETAIL,
          NULL, NULL, NULL, NULL, e.DEVICE_ID, FALSE
        FROM PAYMENT_FRAUD_WB.RAW.ACCOUNT_EVENTS e
        WHERE e.ACCOUNT_ID = ? AND e.TS BETWEEN DATEADD(HOUR, -48, ?::TIMESTAMP_NTZ) AND DATEADD(HOUR, 12, ?::TIMESTAMP_NTZ)
      ) ORDER BY TS DESC LIMIT 60`,
      [alert.ACCOUNT_ID, alert.CREATED_TS, alert.CREATED_TS, alert.ACCOUNT_ID, alert.CREATED_TS, alert.CREATED_TS]),
    // Link graph: walk account -> device/IP -> account with a recursive CTE, two account hops out.
    // Devices or IPs used by more than 50 accounts (shared Wi-Fi, for example) are not followed.
    query<{ SRC: string; DST: string; DST_TYPE: string; DEPTH: number }>(`WITH RECURSIVE
      e AS (SELECT l.ACCOUNT_ID, l.NODE_TYPE, l.NODE_ID FROM LINK_EDGES l
            JOIN (SELECT NODE_ID FROM LINK_EDGES GROUP BY NODE_ID HAVING COUNT(DISTINCT ACCOUNT_ID) <= 50) ok USING (NODE_ID)),
      walk (SRC, DST, DST_TYPE, DEPTH) AS (
        SELECT ?::STRING, ?::STRING, 'ACCOUNT', 0
        UNION ALL
        SELECT w.DST, IFF(w.DST_TYPE = 'ACCOUNT', e.NODE_ID, e.ACCOUNT_ID), IFF(w.DST_TYPE = 'ACCOUNT', e.NODE_TYPE, 'ACCOUNT'), w.DEPTH + 1
        FROM walk w JOIN e ON (w.DST_TYPE = 'ACCOUNT' AND e.ACCOUNT_ID = w.DST) OR (w.DST_TYPE <> 'ACCOUNT' AND e.NODE_ID = w.DST)
        WHERE w.DEPTH < 4)
      SELECT SRC, DST, DST_TYPE, MIN(DEPTH) AS DEPTH FROM walk WHERE DEPTH > 0 AND SRC <> DST GROUP BY 1, 2, 3 ORDER BY DEPTH, DST LIMIT 120`,
      [alert.ACCOUNT_ID, alert.ACCOUNT_ID]),
    query<CaseDetail['actions'][number]>(`SELECT ACTION, NOTE, TO_VARCHAR(ACTED_AT, 'YYYY-MM-DD HH24:MI') AS ACTED_AT FROM ALERT_ACTIONS
      WHERE ALERT_ID = ? ORDER BY ACTED_AT DESC`, [alertId]),
  ]);
  const nodes = new Map<string, GraphNode>([[alert.ACCOUNT_ID, { id: alert.ACCOUNT_ID, type: 'ACCOUNT', depth: 0, label: alert.ACCOUNT_ID }]]);
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const g of graph) {
    if (!nodes.has(g.DST)) nodes.set(g.DST, { id: g.DST, type: g.DST_TYPE as GraphNode['type'], depth: Number(g.DEPTH), label: g.DST });
    const key = [g.SRC, g.DST].sort().join('|');
    if (!seen.has(key)) { seen.add(key); edges.push({ a: g.SRC, b: g.DST }); }
  }
  const travel = await getTravel(alertId);
  return { alert, timeline: timeline.map((t) => ({ ...t, FLAGGED: Boolean(t.FLAGGED) })), nodes: [...nodes.values()], edges, actions, travel, ms: Date.now() - t0, source: 'live' };
}

const ACTIONS: Record<string, string> = { CONFIRM_FRAUD: 'CONFIRMED_FRAUD', FALSE_POSITIVE: 'FALSE_POSITIVE', ESCALATE: 'OPEN' };
export const isAction = (a: unknown): a is keyof typeof ACTIONS => typeof a === 'string' && a in ACTIONS;

/** Records the analyst's decision; confirm and false positive close the alert, escalate keeps it open. */
export async function recordAction(alertId: string, action: string, note: string) {
  await query(`INSERT INTO ALERT_ACTIONS SELECT ?, ?, ?, CURRENT_USER(), CURRENT_TIMESTAMP()::TIMESTAMP_NTZ`, [alertId, action, note]);
  await query('UPDATE ALERTS SET STATUS = ? WHERE ALERT_ID = ?', [ACTIONS[action], alertId]);
  return { ok: true };
}

export async function getModel(): Promise<ModelInfo> {
  const t0 = Date.now();
  const [ev, curve, versions] = await Promise.all([
    query<{ P: string }>("SELECT TO_JSON(PAYLOAD) AS P FROM PAYMENT_FRAUD_WB.ML.MODEL_EVAL WHERE MODEL_VERSION = 'V1'"),
    query<ModelInfo['curve'][number]>(`SELECT THRESHOLD::FLOAT AS THRESHOLD, ALERTS, TRUE_POS, PRECISION::FLOAT AS PRECISION, RECALL::FLOAT AS RECALL,
      ALERTS_PER_DAY::FLOAT AS ALERTS_PER_DAY FROM PAYMENT_FRAUD_WB.ML.PR_CURVE ORDER BY THRESHOLD`),
    query<Record<string, string>>('SHOW VERSIONS IN MODEL PAYMENT_FRAUD_WB.ML.FRAUD_XGB'),
  ]);
  const v = versions[0] ?? {};
  return { eval: JSON.parse(ev[0].P), curve, registry: { name: 'ML.FRAUD_XGB', version: String(v.name ?? 'V1'), created: String(v.created_on ?? '').slice(0, 10) },
    ms: Date.now() - t0, source: 'live' };
}

/** AI case summary with AI_COMPLETE over the case facts the analyst sees. */
export async function getSummary(alertId: string): Promise<AiText> {
  const c = await getCase(alertId);
  const facts = {
    alert: { id: c.alert.ALERT_ID, score: c.alert.SCORE, priority: c.alert.PRIORITY, channel: c.alert.CHANNEL, amount: c.alert.AMOUNT,
      merchant: c.alert.MERCHANT_NAME, rules: c.alert.RULES, reasons: c.alert.REASON_CODES, created: c.alert.CREATED_TS },
    timeline: c.timeline.slice(0, 25).map((t) => ({ ts: t.TS, kind: t.KIND, what: t.LABEL, amount: t.AMOUNT, device: t.DEVICE_ID, flagged: t.FLAGGED })),
    linkGraph: { accounts: c.nodes.filter((n) => n.type === 'ACCOUNT').length, devices: c.nodes.filter((n) => n.type === 'DEVICE').length,
      ips: c.nodes.filter((n) => n.type === 'IP').length, linkedAccountIds: c.nodes.filter((n) => n.type === 'ACCOUNT').slice(0, 15).map((n) => n.id) },
  };
  const prompt = `You are a payment fraud investigator writing a case note for a colleague. Using only the JSON facts below, write:
**Summary** (3 sentences: what happened, in time order, with amounts),
**Signals** (3-5 bullets naming the evidence: reason codes, devices, links, distances),
**Recommended next step** (1-2 sentences, a concrete action such as blocking a card, contacting the customer, or reviewing linked accounts).
Do not invent facts. Synthetic data. FACTS: ${JSON.stringify(facts)}`;
  const t0 = Date.now();
  const r = await query<{ T: string }>('SELECT AI_COMPLETE(?, ?) AS T', [COMPLETE_MODEL, prompt]);
  return { text: r[0].T, latencyMs: Date.now() - t0, model: COMPLETE_MODEL, source: 'live' };
}

/** Ask: sends the question to the Cortex Agent over ALERTS_SV and returns its final answer. */
export async function askAgent(question: string): Promise<AiText> {
  const payload = JSON.stringify({ messages: [{ role: 'user', content: [{ type: 'text', text: question }] }] });
  const t0 = Date.now();
  const rows = await query<{ C: string }>(
    "SELECT TRY_PARSE_JSON(SNOWFLAKE.CORTEX.DATA_AGENT_RUN('PAYMENT_FRAUD_WB.APP.FRAUD_AGENT', ?, TRUE)):content::STRING AS C", [payload]);
  type Block = { type: string; text?: string; table?: { title?: string; result_set?: { data: string[][]; resultSetMetaData: { rowType: { name: string }[] } } };
    tool_result?: { content?: { json?: { sql?: string } }[] } };
  const blocks: Block[] = JSON.parse(rows[0]?.C ?? '[]');
  // The answer is the text and tables after the agent's last tool call; earlier text is planning.
  const lastTool = blocks.reduce((m, b, i) => (b.type === 'tool_use' || b.type === 'tool_result' ? i : m), -1);
  const parts: string[] = [];
  for (const b of blocks.slice(lastTool + 1)) {
    if (b.type === 'text' && b.text) parts.push(b.text.trim());
    if (b.type === 'table' && b.table?.result_set) {
      const cols = b.table.result_set.resultSetMetaData.rowType.map((c) => c.name);
      parts.push([`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...b.table.result_set.data.slice(0, 20).map((r) => `| ${r.join(' | ')} |`)].join('\n'));
    }
  }
  const sql = blocks.flatMap((b) => b.tool_result?.content ?? []).map((c) => c.json?.sql).filter(Boolean).pop();
  const text = parts.filter(Boolean).join('\n\n');
  if (!text) throw new Error('The Cortex Agent returned no text. Check that sql/setup.sql ran.');
  return { text, sql, latencyMs: Date.now() - t0, model: 'Cortex Agent (orchestration: auto)', source: 'live' };
}

/** The model's input columns, in training order (sql/setup.sql TRAIN_MODEL). */
export const FEATURE_COLS = ['AMOUNT', 'IS_CNP', 'IS_P2P', 'HOUR_OF_DAY', 'CARD_TXN_1H', 'ACCT_AMT_24H', 'AMT_TO_AVG', 'NEW_DEVICE',
  'DEVICE_ACCOUNTS', 'MERCH_SMALL_1H', 'KM_FROM_PREV', 'KMH_FROM_PREV', 'FIRST_TIME_PAYEE', 'PW_RESET_24H'] as const;

/** The alert's feature row, read from the Feature Store view (a Dynamic Table). */
export async function getFeatures(alertId: string): Promise<AlertFeatures> {
  const t0 = Date.now();
  const r = await query<Record<string, number>>(`SELECT ${FEATURE_COLS.map((c) => `f.${c}::FLOAT AS ${c}`).join(', ')}
    FROM PAYMENT_FRAUD_WB.FEATURES."TXN_VELOCITY$1" f JOIN ALERTS a ON a.TXN_ID = f.TXN_ID WHERE a.ALERT_ID = ?`, [alertId]);
  if (!r[0]) throw new Error(`No feature row for ${alertId}`);
  return { features: Object.fromEntries(FEATURE_COLS.map((c) => [c, Number(r[0][c])])), view: 'FEATURES.TXN_VELOCITY$1', ms: Date.now() - t0, source: 'live' };
}

/** Re-scores the alert's feature row with the registered model version's predict_proba, in the warehouse. */
export async function rescore(alertId: string): Promise<Rescore> {
  const t0 = Date.now();
  const r = await query<{ P: number; STORED: number }>(`WITH m AS MODEL PAYMENT_FRAUD_WB.ML.FRAUD_XGB VERSION V1
    SELECT m!PREDICT_PROBA(${FEATURE_COLS.map((c) => `f.${c}`).join(', ')}):output_feature_1::FLOAT AS P, a.SCORE::FLOAT AS STORED
    FROM PAYMENT_FRAUD_WB.FEATURES."TXN_VELOCITY$1" f JOIN ALERTS a ON a.TXN_ID = f.TXN_ID WHERE a.ALERT_ID = ?`, [alertId]);
  if (!r[0]) throw new Error(`No feature row for ${alertId}`);
  return { score: Number(r[0].P), stored: Number(r[0].STORED), model: 'ML.FRAUD_XGB', version: 'V1', ms: Date.now() - t0, source: 'live' };
}

/** Distance and implied speed between consecutive in-store swipes on the alert's card, with ST_DISTANCE. */
export async function getTravel(alertId: string): Promise<TravelHop[]> {
  return query<TravelHop>(`WITH a AS (SELECT CARD_ID, CREATED_TS FROM ALERTS WHERE ALERT_ID = ?),
    s AS (SELECT t.TXN_ID, t.TS, t.LAT, t.LON, LAG(t.TS) OVER (ORDER BY t.TS) AS PTS,
            LAG(t.LAT) OVER (ORDER BY t.TS) AS PLAT, LAG(t.LON) OVER (ORDER BY t.TS) AS PLON
          FROM PAYMENT_FRAUD_WB.RAW.TRANSACTIONS t, a
          WHERE t.CARD_ID = a.CARD_ID AND t.CHANNEL = 'CARD_PRESENT'
            AND t.TS BETWEEN DATEADD(HOUR, -48, a.CREATED_TS) AND DATEADD(HOUR, 12, a.CREATED_TS))
    SELECT TXN_ID, TO_VARCHAR(TS, 'YYYY-MM-DD HH24:MI:SS') AS TS, DATEDIFF(MINUTE, PTS, TS) AS MINUTES,
      ROUND(ST_DISTANCE(ST_MAKEPOINT(LON, LAT), ST_MAKEPOINT(PLON, PLAT)) / 1000, 1)::FLOAT AS KM,
      ROUND(ST_DISTANCE(ST_MAKEPOINT(LON, LAT), ST_MAKEPOINT(PLON, PLAT)) / 1000 / GREATEST(DATEDIFF(SECOND, PTS, TS), 60) * 3600)::FLOAT AS KMH
    FROM s WHERE PTS IS NOT NULL ORDER BY TS DESC LIMIT 4`, [alertId]);
}
