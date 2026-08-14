import { createR2BackupStorage, createSupabaseStorageSource } from './storageBackupProviders.js';
import { parseStorageBackupRetention, requiredStorageBackupConfig } from './storageBackupConfigContract.js';

export function storageBackupConfig() {
  const sourceProjectRef = requiredStorageBackupConfig('SERVSYNC_STORAGE_BACKUP_SOURCE_PROJECT_REF');
  const sourceUrl = requiredStorageBackupConfig('SERVSYNC_STORAGE_BACKUP_SOURCE_URL');
  if (new URL(sourceUrl).hostname !== `${sourceProjectRef}.supabase.co`) {
    throw new Error('Storage backup source URL does not match the configured project identity.');
  }
  const accountId = requiredStorageBackupConfig('SERVSYNC_STORAGE_BACKUP_R2_ACCOUNT_ID');
  const bucket = requiredStorageBackupConfig('SERVSYNC_STORAGE_BACKUP_R2_BUCKET');
  const endpoint = requiredStorageBackupConfig('SERVSYNC_STORAGE_BACKUP_R2_ENDPOINT');
  if (new URL(endpoint).hostname !== `${accountId}.r2.cloudflarestorage.com`) {
    throw new Error('Storage backup endpoint does not match the configured R2 account identity.');
  }
  const retentionRuns = parseStorageBackupRetention(requiredStorageBackupConfig('SERVSYNC_STORAGE_BACKUP_RETENTION_DAYS'));
  return {
    sourceProjectRef,
    accountId,
    bucket,
    retentionRuns,
    source: createSupabaseStorageSource({
      url: sourceUrl,
      secretKey: requiredStorageBackupConfig('SERVSYNC_STORAGE_BACKUP_SOURCE_SECRET_KEY'),
    }),
    backup: createR2BackupStorage({
      accountId,
      bucket,
      endpoint,
      accessKeyId: requiredStorageBackupConfig('SERVSYNC_STORAGE_BACKUP_R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredStorageBackupConfig('SERVSYNC_STORAGE_BACKUP_R2_SECRET_ACCESS_KEY'),
    }),
  };
}
