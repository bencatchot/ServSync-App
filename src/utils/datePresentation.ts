type DateDisplayInput = Date | string | number | null | undefined;

const SHORT_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

const SHORT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

const LONG_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
};

const SHORT_MONTH_DAY_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
};

const MONTH_YEAR_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  year: 'numeric',
};

const WEEKDAY_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
};

const LONG_WEEKDAY_MONTH_DAY_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
};

const SHORT_WEEKDAY_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

const LONG_WEEKDAY_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
};

function coerceDate(value: DateDisplayInput) {
  if (value instanceof Date) return value;
  if (value === null || value === undefined || value === '') return null;
  return new Date(value);
}

function formatDateWithOptions(
  value: DateDisplayInput,
  options: Intl.DateTimeFormatOptions,
  fallback = '',
  locale: string | string[] = 'en-US',
) {
  const date = coerceDate(value);
  if (!date) return fallback;
  return date.toLocaleString(locale, options);
}

export function formatDateTime(value?: string | null) {
  return formatDateWithOptions(value, SHORT_DATE_TIME_OPTIONS, 'Not used yet');
}

export function formatShortDate(value: DateDisplayInput, fallback = '') {
  return formatDateWithOptions(value, SHORT_DATE_OPTIONS, fallback);
}

export function formatDateOnly(value?: string | null, fallback = '') {
  return value ? formatShortDate(`${value}T00:00:00`, fallback) : fallback;
}

export function formatLongDate(value: DateDisplayInput, fallback = '') {
  return formatDateWithOptions(value, LONG_DATE_OPTIONS, fallback);
}

export function formatShortMonthDay(value: DateDisplayInput = new Date(), fallback = '') {
  return formatDateWithOptions(value, SHORT_MONTH_DAY_OPTIONS, fallback);
}

export function formatMonthYear(value: DateDisplayInput = new Date(), fallback = '') {
  return formatDateWithOptions(value, MONTH_YEAR_OPTIONS, fallback);
}

export function formatWeekday(value: DateDisplayInput, fallback = '') {
  return formatDateWithOptions(value, WEEKDAY_OPTIONS, fallback);
}

export function formatLongWeekdayMonthDay(value: DateDisplayInput, fallback = '') {
  return formatDateWithOptions(value, LONG_WEEKDAY_MONTH_DAY_OPTIONS, fallback);
}

export function formatShortWeekdayDateTime(value: DateDisplayInput, fallback = '') {
  return formatDateWithOptions(value, SHORT_WEEKDAY_DATE_TIME_OPTIONS, fallback);
}

export function formatLongWeekdayDateTime(value: DateDisplayInput, fallback = '') {
  return formatDateWithOptions(value, LONG_WEEKDAY_DATE_TIME_OPTIONS, fallback);
}

export function formatTime(value: DateDisplayInput, fallback = '', locale: string | string[] = 'en-US') {
  return formatDateWithOptions(value, TIME_OPTIONS, fallback, locale);
}

export function formatShortMonthDayAtTime(value: DateDisplayInput, fallback = '', locale: string | string[] = 'en-US') {
  const date = coerceDate(value);
  if (!date) return fallback;
  return `${formatShortMonthDay(date, fallback)} at ${formatTime(date, fallback, locale)}`;
}
