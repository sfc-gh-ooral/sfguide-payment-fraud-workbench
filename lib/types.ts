// Shapes shared by the API routes, the sample bundle, and the pages.
export type Source = 'live' | 'captured';

export interface DayKpi { DAY: string; TXNS: number; FRAUD_TXNS: number; FRAUD_BPS: number; FRAUD_LOSS: number; ALERTS: number }
export interface HexCell { H3_CELL: string; LAT: number; LON: number; FRAUD_TXNS: number; FRAUD_LOSS: number }
export interface City { CITY: string; LAT: number; LON: number }
export interface Overview {
  kpis: { txns: number; fraudBps: number; fraudLoss: number; alerts: number; open: number; precision: number; worked: number };
  days: DayKpi[]; hex: HexCell[]; cities: City[];
  reasons: { REASON: string; N: number }[];
  ms: number; source: Source;
}

export interface Alert {
  ALERT_ID: string; TXN_ID: string; CREATED_TS: string; ACCOUNT_ID: string; CUSTOMER_NAME: string; CHANNEL: string;
  MERCHANT_NAME: string | null; AMOUNT: number; SCORE: number; PRIORITY: 'HIGH' | 'MEDIUM' | 'LOW';
  RULES: string[]; REASON_CODES: string[]; SLA_MIN_LEFT: number; STATUS: string; LAST_ACTION: string | null; LINKED_ACCOUNTS: number;
}
export interface AlertQueue { rows: Alert[]; total: number; ms: number; source: Source }

export interface TimelineItem { TS: string; KIND: 'TXN' | 'EVENT'; ID: string; LABEL: string; AMOUNT: number | null; CHANNEL: string | null;
  LAT: number | null; LON: number | null; DEVICE_ID: string | null; FLAGGED: boolean }
export interface GraphNode { id: string; type: 'ACCOUNT' | 'DEVICE' | 'IP'; depth: number; label: string }
export interface GraphEdge { a: string; b: string }
export interface CaseDetail {
  alert: Alert & { DEVICE_ID: string | null; IP_ID: string | null; LAT: number | null; LON: number | null; MERCHANT_CATEGORY: string | null };
  timeline: TimelineItem[]; nodes: GraphNode[]; edges: GraphEdge[];
  actions: { ACTION: string; NOTE: string | null; ACTED_AT: string }[];
  travel: TravelHop[];
  ms: number; source: Source;
}
export interface TravelHop { TXN_ID: string; TS: string; MINUTES: number; KM: number; KMH: number }
export interface AlertFeatures { features: Record<string, number>; view: string; ms: number; source: Source }
export interface Rescore { score: number; stored: number; model: string; version: string; ms: number; source: Source | 'sample' }

export interface PrPoint { THRESHOLD: number; ALERTS: number; TRUE_POS: number; PRECISION: number; RECALL: number; ALERTS_PER_DAY: number }
export interface ModelInfo {
  eval: { version: string; algorithm: string; trainingWindow: string; testWindow: string; features: string[]; trainRows: number;
    trainFraud: number; testRows: number; testFraud: number; auc: number; avgPrecision: number; importance: { feature: string; importance: number }[]; featureView: string };
  curve: PrPoint[]; registry: { name: string; version: string; created: string }; ms: number; source: Source;
}

export interface AiText { text: string; latencyMs: number; model: string; source: 'live' | 'sample'; sql?: string }
