import { createR2BackupStorage, createSupabaseStorageSource } from './storageBackupProviders.ts';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required Storage backup configuration ${name} is unavailable.`);
  return value;
}

export function storageBackupConfig() {
  const sourceProjectRef = required('SERVSYNC_STORAGE_BACKUP_SOURCE_PROJECT_REF');
  const sourceUrl = required('SERVSYNC_STORAGE_BACKUP_SOURCE_URL');
  if (new URL(sourceUrl).hostname !== `${sourceProjectRef}.supabase.co`) {
    throw new Error('Storage backup source URL does not match the configured project identity.');
  }
  const accountId = required('SERVSYNC_STORAGE_BACKUP_R2_ACCOUNT_ID');
  const bucket = required('SERVSYNC_STORAGE_BACKUP_R2_BUCKET');
  const endpoint = required('SERVSYNC_STORAGE_BACKUP_R2_ENDPOINT');
  if (new URL(endpoint).hostname !== `${accountId}.r2.cloudflarestorage.com`) {
    throw new Error('Storage backup endpoint does not match the configured R2 account identity.');
  }
  const retentionRuns = Number(required('SERVSYNC_STORAGE_BACKUP_RETENTION_DAYS'));
  if (!Number.isSafeInteger(retentionRuns) || retentionRuns < 1 || retentionRuns > 365) {
    throw new Error('Storage backup retention must be a whole number from 1 through 365.');
  }
  return {
    sourceProjectRef,
    accountId,
    bucket,
    retentionRuns,
    source: createSupabaseStorageSource({
      url: sourceUrl,
      secretKey: required('SERVSYNC_STORAGE_BACKUP_SOURCE_SECRET_KEY'),
    }),
    backup: createR2BackupStorage({
      accountId,
      bucket,
      endpoint,
      accessKeyId: required('SERVSYNC_STORAGE_BACKUP_R2_ACCESS_KEY_ID'),
      secretAccessKey: required('SERVSYNC_STORAGE_BACKUP_R2_SECRET_ACCESS_KEY'),
    }),
  };
}
