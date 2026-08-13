import { createHash, randomUUID } from 'node:crypto';

export const STORAGE_BACKUP_MANIFEST_VERSION = 1 as const;
export const STORAGE_BACKUP_RETENTION_RUNS = 90;
export const SERVSYNC_STORAGE_BUCKETS = [
  'contractor-assets',
  'discover-media',
  'email-assets',
  'home-documents',
  'inspection-media',
  'service-request-media',
  'support-attachments',
] as const;
export const PROTECTED_SERVSYNC_PROJECT_REFS = new Set([
  'uqgtheclhxqlnjpfmheq',
  'bdytwgejqnlblhrnqxkp',
  'zpzdkoaubyjtsomccxya',
]);

export type StorageBucket = {
  name: string;
  public: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
};

export type SourceStorageObject = {
  path: string;
  size: number;
  contentType: string | null;
  updatedAt: string | null;
  sourceVersion: string | null;
};

export type ManifestObject = SourceStorageObject & {
  bucket: string;
  backupKey: string;
  backupTimestamp: string;
  sha256: string;
  deleted: false;
};

export type ManifestTombstone = {
  bucket: string;
  path: string;
  backupKey: string;
  sha256: string;
  size: number;
  contentType: string | null;
  sourceVersion: string | null;
  updatedAt: string | null;
  backupTimestamp: string;
  deleted: true;
  deletedAt: string;
};

export type StorageBackupManifest = {
  manifestVersion: typeof STORAGE_BACKUP_MANIFEST_VERSION;
  runId: string;
  sourceProjectRef: string;
  startedAt: string;
  completedAt: string;
  status: 'complete';
  buckets: Array<StorageBucket & { objectCount: number; totalBytes: number }>;
  objects: Array<ManifestObject | ManifestTombstone>;
  metrics: {
    bucketCount: number;
    sourceObjectCount: number;
    sourceBytes: number;
    backedUpObjectCount: number;
    newObjectVersions: number;
    unchangedObjectVersions: number;
    tombstoneCount: number;
    failedObjectCount: 0;
    r2BytesWritten: number;
  };
};

export type ManifestEnvelope = {
  manifestSha256: string;
  manifest: StorageBackupManifest;
};

export type BackupHealth = {
  healthVersion: 1;
  status: 'healthy';
  sourceProjectRef: string;
  lastSuccessfulBackupAt: string;
  lastRunId: string;
  manifestKey: string;
  manifestSha256: string;
  metrics: StorageBackupManifest['metrics'];
};

export type SourceStorage = {
  identity(): Promise<{ projectRef: string }>;
  listBuckets(): Promise<StorageBucket[]>;
  listObjects(bucket: string): Promise<SourceStorageObject[]>;
  downloadObject(bucket: string, path: string): Promise<Uint8Array>;
};

export type BackupStorage = {
  identity(): Promise<{ accountId: string; bucket: string }>;
  hasObject(key: string): Promise<boolean>;
  getObject(key: string): Promise<Uint8Array>;
  putObject(key: string, bytes: Uint8Array, options: { contentType: string; metadata?: Record<string, string> }): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
  deleteObject(key: string): Promise<void>;
};

export type RestoreTarget = {
  identity(): Promise<{ projectRef: string; projectName: string }>;
  ensureBucket(bucket: StorageBucket): Promise<void>;
  putObject(bucket: string, path: string, bytes: Uint8Array, contentType: string | null): Promise<void>;
  downloadObject(bucket: string, path: string): Promise<Uint8Array>;
};

export function sha256(bytes: Uint8Array | string) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, stableValue(record[key])]));
  }
  return value;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export function createManifestEnvelope(manifest: StorageBackupManifest): ManifestEnvelope {
  return { manifestSha256: sha256(canonicalJson(manifest)), manifest };
}

export function parseManifestEnvelope(bytes: Uint8Array): ManifestEnvelope {
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object') throw new Error('Backup manifest is malformed.');
  const envelope = value as ManifestEnvelope;
  if (envelope.manifest?.manifestVersion !== STORAGE_BACKUP_MANIFEST_VERSION) {
    throw new Error('Backup manifest version is unsupported.');
  }
  if (sha256(canonicalJson(envelope.manifest)) !== envelope.manifestSha256) {
    throw new Error('Backup manifest integrity verification failed.');
  }
  return envelope;
}

function objectIdentity(bucket: string, path: string) {
  return `${bucket}\u0000${path}`;
}

function manifestPrefix(projectRef: string) {
  return `manifests/${projectRef}/`;
}

function healthKey(projectRef: string) {
  return `health/${projectRef}/latest.json`;
}

async function readLatestManifest(backup: BackupStorage, projectRef: string) {
  const key = healthKey(projectRef);
  if (!await backup.hasObject(key)) return null;
  const health = JSON.parse(new TextDecoder().decode(await backup.getObject(key))) as BackupHealth;
  if (health.sourceProjectRef !== projectRef || health.status !== 'healthy' || !health.manifestKey) {
    throw new Error('Backup health identity is invalid.');
  }
  return parseManifestEnvelope(await backup.getObject(health.manifestKey));
}

