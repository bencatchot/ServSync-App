import type { HomeReminderStatus } from '../../types';
import {
  readableStatusLabel,
  type StatusPresentation,
} from '../status/statusPresentation';

export type HomeReminderDueState = 'upcoming' | 'due_today' | 'overdue';
export type HomeReminderDerivedState = HomeReminderDueState | Extract<HomeReminderStatus, 'completed' | 'dismissed'>;
export type SharedHomeReminderState = 'open' | 'overdue';

const HOME_REMINDER_STATUS_PRESENTATIONS: Record<HomeReminderStatus, StatusPresentation> = {
  open: { label: 'Open', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  dismissed: { label: 'Dismissed', tone: 'muted' },
};

const HOME_REMINDER_DUE_STATE_PRESENTATIONS: Record<HomeReminderDueState, StatusPresentation> = {
  upcoming: { label: 'Upcoming', tone: 'info' },
  due_today: { label: 'Due Today', tone: 'warning' },
  overdue: { label: 'Overdue', tone: 'danger' },
};

const SHARED_HOME_REMINDER_STATE_PRESENTATIONS: Record<SharedHomeReminderState, StatusPresentation> = {
  open: HOME_REMINDER_STATUS_PRESENTATIONS.open,
  overdue: HOME_REMINDER_DUE_STATE_PRESENTATIONS.overdue,
};

export function homeReminderStatusPresentation(status?: HomeReminderStatus | string | null): StatusPresentation {
  return HOME_REMINDER_STATUS_PRESENTATIONS[status as HomeReminderStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function homeReminderDueStatePresentation(state?: HomeReminderDueState | string | null): StatusPresentation {
  return HOME_REMINDER_DUE_STATE_PRESENTATIONS[state as HomeReminderDueState] ?? { label: readableStatusLabel(state), tone: 'neutral' };
}

export function sharedHomeReminderStatePresentation(state?: SharedHomeReminderState | string | null): StatusPresentation {
  return SHARED_HOME_REMINDER_STATE_PRESENTATIONS[state as SharedHomeReminderState] ?? { label: readableStatusLabel(state), tone: 'neutral' };
}

export function deriveHomeReminderDueState(
  reminder: Pick<{ status: HomeReminderStatus | string; due_on: string }, 'status' | 'due_on'>,
  todayInputValue: string,
): HomeReminderDerivedState {
  if (reminder.status === 'completed') return 'completed';
  if (reminder.status === 'dismissed') return 'dismissed';
  if (reminder.due_on < todayInputValue) return 'overdue';
  if (reminder.due_on === todayInputValue) return 'due_today';
  return 'upcoming';
}

export function homeReminderDerivedStatePresentation(state: HomeReminderDerivedState | string | null | undefined): StatusPresentation {
  if (state === 'completed' || state === 'dismissed') return homeReminderStatusPresentation(state);
  return homeReminderDueStatePresentation(state);
}

export function deriveSharedHomeReminderState(isOverdue?: boolean | null): SharedHomeReminderState {
  return isOverdue ? 'overdue' : 'open';
}
