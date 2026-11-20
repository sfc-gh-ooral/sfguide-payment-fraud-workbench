import { NextResponse } from 'next/server';
import { isSnowflakeConfigured } from '@/lib/snowflake';

/** Runs a live handler and reports errors instead of falling back to sample data. */
export async function live<T>(fn: () => Promise<T>) {
  if (!isSnowflakeConfigured()) return NextResponse.json({ error: 'No Snowflake connection is configured on this server.' }, { status: 503 });
  try { return NextResponse.json(await fn()); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
export const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
export const ALERT_ID = /^AL[0-9]{7,8}$/;