async function verifyBackupObject(backup: BackupStorage, key: string, expectedHash: string) {
  const restored = await backup.getObject(key);
  if (sha256(restored) !== expectedHash) throw new Error('Independent backup hash verification failed.');
}

async function pruneRetainedRuns(backup: BackupStorage, projectRef: string, retainRuns: number) {
  const keys = (await backup.listKeys(manifestPrefix(projectRef))).sort().reverse();
  const retained = keys.slice(0, retainRuns);
  const expired = keys.slice(retainRuns);
  if (expired.length === 0) return { expiredManifests: 0, expiredObjects: 0 };

  const referenced = new Set<string>();
  for (const key of retained) {
    const envelope = parseManifestEnvelope(await backup.getObject(key));
    for (const object of envelope.manifest.objects) referenced.add(object.backupKey);
  }
  for (const key of expired) await backup.deleteObject(key);

  let expiredObjects = 0;
  for (const key of await backup.listKeys(`objects/${projectRef}/sha256/`)) {
    if (!referenced.has(key)) {
      await backup.deleteObject(key);
      expiredObjects += 1;
    }
  }
  return { expiredManifests: expired.length, expiredObjects };
}

export async function runStorageBackup(options: {
  source: SourceStorage;
  backup: BackupStorage;
  expectedSourceProjectRef: string;
  expectedBackupAccountId: string;
  expectedBackupBucket: string;
  now?: () => Date;
  runId?: string;
  retainRuns?: number;
}) {
  const startedAt = (options.now?.() ?? new Date()).toISOString();
  const runId = options.runId ?? randomUUID();
  const [sourceIdentity, backupIdentity] = await Promise.all([
    options.source.identity(),
    options.backup.identity(),
  ]);
  if (sourceIdentity.projectRef !== options.expectedSourceProjectRef) {
    throw new Error('Storage backup source identity mismatch.');
  }
  if (backupIdentity.accountId !== options.expectedBackupAccountId || backupIdentity.bucket !== options.expectedBackupBucket) {
    throw new Error('Storage backup destination identity mismatch.');
  }

  const buckets = (await options.source.listBuckets()).sort((a, b) => a.name.localeCompare(b.name));
  const expectedBuckets = [...SERVSYNC_STORAGE_BUCKETS].sort();
  const actualBucketNames = buckets.map(bucket => bucket.name);
  if (canonicalJson(actualBucketNames) !== canonicalJson(expectedBuckets)) {
    throw new Error('Storage bucket inventory changed; backup scope requires review.');
  }

  const previous = await readLatestManifest(options.backup, sourceIdentity.projectRef);
  const previousActive = new Map<string, ManifestObject>();
  for (const object of previous?.manifest.objects ?? []) {
    if (object.deleted === false) previousActive.set(objectIdentity(object.bucket, object.path), object);
  }

  const objects: Array<ManifestObject | ManifestTombstone> = [];
  const currentIdentities = new Set<string>();
  const bucketEvidence: StorageBackupManifest['buckets'] = [];
  let sourceBytes = 0;
  let newObjectVersions = 0;
  let unchangedObjectVersions = 0;
  let r2BytesWritten = 0;

  for (const bucket of buckets) {
    const listed = await options.source.listObjects(bucket.name);
    let bucketBytes = 0;
    for (const sourceObject of listed) {
      const identity = objectIdentity(bucket.name, sourceObject.path);
      if (currentIdentities.has(identity)) throw new Error('Storage source returned a duplicate object path.');
      currentIdentities.add(identity);
      const bytes = await options.source.downloadObject(bucket.name, sourceObject.path);
      if (bytes.byteLength !== sourceObject.size) throw new Error('Storage source byte size did not match object metadata.');
      const contentHash = sha256(bytes);
      const backupKey = `objects/${sourceIdentity.projectRef}/sha256/${contentHash}`;
      if (await options.backup.hasObject(backupKey)) {
        await verifyBackupObject(options.backup, backupKey, contentHash);
        unchangedObjectVersions += 1;
      } else {
        await options.backup.putObject(backupKey, bytes, {
          contentType: sourceObject.contentType ?? 'application/octet-stream',
          metadata: { sha256: contentHash },
        });
        await verifyBackupObject(options.backup, backupKey, contentHash);
        newObjectVersions += 1;
        r2BytesWritten += bytes.byteLength;
      }
      sourceBytes += bytes.byteLength;
      bucketBytes += bytes.byteLength;
      objects.push({
        ...sourceObject,
        bucket: bucket.name,
        size: bytes.byteLength,
        backupKey,
        backupTimestamp: startedAt,
        sha256: contentHash,
        deleted: false,
      });
    }
    bucketEvidence.push({ ...bucket, objectCount: listed.length, totalBytes: bucketBytes });
  }

  for (const [identity, object] of previousActive) {
    if (!currentIdentities.has(identity)) {
      objects.push({ ...object, deleted: true, deletedAt: startedAt });
    }
  }
  objects.sort((a, b) => objectIdentity(a.bucket, a.path).localeCompare(objectIdentity(b.bucket, b.path)));
  const tombstoneCount = objects.filter(object => object.deleted).length;
  const completedAt = (options.now?.() ?? new Date()).toISOString();
  const manifest: StorageBackupManifest = {
    manifestVersion: STORAGE_BACKUP_MANIFEST_VERSION,
    runId,
    sourceProjectRef: sourceIdentity.projectRef,
    startedAt,
    completedAt,
    status: 'complete',
    buckets: bucketEvidence,
    objects,
    metrics: {
      bucketCount: buckets.length,
      sourceObjectCount: currentIdentities.size,
      sourceBytes,
      backedUpObjectCount: currentIdentities.size,
      newObjectVersions,
      unchangedObjectVersions,
      tombstoneCount,
      failedObjectCount: 0,
      r2BytesWritten,
    },
  };
  const envelope = createManifestEnvelope(manifest);
  const safeTimestamp = completedAt.replace(/[:.]/g, '-');
  const manifestKey = `${manifestPrefix(sourceIdentity.projectRef)}${safeTimestamp}-${runId}.json`;
  const manifestBytes = new TextEncoder().encode(canonicalJson(envelope));
  await options.backup.putObject(manifestKey, manifestBytes, { contentType: 'application/json' });
  const verifiedEnvelope = parseManifestEnvelope(await options.backup.getObject(manifestKey));
  if (verifiedEnvelope.manifestSha256 !== envelope.manifestSha256) {
    throw new Error('Written backup manifest did not verify.');
  }
  const health: BackupHealth = {
    healthVersion: 1,
    status: 'healthy',
    sourceProjectRef: sourceIdentity.projectRef,
    lastSuccessfulBackupAt: completedAt,
    lastRunId: runId,
    manifestKey,
    manifestSha256: envelope.manifestSha256,
    metrics: manifest.metrics,
  };
  const retention = await pruneRetainedRuns(options.backup, sourceIdentity.projectRef, options.retainRuns ?? STORAGE_BACKUP_RETENTION_RUNS);
  await options.backup.putObject(healthKey(sourceIdentity.projectRef), new TextEncoder().encode(canonicalJson(health)), {
    contentType: 'application/json',
  });
  return { manifestKey, envelope, health, retention };
}

