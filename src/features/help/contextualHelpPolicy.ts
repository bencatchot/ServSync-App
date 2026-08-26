export function contextualHelpLookupReady(contextKey: string, contractorId?: string | null) {
  return !contextKey.startsWith('contractor.') || Boolean(contractorId);
}
