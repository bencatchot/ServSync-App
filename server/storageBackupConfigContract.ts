export function parseStorageBackupRetention(value: string) {
  const retentionRuns = Number(value);
  if (!Number.isSafeInteger(retentionRuns) || retentionRuns < 1 || retentionRuns > 365) {
    throw new Error('Storage backup retention must be a whole number from 1 through 365.');
  }
  return retentionRuns;
}

export function requiredStorageBackupConfig(
  name: string,
  environment: Record<string, string | undefined> = process.env,
) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Required Storage backup configuration ${name} is unavailable.`);
  return value;
}
