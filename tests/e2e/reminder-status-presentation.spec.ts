import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveHomeReminderDueState,
  deriveSharedHomeReminderState,
  homeReminderDerivedStatePresentation,
  homeReminderDueStatePresentation,
  homeReminderStatusPresentation,
  sharedHomeReminderStatePresentation,
} from '../../src/features/reminders/statusPresentation';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Reminder lifecycle and due-state presentation', () => {
  test('defines canonical lifecycle, due-state, and shared-shell presentation', () => {
    expect(homeReminderStatusPresentation('open')).toEqual({ label: 'Open', tone: 'info' });
    expect(homeReminderStatusPresentation('completed')).toEqual({ label: 'Completed', tone: 'success' });
    expect(homeReminderStatusPresentation('dismissed')).toEqual({ label: 'Dismissed', tone: 'muted' });

    expect(homeReminderDueStatePresentation('upcoming')).toEqual({ label: 'Upcoming', tone: 'info' });
    expect(homeReminderDueStatePresentation('due_today')).toEqual({ label: 'Due Today', tone: 'warning' });
    expect(homeReminderDueStatePresentation('overdue')).toEqual({ label: 'Overdue', tone: 'danger' });

    expect(sharedHomeReminderStatePresentation('open')).toEqual({ label: 'Open', tone: 'info' });
    expect(sharedHomeReminderStatePresentation('overdue')).toEqual({ label: 'Overdue', tone: 'danger' });
  });

  test('falls back safely for unknown reminder values', () => {
    expect(homeReminderStatusPresentation('paused')).toEqual({ label: 'Paused', tone: 'neutral' });
    expect(homeReminderDueStatePresentation('due-soon')).toEqual({ label: 'Due Soon', tone: 'neutral' });
    expect(sharedHomeReminderStatePresentation('past_due')).toEqual({ label: 'Past Due', tone: 'neutral' });
    expect(homeReminderStatusPresentation('')).toEqual({ label: 'Unknown', tone: 'neutral' });
    expect(homeReminderDueStatePresentation(null)).toEqual({ label: 'Unknown', tone: 'neutral' });
  });

  test('derives owner reminder display state with the existing date-string comparison behavior', () => {
    const today = '2026-07-13';

    expect(deriveHomeReminderDueState({ status: 'completed', due_on: '2026-01-01' }, today)).toBe('completed');
    expect(deriveHomeReminderDueState({ status: 'dismissed', due_on: '2026-01-01' }, today)).toBe('dismissed');
    expect(deriveHomeReminderDueState({ status: 'open', due_on: '2026-07-12' }, today)).toBe('overdue');
    expect(deriveHomeReminderDueState({ status: 'open', due_on: '2026-07-13' }, today)).toBe('due_today');
    expect(deriveHomeReminderDueState({ status: 'open', due_on: '2026-07-14' }, today)).toBe('upcoming');
    expect(deriveHomeReminderDueState({ status: 'open', due_on: '' }, today)).toBe('overdue');
    expect(deriveHomeReminderDueState({ status: 'open', due_on: '2026-12-31' }, '2027-01-01')).toBe('overdue');
    expect(deriveHomeReminderDueState({ status: 'open', due_on: '2028-02-29' }, '2028-02-28')).toBe('upcoming');

    expect(homeReminderDerivedStatePresentation('completed')).toEqual({ label: 'Completed', tone: 'success' });
    expect(homeReminderDerivedStatePresentation('dismissed')).toEqual({ label: 'Dismissed', tone: 'muted' });
    expect(homeReminderDerivedStatePresentation('due_today')).toEqual({ label: 'Due Today', tone: 'warning' });
  });

  test('uses the RPC-provided shared shell overdue flag without local date recalculation', () => {
    expect(deriveSharedHomeReminderState(true)).toBe('overdue');
    expect(deriveSharedHomeReminderState(false)).toBe('open');
    expect(deriveSharedHomeReminderState(null)).toBe('open');
    expect(deriveSharedHomeReminderState(undefined)).toBe('open');

    const helperSource = sourceFile('src/features/reminders/statusPresentation.ts');
    const sharedDerivation = helperSource.slice(helperSource.indexOf('export function deriveSharedHomeReminderState'));
    expect(sharedDerivation).not.toContain('due_on');
    expect(sharedDerivation).not.toContain('Date(');
  });

  test('migrates owner reminder cards while preserving raw lifecycle action checks and metrics', () => {
    const source = sourceFile('src/App.tsx');

    expect(source).toContain("from './features/reminders/statusPresentation';");
    expect(source).toContain('deriveHomeReminderDueState(reminder, dateInputValue(new Date()))');
    expect(source).toContain('homeReminderDerivedStatePresentation(deriveHomeReminderDueState(reminder, dateInputValue(new Date())))');
    expect(source).toContain('<StatusBadge {...reminderPresentation} />');
    expect(source).toContain("reminder.status === 'open' && (");
    expect(source).toContain("onClick={() => void updateHomeReminderStatus(reminder, 'completed')}");
    expect(source).toContain("onClick={() => void updateHomeReminderStatus(reminder, 'dismissed')}");
    expect(source).toContain("propertyScopedHomeReminders.filter(reminder => reminder.status === 'open').length");
    expect(source).toContain("dashboardHomeReminders\n    .filter(reminder => reminder.status === 'open')");
    expect(source).toContain("if (a.status === b.status) return a.due_on.localeCompare(b.due_on);");
    expect(source).toContain('Due {formatDateOnly(reminder.due_on)}');
    expect(source).not.toContain("label === 'Overdue'");
    expect(source).not.toContain("tone === 'danger'");
  });

  test('keeps shared reminder shells private, read-only, and presentation-only', () => {
    const source = sourceFile('src/App.tsx');
    const sharedPanel = sourceBetween(source, 'const renderSharedHomeShellsPanel = () => (', 'const renderHomeAccessPanel = () => {');

    expect(source).toContain('sharedHomeReminderStatePresentation(deriveSharedHomeReminderState(reminder.is_overdue))');
    expect(sharedPanel).toContain('const reminderPresentation = sharedReminderStatePresentation(reminder);');
    expect(sharedPanel).toContain('Notes and linked records are not shared yet.');
    expect(sharedPanel).toContain('data-testid="shared-home-reminder-card"');
    expect(sharedPanel).not.toContain('reminder.notes');
    expect(sharedPanel).not.toContain('maintenance_log_id');
    expect(sharedPanel).not.toContain('service_request_id');
    expect(sharedPanel).not.toContain('invoice_id');
    expect(sharedPanel).not.toContain('updateHomeReminderStatus');
    expect(sharedPanel).not.toContain('.from(\'home_reminders\')');
  });

  test('preserves reminder-slice scope boundaries', () => {
    const helperSource = sourceFile('src/features/reminders/statusPresentation.ts');
    const appSource = sourceFile('src/App.tsx');

    expect(helperSource).not.toContain('supabase');
    expect(helperSource).not.toContain('.from(');
    expect(helperSource).not.toContain('.rpc(');
    expect(helperSource).not.toContain('localStorage');
    expect(helperSource).not.toContain('sessionStorage');
    expect(helperSource).not.toContain('formatDate');
    expect(helperSource).not.toContain('notification');
    expect(helperSource).not.toContain('calendarEvent');
    expect(helperSource).not.toContain('pdf');

    expect(appSource).not.toContain("from './features/projects/statusPresentation'");
    expect(appSource).not.toContain('ReminderStateBadge');
    expect(helperSource).not.toContain('Due Soon');
    expect(helperSource).not.toContain('snooz');
    expect(helperSource).not.toContain('recurrence');
    expect(sourceFile('src/utils/pdfDocuments.ts')).not.toContain('home_reminders');
  });
});
