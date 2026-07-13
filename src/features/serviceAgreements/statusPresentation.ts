import type { ServiceAgreementOfferStatus, ServiceAgreementStatus, ServiceAgreementTemplateStatus } from '../../types';
import { readableStatusLabel, type StatusPresentation } from '../status/statusPresentation';

export function serviceAgreementTemplateStatusPresentation(status: ServiceAgreementTemplateStatus | string): StatusPresentation {
  const presentations: Partial<Record<ServiceAgreementTemplateStatus, StatusPresentation>> = {
    active: { label: 'Template Active', tone: 'success' },
    archived: { label: 'Template Archived', tone: 'muted' },
  };
  return presentations[status as ServiceAgreementTemplateStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function serviceAgreementOfferStatusPresentation(status: ServiceAgreementOfferStatus | string): StatusPresentation {
  const presentations: Partial<Record<ServiceAgreementOfferStatus, StatusPresentation>> = {
    draft: { label: 'Draft', tone: 'neutral' },
    sent: { label: 'Sent', tone: 'info' },
    accepted: { label: 'Accepted', tone: 'success' },
    declined: { label: 'Declined', tone: 'danger' },
    expired: { label: 'Expired', tone: 'warning' },
    withdrawn: { label: 'Withdrawn', tone: 'muted' },
  };
  return presentations[status as ServiceAgreementOfferStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function serviceAgreementStatusPresentation(status: ServiceAgreementStatus | string): StatusPresentation {
  const presentations: Partial<Record<ServiceAgreementStatus, StatusPresentation>> = {
    active: { label: 'Active', tone: 'success' },
    cancelled: { label: 'Cancelled', tone: 'danger' },
    expired: { label: 'Expired', tone: 'warning' },
  };
  return presentations[status as ServiceAgreementStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}
