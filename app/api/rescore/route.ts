import { rescore } from '@/lib/live-data';
import { ALERT_ID, bad, live } from '../_shared';
export async function POST(req: Request) {
  const { alert } = await req.json().catch(() => ({}));
  if (typeof alert !== 'string' || !ALERT_ID.test(alert)) return bad('Unknown alert');
  return live(() => rescore(alert));
}
