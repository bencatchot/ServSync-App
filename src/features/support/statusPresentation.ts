import type { SupportInquiryStatus } from '../../types';
import { readableStatusLabel, type StatusPresentation } from '../status/statusPresentation';

export function supportStatusPresentation(
  status: SupportInquiryStatus | string,
  perspective: 'user' | 'admin' = 'user',
): StatusPresentation {
  const presentations: Partial<Record<SupportInquiryStatus, StatusPresentation>> = {
    new: { label: 'New', tone: 'info' },
    in_progress: { label: 'In Progress', tone: 'warning' },
    waiting_on_user: {
      label: perspective === 'user' ? 'Waiting on You' : 'Waiting on User',
      tone: 'violet',
    },
    waiting_on_admin: { label: 'Waiting on ServSync', tone: 'info' },
    resolved: { label: 'Resolved', tone: 'success' },
    closed: { label: 'Closed', tone: 'muted' },
  };
  return presentations[status as SupportInquiryStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}
