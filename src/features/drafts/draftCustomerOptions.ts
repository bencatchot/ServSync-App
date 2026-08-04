import {
  customerConnectionStatusPresentation,
  type CustomerConnectionStatus,
} from '../status/statusPresentation';

export type DraftCustomerStatus = Extract<
  CustomerConnectionStatus,
  'connected' | 'not_connected' | 'invitation_pending'
>;

export type DraftCustomerSubjectType = 'connected' | 'local';

export type DraftCustomerPropertyOption = {
  id: string;
  label: string;
};

export type DraftCustomerOption = {
  key: `connected:${string}` | `local:${string}`;
  subjectType: DraftCustomerSubjectType;
  customerId: string;
  label: string;
  status: DraftCustomerStatus;
  statusLabel: string;
  properties: DraftCustomerPropertyOption[];
  savedFallback?: boolean;
};

export type ConnectedDraftCustomerCandidate = {
  contractorId: string;
  customerId: string;
  label: string;
  connectionStatus: string;
  properties: DraftCustomerPropertyOption[];
};

export type LocalDraftCustomerCandidate = {
  contractorId: string;
  customerId: string;
  label: string;
  claimed: boolean;
  invitationPending: boolean;
  properties: DraftCustomerPropertyOption[];
};

export type DraftCustomerSubjectFields = {
  subject_type: DraftCustomerSubjectType;
  homeowner_user_id: string;
  home_id: string;
  local_contact_id: string;
  local_home_id: string;
  service_request_id: string;
};

export function draftCustomerOptionKey(subjectType: DraftCustomerSubjectType, customerId: string) {
  return `${subjectType}:${customerId}` as DraftCustomerOption['key'];
}

export function buildDraftCustomerOptions(input: {
  contractorId: string;
  connectedCustomers: ConnectedDraftCustomerCandidate[];
  localCustomers: LocalDraftCustomerCandidate[];
}): DraftCustomerOption[] {
  const connected = input.connectedCustomers
    .filter(customer => customer.contractorId === input.contractorId && customer.connectionStatus === 'active')
    .map(customer => ({
      key: draftCustomerOptionKey('connected', customer.customerId),
      subjectType: 'connected' as const,
      customerId: customer.customerId,
      label: customer.label,
      status: 'connected' as const,
      statusLabel: customerConnectionStatusPresentation('connected').label,
      properties: customer.properties,
    }));
  const local = input.localCustomers
    .filter(customer => customer.contractorId === input.contractorId && !customer.claimed)
    .map(customer => {
      const status: DraftCustomerStatus = customer.invitationPending ? 'invitation_pending' : 'not_connected';
      return {
        key: draftCustomerOptionKey('local', customer.customerId),
        subjectType: 'local' as const,
        customerId: customer.customerId,
        label: customer.label,
        status,
        statusLabel: customerConnectionStatusPresentation(status).label,
        properties: customer.properties,
      };
    });

  return [...connected, ...local].sort((left, right) => (
    left.label.localeCompare(right.label) || left.key.localeCompare(right.key)
  ));
}

export function draftCustomerOptionLabel(option: DraftCustomerOption) {
  const propertyContext = option.properties.length === 1
    ? option.properties[0].label
    : option.properties.length > 1
      ? `${option.properties.length} properties`
      : 'No property';
  return `${option.label} — ${option.statusLabel} · ${propertyContext}`;
}

export function selectedDraftCustomerKey(draft: DraftCustomerSubjectFields) {
  const customerId = draft.subject_type === 'connected' ? draft.homeowner_user_id : draft.local_contact_id;
  return customerId ? draftCustomerOptionKey(draft.subject_type, customerId) : '';
}

export function defaultDraftPropertyId(properties: DraftCustomerPropertyOption[], explicitPropertyId = '') {
  if (explicitPropertyId && properties.some(property => property.id === explicitPropertyId)) return explicitPropertyId;
  return properties.length === 1 ? properties[0].id : '';
}

export function applyDraftCustomerSelection<T extends DraftCustomerSubjectFields>(
  draft: T,
  option: DraftCustomerOption,
  explicitPropertyId = '',
): T {
  const propertyId = defaultDraftPropertyId(option.properties, explicitPropertyId);
  return {
    ...draft,
    subject_type: option.subjectType,
    homeowner_user_id: option.subjectType === 'connected' ? option.customerId : '',
    home_id: option.subjectType === 'connected' ? propertyId : '',
    local_contact_id: option.subjectType === 'local' ? option.customerId : '',
    local_home_id: option.subjectType === 'local' ? propertyId : '',
    service_request_id: '',
  };
}

export function clearDraftCustomerSelection<T extends DraftCustomerSubjectFields>(draft: T): T {
  return {
    ...draft,
    homeowner_user_id: '',
    home_id: '',
    local_contact_id: '',
    local_home_id: '',
    service_request_id: '',
  };
}

export function draftCustomerOptionsWithSavedSelection(
  options: DraftCustomerOption[],
  draft: DraftCustomerSubjectFields,
  persisted: boolean,
  fallbackLabels: { customer: string; property: string },
) {
  const eligibleOptions = persisted
    ? options.filter(option => option.subjectType === draft.subject_type)
    : options;
  const customerId = draft.subject_type === 'connected' ? draft.homeowner_user_id : draft.local_contact_id;
  const propertyId = draft.subject_type === 'connected' ? draft.home_id : draft.local_home_id;
  if (!customerId) return eligibleOptions;

  const key = draftCustomerOptionKey(draft.subject_type, customerId);
  const savedProperty = propertyId ? { id: propertyId, label: fallbackLabels.property } : null;
  const existing = eligibleOptions.find(option => option.key === key);
  if (existing) {
    if (!savedProperty || existing.properties.some(property => property.id === savedProperty.id)) return eligibleOptions;
    return eligibleOptions.map(option => option.key === key
      ? { ...option, properties: [...option.properties, savedProperty] }
      : option);
  }

  const status: DraftCustomerStatus = draft.subject_type === 'connected' ? 'connected' : 'not_connected';
  return [
    ...eligibleOptions,
    {
      key,
      subjectType: draft.subject_type,
      customerId,
      label: fallbackLabels.customer,
      status,
      statusLabel: customerConnectionStatusPresentation(status).label,
      properties: savedProperty ? [savedProperty] : [],
      savedFallback: true,
    },
  ];
}
