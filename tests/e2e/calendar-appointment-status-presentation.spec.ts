import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  appointmentStatusPresentation,
  appointmentWindowStatusPresentation,
  visitEventStatusPresentation,
  visitHomeownerResponsePresentation,
} from '../../src/features/appointments/statusPresentation';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Calendar and appointment status presentation', () => {
  test('defines canonical appointment, window, visit, and response presentation', () => {
    expect(appointmentStatusPresentation('proposed')).toMatchObject({ label: 'Proposed', compactLabel: 'Proposed', tone: 'warning' });
    expect(appointmentStatusPresentation('confirmed')).toMatchObject({ label: 'Confirmed', compactLabel: 'Confirmed', tone: 'success' });
    expect(appointmentStatusPresentation('completed')).toMatchObject({ label: 'Completed', compactLabel: 'Completed', tone: 'info' });
    expect(appointmentStatusPresentation('cancelled')).toMatchObject({ label: 'Cancelled', compactLabel: 'Cancelled', tone: 'danger' });

    expect(appointmentWindowStatusPresentation('proposed')).toMatchObject({ label: 'Proposed', tone: 'info' });
    expect(appointmentWindowStatusPresentation('accepted')).toMatchObject({ label: 'Accepted', tone: 'success' });
    expect(appointmentWindowStatusPresentation('declined')).toMatchObject({ label: 'Declined', tone: 'danger' });
    expect(appointmentWindowStatusPresentation('superseded')).toMatchObject({ label: 'Superseded', tone: 'muted' });
    expect(appointmentWindowStatusPresentation('cancelled')).toMatchObject({ label: 'Cancelled', tone: 'danger' });
    expect(appointmentWindowStatusPresentation('expired')).toMatchObject({ label: 'Expired', tone: 'warning' });

    expect(visitEventStatusPresentation('scheduled')).toMatchObject({ label: 'Scheduled', tone: 'info' });
    expect(visitEventStatusPresentation('completed')).toMatchObject({ label: 'Completed', tone: 'success' });
    expect(visitEventStatusPresentation('cancelled')).toMatchObject({ label: 'Cancelled', tone: 'danger' });

    expect(visitHomeownerResponsePresentation('not_shared')).toMatchObject({ label: 'Contractor Calendar', compactLabel: 'Contractor Calendar', tone: 'neutral' });
    expect(visitHomeownerResponsePresentation('shared_waiting')).toMatchObject({ label: 'Shared — Waiting for Homeowner', compactLabel: 'Waiting on Homeowner', tone: 'warning' });
    expect(visitHomeownerResponsePresentation('accepted')).toMatchObject({ label: 'Homeowner Accepted', compactLabel: 'Accepted', tone: 'success' });
    expect(visitHomeownerResponsePresentation('declined')).toMatchObject({ label: 'Homeowner Declined', compactLabel: 'Declined', tone: 'danger' });
    expect(visitHomeownerResponsePresentation('countered')).toMatchObject({ label: 'New Time Suggested', compactLabel: 'New Time Suggested', tone: 'violet' });
  });

  test('falls back safely for unknown runtime status values', () => {
    expect(appointmentStatusPresentation('waiting_on_dispatch')).toMatchObject({
      label: 'Waiting On Dispatch',
      compactLabel: 'Waiting On Dispatch',
      tone: 'neutral',
    });
    expect(appointmentWindowStatusPresentation(null)).toMatchObject({ label: 'Unknown', tone: 'neutral' });
    expect(visitEventStatusPresentation(undefined)).toMatchObject({ label: 'Unknown', tone: 'neutral' });
    expect(visitHomeownerResponsePresentation('homeowner-rescheduled')).toMatchObject({ label: 'Homeowner Rescheduled', tone: 'neutral' });
  });

  test('migrates appointment cards and detail panels to shared presentation helpers', () => {
    const source = sourceFile('src/App.tsx');
    const appointmentCard = sourceBetween(source, 'function ServiceRequestAppointmentCard', 'function formatAppointmentWindowRange');
    const homeownerDetail = sourceBetween(source, 'function HomeownerCalendarEventDetail', 'function StarDisplay');
    const visitDetail = sourceBetween(source, 'function VisitCalendarEventDetail', 'function CalendarView');

    expect(source).toContain("from './features/appointments/statusPresentation';");
    expect(appointmentCard).toContain('const appointmentPresentation = appointmentStatusPresentation(appointment.status);');
    expect(appointmentCard).toContain('<StatusBadge {...appointmentPresentation} className="w-fit" />');
    expect(appointmentCard).not.toContain('const statusLabel: Record<AppointmentStatus');
    expect(appointmentCard).not.toContain('const badgeStyle: Record<AppointmentStatus');

    expect(homeownerDetail).toContain('const appointmentPresentation = appointmentStatusPresentation(appointment.status);');
    expect(homeownerDetail).toContain('<StatusBadge {...appointmentPresentation} className="mt-1" />');
    expect(homeownerDetail).not.toContain('const statusLabel: Record<AppointmentStatus');

    expect(visitDetail).toContain('const visitPresentation = visitEventStatusPresentation(event.status);');
    expect(visitDetail).toContain('const responsePresentation = visitHomeownerResponsePresentation(event.homeowner_response_status);');
    expect(visitDetail).toContain('Visit status');
    expect(visitDetail).toContain('Homeowner response');
    expect(visitDetail).toContain('<StatusBadge {...visitPresentation} className="mt-1" />');
  });

  test('keeps dense calendar chips compact while deriving labels, dots, and legend from shared presentation', () => {
    const source = sourceFile('src/App.tsx');
    const calendarView = sourceBetween(source, 'function CalendarView', 'function SetupNotice');
    const monthGrid = sourceBetween(calendarView, 'dayAppts.slice(0, 3).map', '{dayAppts.length > 3 &&');

    expect(calendarView).toContain('const visitCalendarPresentation = (event: ContractorVisitEvent)');
    expect(calendarView).toContain("const calendarLegendItems = (['proposed', 'confirmed', 'completed', 'cancelled'] as const).map(status => appointmentStatusPresentation(status));");
    expect(calendarView).toContain('visitCalendarPresentation(entry.visitEvent).chipClass');
    expect(calendarView).toContain('appointmentStatusPresentation(entry.appointment.status).chipClass');
    expect(calendarView).toContain('appointmentStatusPresentation(entry.appointment.status).label');
    expect(calendarView).toContain('aria-label={`${time} ${title} ${statusText}`}');
    expect(calendarView).toContain('item.dotClass');
    expect(calendarView).not.toContain('const appointmentStatusClass');
    expect(calendarView).not.toContain('const appointmentDotClass');
    expect(calendarView).not.toContain('const visitEventStatusClass');
    expect(calendarView).not.toContain('const visitEventDotClass');
    expect(calendarView).not.toContain('const visitResponseLabel');

    expect(monthGrid).not.toContain('StatusBadge');
    expect(monthGrid).toContain('block w-full rounded border px-1 py-0.5 text-left text-xs leading-tight');
  });

  test('keeps standalone event types and workflow guidance separate from status presentation', () => {
    const source = sourceFile('src/App.tsx');
    const helperSource = sourceFile('src/features/appointments/statusPresentation.ts');

    expect(source).toContain('function calendarEventTypeLabel(type: string)');
    expect(source).toContain('calendarEventTypeLabel(calendarEvent.event_type)');
    expect(helperSource).not.toContain('service_visit');
    expect(helperSource).not.toContain('inspection_visit');
    expect(helperSource).not.toContain('estimate_visit');
    expect(helperSource).not.toContain('follow_up_visit');
    expect(helperSource).not.toContain('custom');

    expect(source).toContain('function appointmentNextActionText');
    expect(source).toContain('function appointmentResponseText');
    expect(source).toContain('Waiting on the homeowner to confirm this proposed time.');
    expect(source).toContain('Your response is needed.');
  });

  test('preserves frontend-only presentation boundaries', () => {
    const source = sourceFile('src/App.tsx');
    const helperSource = sourceFile('src/features/appointments/statusPresentation.ts');

    expect(helperSource).not.toContain('supabase');
    expect(helperSource).not.toContain('.from(');
    expect(helperSource).not.toContain('.rpc(');
    expect(helperSource).not.toContain('Date(');
    expect(helperSource).not.toContain('localStorage');
    expect(helperSource).not.toContain('sessionStorage');
    expect(helperSource).not.toContain('notification');
    expect(helperSource).not.toContain('route');

    expect(source).toContain("request.appointment?.status === 'proposed' && request.appointment.proposed_by === 'contractor'");
    expect(source).toContain("entry.appointment.status === 'proposed'");
    expect(source).toContain("entry.appointment.proposed_by !== perspective");
    expect(source).toContain('normalizeServiceRequestAppointmentWindows(windows)');
    expect(source).not.toContain("from './features/projects/statusPresentation'");
    expect(source).not.toContain("from './features/reminders/statusPresentation'");
    expect(source).toContain("from './features/findings/statusPresentation';");
  });
});
