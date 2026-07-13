import type { ReviewModerationStatus } from '../../types';
import { readableStatusLabel, type StatusPresentation } from '../status/statusPresentation';

export function reviewModerationStatusPresentation(status?: ReviewModerationStatus | string | null): StatusPresentation {
  const presentations: Partial<Record<ReviewModerationStatus, StatusPresentation>> = {
    pending: { label: 'Pending', tone: 'info' },
    approved: { label: 'Approved', tone: 'success' },
    hidden: { label: 'Hidden', tone: 'muted' },
    rejected: { label: 'Rejected', tone: 'danger' },
  };
  return presentations[status as ReviewModerationStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}