export async function readBackupHealth(backup: BackupStorage, projectRef: string): Promise<BackupHealth> {
  const bytes = await backup.getObject(healthKey(projectRef));
  const health = JSON.parse(new TextDecoder().decode(bytes)) as BackupHealth;
  if (health.healthVersion !== 1 || health.sourceProjectRef !== projectRef || health.status !== 'healthy') {
    throw new Error('Storage backup health record is invalid.');
  }
  const envelope = parseManifestEnvelope(await backup.getObject(health.manifestKey));
  if (envelope.manifestSha256 !== health.manifestSha256 || envelope.manifest.runId !== health.lastRunId) {
    throw new Error('Storage backup health does not match its manifest.');
  }
  return health;
}

export async function restoreStorageBackup(options: {
  backup: BackupStorage;
  target: RestoreTarget;
  manifestKey: string;
  expectedBackupAccountId: string;
  expectedBackupBucket: string;
}) {
  const [backupIdentity, targetIdentity] = await Promise.all([options.backup.identity(), options.target.identity()]);
  if (backupIdentity.accountId !== options.expectedBackupAccountId || backupIdentity.bucket !== options.expectedBackupBucket) {
    throw new Error('Storage restore destination identity mismatch.');
  }
  if (PROTECTED_SERVSYNC_PROJECT_REFS.has(targetIdentity.projectRef)) {
    throw new Error('Storage restore refuses Production, Demo, and Sandbox targets.');
  }
  if (!targetIdentity.projectName.startsWith('servsync-recovery-drill-')) {
    throw new Error('Storage restore target name must use the servsync-recovery-drill- prefix.');
  }

  const envelope = parseManifestEnvelope(await options.backup.getObject(options.manifestKey));
  for (const bucket of envelope.manifest.buckets) await options.target.ensureBucket(bucket);
  let restoredObjects = 0;
  let restoredBytes = 0;
  let skippedObjects = 0;
  for (const object of envelope.manifest.objects) {
    if (object.deleted) {
      skippedObjects += 1;
      continue;
    }
    const bytes = await options.backup.getObject(object.backupKey);
    if (bytes.byteLength !== object.size || sha256(bytes) !== object.sha256) {
      throw new Error('Storage restore source object failed integrity validation.');
    }
    await options.target.putObject(object.bucket, object.path, bytes, object.contentType);
    const restored = await options.target.downloadObject(object.bucket, object.path);
    if (restored.byteLength !== object.size || sha256(restored) !== object.sha256) {
      throw new Error('Restored Storage object failed integrity validation.');
    }
    restoredObjects += 1;
    restoredBytes += restored.byteLength;
  }
  return {
    targetProjectRef: targetIdentity.projectRef,
    sourceProjectRef: envelope.manifest.sourceProjectRef,
    runId: envelope.manifest.runId,
    restoredObjects,
    skippedObjects,
    failedObjects: 0,
    restoredBytes,
    hashVerification: 'passed' as const,
  };
}
