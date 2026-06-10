import { expect, type Page, type TestInfo } from '@playwright/test';

const IGNORED_CONSOLE_ERROR_PATTERNS = [
  /favicon/i,
  /ResizeObserver loop/i,
];

export function captureMajorConsoleErrors(page: Page) {
  const errors: string[] = [];

  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (IGNORED_CONSOLE_ERROR_PATTERNS.some(pattern => pattern.test(text))) return;
    errors.push(`console.error: ${text}`);
  });

  page.on('pageerror', error => {
    errors.push(`pageerror: ${error.message}`);
  });

  return {
    async assertClean(testInfo: TestInfo) {
      if (errors.length > 0) {
        await testInfo.attach('console-errors.txt', {
          body: errors.join('\n'),
          contentType: 'text/plain',
        });
      }
      expect(errors).toEqual([]);
    },
  };
}
