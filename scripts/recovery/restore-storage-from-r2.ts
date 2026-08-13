#!/usr/bin/env node
import { restoreStorageBackup } from '../../server/storageBackup.ts';
import { storageBackupConfig } from '../../server/storageBackupConfig.ts';
import { createSupabaseRestoreTarget } from '../../server/storageBackupProviders.ts';

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : '';
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required and is never printed.`);
  return value;
}

const manifestKey = argument('--manifest-key');
if (!manifestKey) throw new Error('--manifest-key is required.');
const expectedTargetRef = argument('--target-project-ref');
if (!expectedTargetRef) throw new Error('--target-project-ref is required.');
const targetUrl = required('SERVSYNC_STORAGE_RESTORE_TARGET_URL');
if (new URL(targetUrl).hostname !== `${expectedTargetRef}.supabase.co`) {
  throw new Error('Storage restore target URL does not match --target-project-ref.');
}

const config = storageBackupConfig();
const result = await restoreStorageBackup({
  backup: config.backup,
  target: createSupabaseRestoreTarget({
    url: targetUrl,
    secretKey: required('SERVSYNC_STORAGE_RESTORE_TARGET_SECRET_KEY'),
    projectName: required('SERVSYNC_STORAGE_RESTORE_TARGET_NAME'),
  }),
  manifestKey,
  expectedBackupAccountId: config.accountId,
  expectedBackupBucket: config.bucket,
});
console.log(JSON.stringify({ status: 'complete', ...result }, null, 2));
