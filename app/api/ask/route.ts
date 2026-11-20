import { askAgent } from '@/lib/live-data';
import { bad, live } from '../_shared';
export async function POST(req: Request) {
  const { question } = await req.json().catch(() => ({}));
  if (typeof question !== 'string' || !question.trim() || question.length > 1000) return bad('A question is required');
  return live(() => askAgent(question.trim()));
}
