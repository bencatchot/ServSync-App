import type { ConnectionRequestContext } from '../../types';

function contextString(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function normalizeConnectionRequestContext(context: unknown): ConnectionRequestContext | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const row = context as Record<string, unknown>;
  return {
    message: contextString(row.message),
    created_at: contextString(row.created_at),
    updated_at: contextString(row.updated_at),
  };
}

export function connectionRequestContextPresentation(
  context: ConnectionRequestContext | null | undefined,
  emptyText: string,
  formatTimestamp?: (value: string) => string,
) {
  return {
    message: context?.message || emptyText,
    submittedLabel: context?.created_at && formatTimestamp ? `Submitted ${formatTimestamp(context.created_at)}` : '',
  };
}
