import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

const DEFAULT_OUTPUT_DIR = 'marketing-screenshots';

export function screenshotPath(testInfo: TestInfo, name: string) {
  const outputDir = resolve(process.cwd(), process.env.MARKETING_SCREENSHOT_OUTPUT_DIR || DEFAULT_OUTPUT_DIR);
  mkdirSync(outputDir, { recursive: true });
  return resolve(outputDir, `${testInfo.project.name}-${name}.png`);
}

export async function captureMarketingScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: screenshotPath(testInfo, name),
    fullPage: true,
    animations: 'disabled',
  });
}
