import { CalendarCheck } from 'lucide-react';
import { LeaveModulePlaceholder } from '@/components/leave/LeaveModulePlaceholder';

export const MyLeaves = () => (
  <LeaveModulePlaceholder
    title="My Leaves"
    subtitle="Every leave request you have raised"
    icon={<CalendarCheck className="h-5 w-5" />}
    planned="Your leave history, current status and balance will be listed here."
  />
);

export default MyLeaves;
