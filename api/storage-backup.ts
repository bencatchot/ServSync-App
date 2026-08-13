import { runStorageBackup } from '../server/storageBackup.js';
import { storageBackupConfig } from '../server/storageBackupConfig.js';
import { createStorageBackupHandler } from '../server/storageBackupHttp.js';

export const maxDuration = 300;

const handler = createStorageBackupHandler({ configured: storageBackupConfig, run: runStorageBackup });
export default { fetch: handler };
