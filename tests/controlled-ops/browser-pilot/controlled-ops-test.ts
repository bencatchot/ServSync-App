import { expect, test as base } from '@playwright/test';
import {
  BROWSER_OBSERVABILITY_ATTACHMENT_NAME,
  BROWSER_OBSERVABILITY_MIME_TYPE,
  applyEgressDecisionCounts,
  createBrowserObservabilityState,
  finalizeBrowserObservability,
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
    });
    const observePage = (pageToObserve) => observeBrowserPage(observability, pageToObserve);
    context.on('page', observePage);
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
    observePage(page);
    await use(page);
    context.off('page', observePage);
    applyEgressDecisionCounts(observability, guard.getDecisionCounts());
    const body = finalizeBrowserObservability(observability);
    await testInfo.attach(BROWSER_OBSERVABILITY_ATTACHMENT_NAME, {
      body,
      contentType: BROWSER_OBSERVABILITY_MIME_TYPE,
    });
    expect(guard.violationCount).toBe(0);
  },
});
