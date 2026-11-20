import { getOverview } from '@/lib/live-data';
import { live } from '../_shared';
export const GET = () => live(getOverview);
