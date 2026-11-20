import { isAction, recordAction } from '@/lib/live-data';
import { ALERT_ID, bad, live } from '../_shared';
export async function POST(req: Request) {
  const { alert, action, note } = await req.json().catch(() => ({}));
  if (typeof alert !== 'string' || !ALERT_ID.test(alert)) return bad('Unknown alert');
  if (!isAction(action)) return bad('Unknown action');
  return live(() => recordAction(alert, action, typeof note === 'string' ? note.slice(0, 500) : ''));
}
