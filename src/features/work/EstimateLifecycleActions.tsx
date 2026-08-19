import { ClipboardCheck, Send } from 'lucide-react';

import type { Estimate } from '../../types';
import type { LifecycleNextStep } from './lifecyclePrimaryAction';

type ActionTone = 'primary' | 'secondary';

export function EstimateLifecycleActions({
  estimate,
  nextStep,
  canManageEstimate,
  canCreateJob,
  hasLinkedJob,
  converting,
  sending,
  classForTone,
  onCreateJob,
  onOpenJob,
  onEdit,
  onSend,
}: {
  estimate: Estimate;
  nextStep: LifecycleNextStep;
  canManageEstimate: boolean;
  canCreateJob: boolean;
  hasLinkedJob: boolean;
  converting: boolean;
  sending: boolean;
  classForTone: (tone: ActionTone) => string;
  onCreateJob: () => void;
  onOpenJob: () => void;
  onEdit: () => void;
  onSend: () => void;
}) {
  if (estimate.status === 'accepted') {
    if (hasLinkedJob) {
      return (
        <button type="button" onClick={onOpenJob} disabled={converting} className={classForTone('primary')} data-lifecycle-primary-action="true">
          <ClipboardCheck size={15} />
          View Job
        </button>
      );
    }
    if (!canCreateJob) return null;
    return (
      <button
        type="button"
        onClick={onCreateJob}
        disabled={converting}
        data-testid="contractor-create-job-from-accepted-estimate"
        aria-label={`Create job from accepted estimate ${estimate.title}`}
        className={classForTone('primary')}
        data-lifecycle-primary-action="true"
      >
        <ClipboardCheck size={15} />
        {converting ? 'Creating...' : 'Create Job'}
      </button>
    );
  }

  if (estimate.status !== 'draft' || !canManageEstimate) return null;
  return (
    <>
      <button
        type="button"
        onClick={onEdit}
        className={classForTone(nextStep.id === 'edit_estimate' ? 'primary' : 'secondary')}
        data-lifecycle-primary-action={nextStep.id === 'edit_estimate' ? 'true' : undefined}
      >
        Edit draft
      </button>
      {estimate.homeowner_user_id && (
        <button
          type="button"
          onClick={onSend}
          disabled={sending}
          data-testid="contractor-send-estimate"
          aria-label={`Send estimate ${estimate.title} to homeowner`}
          className={classForTone('primary')}
          data-lifecycle-primary-action="true"
        >
          <Send size={15} />
          {sending ? 'Sending...' : 'Send to homeowner'}
        </button>
      )}
    </>
  );
}
