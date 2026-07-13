import type {
  AppointmentStatus,
  ContractorVisitEventStatus,
  ContractorVisitHomeownerResponseStatus,
  ServiceRequestAppointmentWindowStatus,
} from '../../types';
import {
  readableStatusLabel,
  type StatusPresentation,
  type StatusTone,
} from '../status/statusPresentation';

export interface CalendarStatusPresentation extends StatusPresentation {
  compactLabel: string;
  dotClass: string;
  chipClass: string;
  cardClass: string;
}

const NEUTRAL_PRESENTATION: Omit<CalendarStatusPresentation, 'label' | 'compactLabel'> = {
  tone: 'neutral',
  dotClass: 'bg-slate-400',
  chipClass: 'border-slate-200 bg-slate-50 text-slate-800',
  cardClass: 'border-slate-200 bg-slate-50',
};

const toneClasses: Record<StatusTone, Omit<CalendarStatusPresentation, 'label' | 'compactLabel' | 'tone'>> = {
  neutral: NEUTRAL_PRESENTATION,
  info: {
    dotClass: 'bg-blue-500',
    chipClass: 'border-blue-200 bg-blue-50 text-blue-800',
    cardClass: 'border-blue-200 bg-blue-50',
  },
  success: {
    dotClass: 'bg-emerald-500',
    chipClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    cardClass: 'border-emerald-200 bg-emerald-50',
  },
  warning: {
    dotClass: 'bg-amber-500',
    chipClass: 'border-amber-200 bg-amber-50 text-amber-800',
    cardClass: 'border-amber-200 bg-amber-50',
  },
  danger: {
    dotClass: 'bg-red-400',
    chipClass: 'border-red-200 bg-red-50 text-red-800',
    cardClass: 'border-red-200 bg-red-50',
  },
  muted: {
    dotClass: 'bg-slate-400',
    chipClass: 'border-slate-200 bg-slate-50 text-slate-700',
    cardClass: 'border-slate-200 bg-slate-50',
  },
  violet: {
    dotClass: 'bg-violet-500',
    chipClass: 'border-violet-200 bg-violet-50 text-violet-800',
    cardClass: 'border-violet-200 bg-violet-50',
  },
};

function withCalendarClasses(label: string, tone: StatusTone, compactLabel = label): CalendarStatusPresentation {
  return {
    label,
    compactLabel,
    tone,
    ...toneClasses[tone],
  };
}

function fallbackPresentation(value?: string | null): CalendarStatusPresentation {
  const label = readableStatusLabel(value);
  return {
    label,
    compactLabel: label,
    ...NEUTRAL_PRESENTATION,
  };
}

export function appointmentStatusPresentation(status: AppointmentStatus | string | null | undefined): CalendarStatusPresentation {
  const presentations: Record<AppointmentStatus, CalendarStatusPresentation> = {
    proposed: withCalendarClasses('Proposed', 'warning'),
    confirmed: withCalendarClasses('Confirmed', 'success'),
    completed: withCalendarClasses('Completed', 'info'),
    cancelled: withCalendarClasses('Cancelled', 'danger'),
  };
  return presentations[status as AppointmentStatus] ?? fallbackPresentation(status);
}

export function appointmentWindowStatusPresentation(status: ServiceRequestAppointmentWindowStatus | string | null | undefined): CalendarStatusPresentation {
  const presentations: Record<ServiceRequestAppointmentWindowStatus, CalendarStatusPresentation> = {
    proposed: withCalendarClasses('Proposed', 'info'),
    accepted: withCalendarClasses('Accepted', 'success'),
    declined: withCalendarClasses('Declined', 'danger'),
    superseded: withCalendarClasses('Superseded', 'muted'),
    cancelled: withCalendarClasses('Cancelled', 'danger'),
    expired: withCalendarClasses('Expired', 'warning'),
  };
  return presentations[status as ServiceRequestAppointmentWindowStatus] ?? fallbackPresentation(status);
}

export function visitEventStatusPresentation(status: ContractorVisitEventStatus | string | null | undefined): CalendarStatusPresentation {
  const presentations: Record<ContractorVisitEventStatus, CalendarStatusPresentation> = {
    scheduled: withCalendarClasses('Scheduled', 'info'),
    completed: withCalendarClasses('Completed', 'success'),
    cancelled: withCalendarClasses('Cancelled', 'danger'),
  };
  return presentations[status as ContractorVisitEventStatus] ?? fallbackPresentation(status);
}

export function visitHomeownerResponsePresentation(status: ContractorVisitHomeownerResponseStatus | string | null | undefined): CalendarStatusPresentation {
  const presentations: Record<ContractorVisitHomeownerResponseStatus, CalendarStatusPresentation> = {
    not_shared: withCalendarClasses('Contractor Calendar', 'neutral'),
    shared_waiting: withCalendarClasses('Shared — Waiting for Homeowner', 'warning', 'Waiting on Homeowner'),
    accepted: withCalendarClasses('Homeowner Accepted', 'success', 'Accepted'),
    declined: withCalendarClasses('Homeowner Declined', 'danger', 'Declined'),
    countered: withCalendarClasses('New Time Suggested', 'violet'),
  };
  return presentations[status as ContractorVisitHomeownerResponseStatus] ?? fallbackPresentation(status);
}
