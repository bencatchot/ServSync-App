import { readBackupHealth } from '../server/storageBackup.js';
import { storageBackupConfig } from '../server/storageBackupConfig.js';
import { createStorageBackupHealthHandler } from '../server/storageBackupHttp.js';

const handler = createStorageBackupHealthHandler({ configured: storageBackupConfig, read: readBackupHealth, now: () => new Date() });
export default { fetch: handler };
