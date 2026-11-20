import type { NextRequest } from 'next/server';
import { getSummary } from '@/lib/live-data';
import { ALERT_ID, bad, live } from '../_shared';
export function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('alert') ?? '';
  if (!ALERT_ID.test(id)) return bad('Unknown alert');
  return live(() => getSummary(id));
}
