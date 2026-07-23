import { expect, test as base } from '@playwright/test';
import {
  BROWSER_OBSERVABILITY_ATTACHMENT_NAME,
  BROWSER_OBSERVABILITY_MIME_TYPE,
  createBrowserObservabilityState,
  drainAndFinalizeBrowserObservability,
  observeBrowserContext,
  observeBrowserPage,
} from '../../../scripts/controlled-ops/browser-collectors.mjs';
import {
  assertBrowserLaunchContractFromEnv,
  assertReporterReady,
  createBrowserEgressGuard,
} from '../../../scripts/controlled-ops/browser-launch-policy.mjs';

export { expect };

export const test = base.extend({
  page: async ({ context, baseURL }, use, testInfo) => {
    const launch = assertBrowserLaunchContractFromEnv(process.env);
    assertReporterReady({
      descriptorPath: process.env.CONTROLLED_OPS_BROWSER_LAUNCH_DESCRIPTOR,
      expectedReporterPid: process.ppid,
      journalAuthSecret: process.env.CONTROLLED_OPS_BROWSER_JOURNAL_AUTH_SECRET,
      nonce: process.env.CONTROLLED_OPS_BROWSER_LAUNCH_NONCE,
    });
    const guard = createBrowserEgressGuard(baseURL);
    const observability = createBrowserObservabilityState({
      runId: launch.descriptor.run_id,
      testInfo,
      baseURL,
      sourceManifestDigest: launch.descriptor.source_manifest_digest,
    });
    observeBrowserContext(observability, context);
    await context.route('**/*', async (route) => {
      if (guard.shouldAllow(route.request().url())) await route.continue();
      else await route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', async (webSocket) => {
      if (!guard.shouldAllow(webSocket.url())) {
        guard.recordRejectedWebSocket();
        webSocket.close();
      }
    });
    const page = await context.newPage();
    observeBrowserPage(observability, page, { allowPrimary: true });
    await use(page);
    const body = await drainAndFinalizeBrowserObservability(observability, {
      context,
      decisionCounts: guard.getDecisionCounts(),
    });
    await testInfo.attach(BROWSER_OBSERVABILITY_ATTACHMENT_NAME, {
      body,
      contentType: BROWSER_OBSERVABILITY_MIME_TYPE,
    });
    expect(guard.violationCount).toBe(0);
  },
});
