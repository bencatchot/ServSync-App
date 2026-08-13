export function parseStorageBackupRetention(value: string) {
  const retentionRuns = Number(value);
  if (!Number.isSafeInteger(retentionRuns) || retentionRuns < 1 || retentionRuns > 365) {
    throw new Error('Storage backup retention must be a whole number from 1 through 365.');
  }
  return retentionRuns;
}
