const TECHNICAL_ERROR_PATTERN = /(?:\b(?:postgres|postgrest|pgrst|rpc|sqlstate|stack|schema cache|security definer|row-level security|rls|jwt|supabase)\b|\b(?:PGRST|SQLSTATE|XX|22|23|28|40|42|53|54|55|57|58)[A-Z0-9]{2,}\b|(?:https?:\/\/|at\s+\w+\s*\(|\.tsx?:\d+|\{[\s\S]*"(?:message|details|hint|code)"))/i;

function candidateMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
}

export function userFacingError(error: unknown, fallback: string) {
  const message = candidateMessage(error).trim();
  if (!message || message.length > 240 || TECHNICAL_ERROR_PATTERN.test(message)) return fallback;
  return message;
}
