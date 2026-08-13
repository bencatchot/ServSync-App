import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVSYNC_STORAGE_BUCKETS,
  parseManifestEnvelope,
  restoreStorageBackup,
  runStorageBackup,
  sha256,
  type BackupStorage,
  type RestoreTarget,
  type SourceStorage,
  type SourceStorageObject,
  type StorageBucket,
} from '../../server/storageBackup.ts';
import { storageBucketContractMatches } from '../../server/storageBackupProviders.ts';

const SOURCE_REF = 'uqgtheclhxqlnjpfmheq';
const ACCOUNT_ID = 'account-test';
const BACKUP_BUCKET = 'servsync-production-storage-backup';

class FakeSource implements SourceStorage {
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  projectRef = SOURCE_REF;

  constructor() {
    this.set('service-request-media', 'request/photo.jpg', 'first-version', 'image/jpeg');
  }

  set(bucket: string, path: string, value: string, contentType = 'text/plain') {
    this.objects.set(`${bucket}\u0000${path}`, { bytes: new TextEncoder().encode(value), contentType });
  }

  remove(bucket: string, path: string) {
    this.objects.delete(`${bucket}\u0000${path}`);
  }

  async identity() { return { projectRef: this.projectRef }; }

  async listBuckets(): Promise<StorageBucket[]> {
    return SERVSYNC_STORAGE_BUCKETS.map(name => ({
      name,
      public: ['contractor-assets', 'discover-media', 'email-assets'].includes(name),
      fileSizeLimit: null,
      allowedMimeTypes: null,
    }));
  }

  async listObjects(bucket: string): Promise<SourceStorageObject[]> {
    return [...this.objects.entries()]
      .filter(([identity]) => identity.startsWith(`${bucket}\u0000`))
      .map(([identity, object]) => ({
        path: identity.split('\u0000')[1],
        size: object.bytes.byteLength,
        contentType: object.contentType,
        updatedAt: '2026-08-13T00:00:00.000Z',
        sourceVersion: sha256(object.bytes),
      }));
  }

  async downloadObject(bucket: string, path: string) {
    const object = this.objects.get(`${bucket}\u0000${path}`);
    if (!object) throw new Error('missing source object');
    return object.bytes.slice();
  }
}

class FakeBackup implements BackupStorage {
  objects = new Map<string, Uint8Array>();
  accountId = ACCOUNT_ID;
  bucket = BACKUP_BUCKET;

  async identity() { return { accountId: this.accountId, bucket: this.bucket }; }
  async hasObject(key: string) { return this.objects.has(key); }
  async getObject(key: string) {
    const value = this.objects.get(key);
    if (!value) throw new Error('missing backup object');
    return value.slice();
  }
  async putObject(key: string, bytes: Uint8Array) { this.objects.set(key, bytes.slice()); }
  async listKeys(prefix: string) { return [...this.objects.keys()].filter(key => key.startsWith(prefix)); }
  async deleteObject(key: string) { this.objects.delete(key); }
}

class FakeTarget implements RestoreTarget {
  projectRef = 'recoveryprojectref';
  projectName = 'servsync-recovery-drill-test';
  buckets = new Map<string, StorageBucket>();
  objects = new Map<string, Uint8Array>();

  async identity() { return { projectRef: this.projectRef, projectName: this.projectName }; }
  async ensureBucket(bucket: StorageBucket) { this.buckets.set(bucket.name, bucket); }
  async putObject(bucket: string, path: string, bytes: Uint8Array) { this.objects.set(`${bucket}\u0000${path}`, bytes.slice()); }
  async downloadObject(bucket: string, path: string) {
    const value = this.objects.get(`${bucket}\u0000${path}`);
    if (!value) throw new Error('missing restored object');
    return value.slice();
  }
}

function clock(...values: string[]) {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]);
}

async function backup(source: FakeSource, destination: FakeBackup, runId: string, start: string) {
  return runStorageBackup({
    source,
    backup: destination,
    expectedSourceProjectRef: SOURCE_REF,
    expectedBackupAccountId: ACCOUNT_ID,
    expectedBackupBucket: BACKUP_BUCKET,
    runId,
    now: clock(start, new Date(Date.parse(start) + 1000).toISOString()),
  });
}

