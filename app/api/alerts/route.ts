import type { NextRequest } from 'next/server';
import { getAlerts } from '@/lib/live-data';
import { bad, live } from '../_shared';
const STATUSES = ['OPEN', 'CONFIRMED_FRAUD', 'FALSE_POSITIVE'];
export function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get('status') ?? 'OPEN';
  if (!STATUSES.includes(s)) return bad('Unknown status');
  return live(() => getAlerts(s));
}
