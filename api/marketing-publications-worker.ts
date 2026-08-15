import { createMarketingPublishingHandler } from '../server/marketingPublishingHttp.js';

export const maxDuration = 60;

export default { fetch: createMarketingPublishingHandler() };