test('initial and unchanged backups are complete, hashed, and content-addressed', async () => {
  const source = new FakeSource();
  const destination = new FakeBackup();
  const first = await backup(source, destination, 'run-1', '2026-08-13T01:00:00.000Z');
  assert.equal(first.envelope.manifest.metrics.bucketCount, 7);
  assert.equal(first.envelope.manifest.metrics.sourceObjectCount, 1);
  assert.equal(first.envelope.manifest.metrics.newObjectVersions, 1);
  assert.equal(first.envelope.manifest.buckets.filter(bucket => bucket.objectCount === 0).length, 6);
  const object = first.envelope.manifest.objects[0];
  assert.equal(object.deleted, false);
  assert.equal(object.backupKey, `objects/${SOURCE_REF}/sha256/${object.sha256}`);
  assert.deepEqual(parseManifestEnvelope(await destination.getObject(first.manifestKey)), first.envelope);

  const second = await backup(source, destination, 'run-2', '2026-08-14T01:00:00.000Z');
  assert.equal(second.envelope.manifest.metrics.newObjectVersions, 0);
  assert.equal(second.envelope.manifest.metrics.unchangedObjectVersions, 1);
  assert.equal(destination.objects.size, 4, 'one content object, two immutable manifests, and one health pointer');
});

test('new, updated, and deleted objects preserve prior versions and create tombstones', async () => {
  const source = new FakeSource();
  const destination = new FakeBackup();
  const first = await backup(source, destination, 'run-1', '2026-08-13T01:00:00.000Z');
  source.set('home-documents', 'home/manual.pdf', 'new-document', 'application/pdf');
  const added = await backup(source, destination, 'run-2', '2026-08-14T01:00:00.000Z');
  assert.equal(added.envelope.manifest.metrics.newObjectVersions, 1);

  source.set('service-request-media', 'request/photo.jpg', 'second-version', 'image/jpeg');
  const updated = await backup(source, destination, 'run-3', '2026-08-15T01:00:00.000Z');
  assert.equal(updated.envelope.manifest.metrics.newObjectVersions, 1);
  assert.equal(await destination.hasObject(first.envelope.manifest.objects[0].backupKey), true);

  source.remove('service-request-media', 'request/photo.jpg');
  const deleted = await backup(source, destination, 'run-4', '2026-08-16T01:00:00.000Z');
  assert.equal(deleted.envelope.manifest.metrics.tombstoneCount, 1);
  assert.equal(deleted.envelope.manifest.objects.some(object => object.deleted && object.path === 'request/photo.jpg'), true);

  const currentTarget = new FakeTarget();
  const currentRestore = await restoreStorageBackup({
    backup: destination,
    target: currentTarget,
    manifestKey: deleted.manifestKey,
    expectedBackupAccountId: ACCOUNT_ID,
    expectedBackupBucket: BACKUP_BUCKET,
  });
  assert.equal(currentRestore.restoredObjects, 1);
  assert.equal(currentRestore.skippedObjects, 1);
  assert.equal(currentRestore.failedObjects, 0);
  assert.equal(currentTarget.objects.has('service-request-media\u0000request/photo.jpg'), false);

  const priorTarget = new FakeTarget();
  await restoreStorageBackup({
    backup: destination,
    target: priorTarget,
    manifestKey: first.manifestKey,
    expectedBackupAccountId: ACCOUNT_ID,
    expectedBackupBucket: BACKUP_BUCKET,
  });
  assert.equal(new TextDecoder().decode(priorTarget.objects.get('service-request-media\u0000request/photo.jpg')), 'first-version');
});

test('restore fails closed for corrupted, missing, or protected-target data', async () => {
  const source = new FakeSource();
  const destination = new FakeBackup();
  const result = await backup(source, destination, 'run-1', '2026-08-13T01:00:00.000Z');
  const object = result.envelope.manifest.objects[0];
  destination.objects.set(object.backupKey, new TextEncoder().encode('corrupted'));
  await assert.rejects(() => restoreStorageBackup({
    backup: destination,
    target: new FakeTarget(),
    manifestKey: result.manifestKey,
    expectedBackupAccountId: ACCOUNT_ID,
    expectedBackupBucket: BACKUP_BUCKET,
  }), /integrity validation/);

  destination.objects.delete(object.backupKey);
  await assert.rejects(() => restoreStorageBackup({
    backup: destination,
    target: new FakeTarget(),
    manifestKey: result.manifestKey,
    expectedBackupAccountId: ACCOUNT_ID,
    expectedBackupBucket: BACKUP_BUCKET,
  }), /missing backup object/);

  const protectedTarget = new FakeTarget();
  protectedTarget.projectRef = 'uqgtheclhxqlnjpfmheq';
  await assert.rejects(() => restoreStorageBackup({
    backup: destination,
    target: protectedTarget,
    manifestKey: result.manifestKey,
    expectedBackupAccountId: ACCOUNT_ID,
    expectedBackupBucket: BACKUP_BUCKET,
  }), /refuses Production, Demo, and Sandbox/);
});

