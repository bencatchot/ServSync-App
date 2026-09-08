export class DraftPreparationError extends Error {
  constructor(message: string, readonly noPostCreated = false) { super(message); }
}

/** Retains uploads and request identities across retries in one open composer. */
export function createPreparationSession() {
  const assets = new Map<object, string | null>();
  const requestsBySource = new Map<object, Map<string, { requestId: string; contentId?: string }>>();
  return {
    hasAsset: (source: object) => Boolean(assets.get(source)),
    async prepare(source: object, brief: string, acquire: () => Promise<string | null>, generate: (assetId: string | null, requestId: string) => Promise<string>) {
      if (!assets.has(source)) assets.set(source, await acquire());
      const assetId = assets.get(source) ?? null;
      const requests = requestsBySource.get(source) ?? new Map<string, { requestId: string; contentId?: string }>();
      requestsBySource.set(source, requests);
      const key = brief;
      const request = requests.get(key) ?? { requestId: crypto.randomUUID() };
      requests.set(key, request);
      if (request.contentId) return request.contentId;
      try {
        request.contentId = await generate(assetId, request.requestId);
        return request.contentId;
      } catch (error) {
        // Only an explicit server confirmation allows a fresh generation request.
        if (error instanceof DraftPreparationError && error.noPostCreated) requests.delete(key);
        throw error;
      }
    },
  };
}
