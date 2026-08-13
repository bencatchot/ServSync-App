import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type {
  BackupStorage,
  RestoreTarget,
  SourceStorage,
  SourceStorageObject,
  StorageBucket,
} from './storageBackup.ts';

type StorageListEntry = {
  id: string | null;
  name: string;
  updated_at?: string | null;
  metadata?: { size?: number; mimetype?: string; eTag?: string } | null;
};

type SupabaseBucketContract = {
  public: boolean;
  file_size_limit?: number | null;
  allowed_mime_types?: string[] | null;
};

export function storageBucketContractMatches(existing: SupabaseBucketContract, expected: StorageBucket) {
  const existingLimit = typeof existing.file_size_limit === 'number' ? existing.file_size_limit : null;
  const existingMimeTypes = Array.isArray(existing.allowed_mime_types) ? [...existing.allowed_mime_types].sort() : null;
  const expectedMimeTypes = expected.allowedMimeTypes ? [...expected.allowedMimeTypes].sort() : null;
  return existing.public === expected.public
    && existingLimit === expected.fileSizeLimit
    && JSON.stringify(existingMimeTypes) === JSON.stringify(expectedMimeTypes);
}

function projectRefFromUrl(url: string) {
  const host = new URL(url).hostname;
  const projectRef = host.split('.')[0];
  if (!projectRef) throw new Error('Supabase project URL is invalid.');
  return projectRef;
}

function createServerSupabase(url: string, secretKey: string) {
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function listBucketObjects(client: SupabaseClient, bucket: string) {
  const results: SourceStorageObject[] = [];
  const visit = async (prefix: string): Promise<void> => {
    let offset = 0;
    while (true) {
      const { data, error } = await client.storage.from(bucket).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(`Storage object enumeration failed for bucket ${bucket}.`);
      const entries = (data ?? []) as StorageListEntry[];
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null) {
          await visit(path);
        } else {
          const size = Number(entry.metadata?.size);
          if (!Number.isSafeInteger(size) || size < 0) throw new Error('Storage object size metadata is invalid.');
          results.push({
            path,
            size,
            contentType: entry.metadata?.mimetype ?? null,
            updatedAt: entry.updated_at ?? null,
            sourceVersion: entry.metadata?.eTag ?? entry.id,
          });
        }
      }
      if (entries.length < 100) break;
      offset += entries.length;
    }
  };
  await visit('');
  return results;
}

export function createSupabaseStorageSource(config: { url: string; secretKey: string }): SourceStorage {
  const client = createServerSupabase(config.url, config.secretKey);
  const projectRef = projectRefFromUrl(config.url);
  return {
    identity: async () => ({ projectRef }),
    listBuckets: async () => {
      const { data, error } = await client.storage.listBuckets();
      if (error) throw new Error('Storage bucket enumeration failed.');
      return (data ?? []).map(bucket => ({
        name: bucket.name,
        public: bucket.public,
        fileSizeLimit: typeof bucket.file_size_limit === 'number' ? bucket.file_size_limit : null,
        allowedMimeTypes: Array.isArray(bucket.allowed_mime_types) ? bucket.allowed_mime_types : null,
      }));
    },
    listObjects: bucket => listBucketObjects(client, bucket),
    downloadObject: async (bucket, path) => {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) throw new Error(`Storage object download failed for bucket ${bucket}.`);
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

function createR2Client(config: { endpoint: string; accessKeyId: string; secretAccessKey: string }) {
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

export function createR2BackupStorage(config: {
  accountId: string;
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}): BackupStorage {
  const client = createR2Client(config);
  return {
    identity: async () => ({ accountId: config.accountId, bucket: config.bucket }),
    hasObject: async key => {
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        return true;
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404) return false;
        throw error;
      }
    },
    getObject: async key => {
      const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      if (!response.Body) throw new Error('Independent backup object was empty or unavailable.');
      return response.Body.transformToByteArray();
    },
    putObject: async (key, bytes, options) => {
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: bytes,
        ContentType: options.contentType,
        Metadata: options.metadata,
      }));
    },
    listKeys: async prefix => {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }));
        for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key);
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
      return keys;
    },
    deleteObject: async key => {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}

export function createSupabaseRestoreTarget(config: {
  url: string;
  secretKey: string;
  projectName: string;
}): RestoreTarget {
  const client = createServerSupabase(config.url, config.secretKey);
  const projectRef = projectRefFromUrl(config.url);
  return {
    identity: async () => ({ projectRef, projectName: config.projectName }),
    ensureBucket: async bucket => {
      const { data, error } = await client.storage.listBuckets();
      if (error) throw new Error('Recovery bucket inventory failed.');
      const existing = (data ?? []).find(candidate => candidate.name === bucket.name);
      if (!existing) {
        const result = await client.storage.createBucket(bucket.name, {
          public: bucket.public,
          fileSizeLimit: bucket.fileSizeLimit ?? undefined,
          allowedMimeTypes: bucket.allowedMimeTypes ?? undefined,
        });
        if (result.error) throw new Error(`Recovery bucket creation failed for ${bucket.name}.`);
      } else {
        if (!storageBucketContractMatches(existing, bucket)) {
          throw new Error(`Recovery bucket contract mismatch for ${bucket.name}.`);
        }
      }
    },
    putObject: async (bucket, path, bytes, contentType) => {
      const { error } = await client.storage.from(bucket).upload(path, bytes, {
        contentType: contentType ?? 'application/octet-stream',
        upsert: true,
      });
      if (error) throw new Error(`Storage recovery write failed for bucket ${bucket}.`);
    },
    downloadObject: async (bucket, path) => {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) throw new Error(`Storage recovery verification failed for bucket ${bucket}.`);
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