test('backup refuses changed bucket inventories and source or destination identity mismatches', async () => {
  const source = new FakeSource();
  const destination = new FakeBackup();
  source.projectRef = 'wrong';
  await assert.rejects(() => backup(source, destination, 'run-1', '2026-08-13T01:00:00.000Z'), /source identity mismatch/);
  source.projectRef = SOURCE_REF;
  destination.accountId = 'wrong';
  await assert.rejects(() => backup(source, destination, 'run-2', '2026-08-13T01:00:00.000Z'), /destination identity mismatch/);

  destination.accountId = ACCOUNT_ID;
  source.listBuckets = async () => [];
  await assert.rejects(() => backup(source, destination, 'run-3', '2026-08-13T01:00:00.000Z'), /bucket inventory changed/);
});

test('retention keeps exactly 90 complete manifests', async () => {
  const source = new FakeSource();
  const destination = new FakeBackup();
  for (let index = 0; index < 91; index += 1) {
    await backup(source, destination, `run-${String(index).padStart(2, '0')}`, new Date(Date.UTC(2026, 0, index + 1)).toISOString());
  }
  assert.equal((await destination.listKeys(`manifests/${SOURCE_REF}/`)).length, 90);
  assert.equal((await destination.listKeys(`objects/${SOURCE_REF}/sha256/`)).length, 1);
});

test('retention failure does not advance the latest-success health pointer', async () => {
  const source = new FakeSource();
  const destination = new FakeBackup();
  for (let index = 0; index < 90; index += 1) {
    await backup(source, destination, `run-${String(index).padStart(2, '0')}`, new Date(Date.UTC(2026, 0, index + 1)).toISOString());
  }
  const healthKey = `health/${SOURCE_REF}/latest.json`;
  const previousHealth = await destination.getObject(healthKey);
  destination.deleteObject = async () => { throw new Error('retention unavailable'); };
  await assert.rejects(
    () => backup(source, destination, 'run-90', new Date(Date.UTC(2026, 3, 1)).toISOString()),
    /retention unavailable/,
  );
  assert.deepEqual(await destination.getObject(healthKey), previousHealth);
});

test('source enumeration and download failures do not advance latest-success health', async () => {
  for (const failure of ['enumeration', 'download'] as const) {
    const source = new FakeSource();
    const destination = new FakeBackup();
    await backup(source, destination, 'baseline', '2026-08-13T01:00:00.000Z');
    const healthKey = `health/${SOURCE_REF}/latest.json`;
    const previousHealth = await destination.getObject(healthKey);
    if (failure === 'enumeration') source.listObjects = async () => { throw new Error('enumeration unavailable'); };
    else source.downloadObject = async () => { throw new Error('download unavailable'); };
    await assert.rejects(
      () => backup(source, destination, `failed-${failure}`, '2026-08-14T01:00:00.000Z'),
      new RegExp(`${failure} unavailable`),
    );
    assert.deepEqual(await destination.getObject(healthKey), previousHealth);
  }
});

test('R2 object and manifest write failures do not advance latest-success health', async () => {
  for (const failure of ['object', 'manifest'] as const) {
    const source = new FakeSource();
    const destination = new FakeBackup();
    await backup(source, destination, 'baseline', '2026-08-13T01:00:00.000Z');
    const healthKey = `health/${SOURCE_REF}/latest.json`;
    const previousHealth = await destination.getObject(healthKey);
    source.set('service-request-media', 'request/photo.jpg', `changed-${failure}`, 'image/jpeg');
    const originalPut = destination.putObject.bind(destination);
    destination.putObject = async (key, bytes) => {
      if (failure === 'object' && key.startsWith(`objects/${SOURCE_REF}/`)) throw new Error('R2 upload unavailable');
      if (failure === 'manifest' && key.startsWith(`manifests/${SOURCE_REF}/`)) throw new Error('manifest unavailable');
      await originalPut(key, bytes);
    };
    await assert.rejects(
      () => backup(source, destination, `failed-${failure}`, '2026-08-14T01:00:00.000Z'),
      failure === 'object' ? /R2 upload unavailable/ : /manifest unavailable/,
    );
    assert.deepEqual(await destination.getObject(healthKey), previousHealth);
  }
});

test('restore bucket policy comparison requires exact privacy and upload limits', () => {
  const expected: StorageBucket = {
    name: 'home-documents',
    public: false,
    fileSizeLimit: 10_000_000,
    allowedMimeTypes: ['application/pdf', 'image/jpeg'],
  };
  assert.equal(storageBucketContractMatches({
    public: false,
    file_size_limit: 10_000_000,
    allowed_mime_types: ['image/jpeg', 'application/pdf'],
  }, expected), true);
  assert.equal(storageBucketContractMatches({
    public: true,
    file_size_limit: 10_000_000,
    allowed_mime_types: ['application/pdf', 'image/jpeg'],
  }, expected), false);
  assert.equal(storageBucketContractMatches({
    public: false,
    file_size_limit: null,
    allowed_mime_types: ['application/pdf', 'image/jpeg'],
  }, expected), false);
});
