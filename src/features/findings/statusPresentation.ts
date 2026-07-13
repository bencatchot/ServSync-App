import type { FindingStatus } from '../../types';
import {
  readableStatusLabel,
  statusToneClass,
  type StatusPresentation,
  type StatusTone,
} from '../status/statusPresentation';

export interface FindingStatusPresentation extends StatusPresentation {
  value: FindingStatus | string;
  borderColor: string;
  dotClass: string;
}

export const FINDING_STATUS_ORDER: FindingStatus[] = [
  'Pass',
  'Monitor',
  'Fixed On Site',
  'Needs Repair',
  'Urgent',
];

const FINDING_STATUS_PRESENTATIONS: Record<FindingStatus, FindingStatusPresentation> = {
  Pass: {
    value: 'Pass',
    label: 'Pass',
    tone: 'success',
    borderColor: '#16a34a',
    dotClass: 'bg-emerald-500',
  },
  Monitor: {
    value: 'Monitor',
    label: 'Monitor',
    tone: 'info',
    borderColor: '#2563eb',
    dotClass: 'bg-blue-500',
  },
  'Fixed On Site': {
    value: 'Fixed On Site',
    label: 'Fixed On Site',
    tone: 'violet',
    borderColor: '#0f766e',
    dotClass: 'bg-violet-500',
  },
  'Needs Repair': {
    value: 'Needs Repair',
    label: 'Needs Repair',
    tone: 'warning',
    borderColor: '#d97706',
    dotClass: 'bg-amber-500',
  },
  Urgent: {
    value: 'Urgent',
    label: 'Urgent',
    tone: 'danger',
    borderColor: '#dc2626',
    dotClass: 'bg-red-500',
  },
};

const FALLBACK_DOT_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-slate-400',
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  muted: 'bg-slate-400',
  violet: 'bg-violet-500',
};

export function findingStatusPresentation(status?: FindingStatus | string | null): FindingStatusPresentation {
  if (status && status in FINDING_STATUS_PRESENTATIONS) {
    return FINDING_STATUS_PRESENTATIONS[status as FindingStatus];
  }

  return {
    value: status ?? '',
    label: readableStatusLabel(status),
    tone: 'neutral',
    borderColor: '#cbd5e1',
    dotClass: FALLBACK_DOT_CLASSES.neutral,
  };
}

export function findingStatusAccentClass(status?: FindingStatus | string | null) {
  return statusToneClass(findingStatusPresentation(status).tone);
}

export function findingStatusSelectedButtonClass(status?: FindingStatus | string | null) {
  return findingStatusAccentClass(status);
}

export function findingStatusDotClass(status?: FindingStatus | string | null) {
  return findingStatusPresentation(status).dotClass;
}

export function findingStatusBorderColor(status?: FindingStatus | string | null) {
  return findingStatusPresentation(status).borderColor;
}
