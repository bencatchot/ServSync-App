type PostgrestErrorShape = {
  code?: string;
  message?: string;
  details?: string;
};

export function isExactMissingEstimateSendRpcError(error: unknown) {
  const candidate = error as PostgrestErrorShape | null | undefined;
  return candidate?.code === 'PGRST202'
    && typeof candidate.details === 'string'
    && candidate.details.startsWith('Searched for the function public.servsync_send_estimate ')
    && candidate.details.endsWith('but no matches were found in the schema cache.')
    && typeof candidate.message === 'string'
    && candidate.message.startsWith('Could not find the function public.servsync_send_estimate(')
    && candidate.message.endsWith(' in the schema cache');
}
