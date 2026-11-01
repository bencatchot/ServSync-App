import type { ServiceRequestSummary } from '../../types';

// Jobs leave the intake queues, but explicit Calendar/customer links must still
// open their request so the contractor can use the existing scheduling controls.
export function contractorRequestQueueRecords<T extends { id: string }>(
  requests: T[],
  requestIdsWithJobs: ReadonlySet<string>,
  focusedRequestId: string | null,
): T[] {
  return requests.filter(request => !requestIdsWithJobs.has(request.id) || request.id === focusedRequestId);
}

export function sortContractorRequestRecords(
  requests: ServiceRequestSummary[],
  needsAttention: (request: ServiceRequestSummary) => boolean,
): ServiceRequestSummary[] {
  return [...requests].sort((a, b) => {
    const attentionDelta = Number(needsAttention(b)) - Number(needsAttention(a));
    if (attentionDelta) return attentionDelta;
    const urgentDelta = Number(b.urgency === 'urgent') - Number(a.urgency === 'urgent');
    if (urgentDelta) return urgentDelta;
    const appointmentDelta = Number(Boolean(b.appointment)) - Number(Boolean(a.appointment));
    if (appointmentDelta) return appointmentDelta;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}
