const SUPABASE_HOST_SUFFIX = '.supabase.co';

export function configuredSupabasePublicStorageUrl(
  value: string | null | undefined,
  configuredSupabaseUrl: string | null | undefined,
  bucket: string,
) {
  const sourceValue = value?.trim() ?? '';
  const configuredValue = configuredSupabaseUrl?.trim() ?? '';
  if (!sourceValue || !configuredValue || !bucket) return sourceValue;

  try {
    const source = new URL(sourceValue);
    const configured = new URL(configuredValue);
    const expectedPrefix = `/storage/v1/object/public/${encodeURIComponent(bucket)}/`;

    if (!source.hostname.endsWith(SUPABASE_HOST_SUFFIX)) return sourceValue;
    if (!configured.hostname.endsWith(SUPABASE_HOST_SUFFIX)) return sourceValue;
    if (!source.pathname.startsWith(expectedPrefix)) return sourceValue;

    return new URL(`${source.pathname}${source.search}${source.hash}`, configured.origin).toString();
  } catch {
    return sourceValue;
  }
}
