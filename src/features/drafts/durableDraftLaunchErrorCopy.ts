import { DurableDraftError, normalizeDurableDraftError } from './durableDraftLaunchApi';

export type DurableDraftLaunchFailureKind = 'fixable' | 'denied' | 'reconcile' | 'ambiguous' | 'storage' | 'unknown';

export type DurableDraftLaunchFailure = {
  kind: DurableDraftLaunchFailureKind;
  message: string;
};

const FIXABLE_CODES = new Set([
  'DRAFT_INVALID',
  'INTENDED_OUTPUT_REQUIRED',
  'INTENDED_OUTPUT_MISMATCH',
  'UNSUPPORTED_OUTPUT',
  'CUSTOMER_INVALID',
  'PROPERTY_INVALID',
  'PROPERTY_NOT_SHARED',
  'SERVICE_REQUEST_INVALID',
  'JOB_SERVICE_REQUEST_CONFLICT',
  'LAUNCH_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
]);

export function classifyDurableDraftLaunchFailure(error: unknown): DurableDraftLaunchFailure {
  const normalized = error instanceof DurableDraftError ? error : normalizeDurableDraftError(error, 'launch');
  const code = normalized.applicationCode;
  if (code === 'DRAFT_PERMISSION_DENIED') {
    return { kind: 'denied', message: 'Your current access does not allow creating this output.' };
  }
  if (code === 'DRAFT_NOT_FOUND' || code === 'DRAFT_NOT_ACTIVE' || code === 'DRAFT_ALREADY_CONSUMED') {
    return { kind: 'reconcile', message: 'This Draft changed while you were working. Refresh its current status.' };
  }
  if (normalized.postgresCode === '22P02') {
    return { kind: 'fixable', message: 'ServSync could not validate this Draft identifier. Refresh before trying again.' };
  }
  if (code === 'DRAFT_RESPONSE_INVALID' || normalized.kind === 'transport' || normalized.kind === 'unknown') {
    return { kind: 'ambiguous', message: 'ServSync could not confirm whether the output was created.' };
  }
  if (code && FIXABLE_CODES.has(code)) {
    const messages: Record<string, string> = {
      DRAFT_INVALID: 'Review the Draft details and work items before trying again.',
      INTENDED_OUTPUT_REQUIRED: 'Choose Estimate or Job before creating work from this Draft.',
      INTENDED_OUTPUT_MISMATCH: 'The saved Draft intent changed. Review it before trying again.',
      UNSUPPORTED_OUTPUT: 'Choose Estimate or Job before trying again.',
      CUSTOMER_INVALID: 'Choose an available customer before trying again.',
      PROPERTY_INVALID: 'Choose an available property before trying again.',
      PROPERTY_NOT_SHARED: 'That property is no longer shared for this work.',
      SERVICE_REQUEST_INVALID: 'The selected service request is no longer available.',
      JOB_SERVICE_REQUEST_CONFLICT: 'A current Job already exists for this service request.',
      LAUNCH_CONFLICT: 'A current Job already exists for this service request.',
      IDEMPOTENCY_CONFLICT: 'This retry key cannot be used for this Draft. Refresh before trying again.',
    };
    return { kind: 'fixable', message: messages[code] ?? 'Review the Draft and try again.' };
  }
  return { kind: 'ambiguous', message: 'ServSync could not confirm whether the output was created.' };
}

export function durableDraftStorageUnavailableCopy(outputType: 'estimate' | 'job') {
  return `ServSync cannot safely create this ${outputType === 'estimate' ? 'Estimate' : 'Job'} because retry protection is unavailable in this browser.`;
}
