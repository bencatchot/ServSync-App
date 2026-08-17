import { createMarketingMediaCleanupHandler } from '../server/marketingMediaCleanupHttp.js';

export const maxDuration = 60;

export default { fetch: createMarketingMediaCleanupHandler() };
