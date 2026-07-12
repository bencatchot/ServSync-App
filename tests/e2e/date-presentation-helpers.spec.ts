import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  formatDateOnly,
  formatDateTime,
  formatLongDate,
  formatLongWeekdayMonthDay,
  formatMonthYear,
  formatShortDate,
  formatShortMonthDay,
  formatShortMonthDayAtTime,
  formatShortWeekdayDateTime,
  formatTime,
  formatWeekday,
} from '../../src/utils/datePresentation';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test.describe('Date presentation helpers', () => {
  test('match the legacy user-facing date and time formats', () => {
    const value = '2026-07-12T15:30:00';
    const date = new Date(value);

    expect(formatDateTime(value)).toBe(date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }));
    expect(formatShortDate(value)).toBe(date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }));
    expect(formatLongDate(value)).toBe(date.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }));
    expect(formatShortMonthDay(date)).toBe(date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
    }));
    expect(formatMonthYear(date)).toBe(date.toLocaleString('en-US', {
      month: 'short',
      year: 'numeric',
    }));
    expect(formatWeekday(date)).toBe(date.toLocaleString('en-US', { weekday: 'long' }));
    expect(formatLongWeekdayMonthDay(date)).toBe(date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }));
    expect(formatShortWeekdayDateTime(value)).toBe(date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }));
    expect(formatTime(date)).toBe(date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }));
    expect(formatShortMonthDayAtTime(date, '', [])).toBe(
      `${date.toLocaleString('en-US', { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
    );
  });

  test('preserves date-only and fallback behavior', () => {
    const dateOnly = '2026-07-12';
    const date = new Date(`${dateOnly}T00:00:00`);

    expect(formatDateOnly(dateOnly)).toBe(date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }));
    expect(formatDateOnly('', 'not set')).toBe('not set');
    expect(formatDateTime(null)).toBe('Not used yet');
    expect(formatShortDate('not-a-date')).toBe(new Date('not-a-date').toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }));
  });

  test('centralizes user-facing date formatting outside App.tsx', () => {
    const appSource = sourceFile('src/App.tsx');
    const formatSource = sourceFile('src/utils/format.ts');

    expect(appSource).toContain("from './utils/format';");
    expect(appSource).not.toContain('toLocaleDateString(');
    expect(appSource).not.toContain('toLocaleTimeString(');
    expect(appSource).toContain('formatDateTime');
    expect(appSource).toContain('formatShortDate');
    expect(appSource).toContain('formatDateOnly');
    expect(formatSource).toContain("from './datePresentation';");
  });

  test('keeps Bundle 2B presentation-only boundaries', () => {
    const appSource = sourceFile('src/App.tsx');
    const helperSource = sourceFile('src/utils/datePresentation.ts');

    expect(helperSource).not.toContain('supabase');
    expect(helperSource).not.toContain('.from(');
    expect(helperSource).not.toContain('.rpc(');
    expect(helperSource).not.toContain('StatusBadge');
    expect(appSource).not.toContain("from './utils/datePresentation'");
  });
});
