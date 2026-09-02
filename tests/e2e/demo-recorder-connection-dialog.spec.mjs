import { expect, test } from '@playwright/test';

import { replaceRecorderFieldValue } from '../../scripts/demo/recorder/lib.mjs';
import { homeownerConnectServiceRequestScenario } from '../../scripts/demo/recorder/scenarios/homeowner-connect-service-request.mjs';

async function mountConnectionDialog(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)');
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const reactDomModule = await dynamicImport('/node_modules/.vite/deps/react-dom_client.js');
    const appModule = await dynamicImport('/src/App.tsx');
    const React = reactModule.default;
    const createRoot = reactDomModule.default.createRoot;
    const now = '2026-09-02T12:00:00.000Z';
    const home = {
      id: 'demo-bay-home',
      homeowner_user_id: 'fictional-homeowner',
      nickname: 'Demo Bay Home',
      address_line1: '100 Demo Bay Drive',
      address_line2: '',
      city: 'Clearwater',
      state: 'FL',
      zip_code: '33755',
      home_type: 'Single family',
      year_built: '1998',
      square_feet: '1800',
      notes: '',
      home_photo_path: '',
      created_at: now,
      updated_at: now,
    };
    document.body.innerHTML = '<main id="connection-dialog-harness"></main>';
    createRoot(document.getElementById('connection-dialog-harness')).render(React.createElement(
      appModule.ContextualConnectionRequestModal,
      {
        contractor: {
          id: 'gulf-coast-home-services',
          business_name: 'Gulf Coast Home Services',
          city: 'Clearwater',
          state: 'FL',
          service_categories: ['Plumbing'],
        },
        homes: [home],
        initialHomeId: home.id,
        submitting: false,
        onSubmit: async () => {},
        onClose: () => {},
      },
    ));
  });
}

test('TUT-005 pins and exactly verifies the rendered controlled Optional message field', async ({ page }) => {
  await mountConnectionDialog(page);
  const canonicalMessage = homeownerConnectServiceRequestScenario.connection.message;
  const messageField = page.getByLabel('Optional message', { exact: true });
  await expect(messageField).toBeVisible();
  const pinnedField = await messageField.elementHandle();
  expect(pinnedField).not.toBeNull();
  await messageField.evaluate(element => {
    window.__tut005MessageField = element;
    window.__tut005InputEvents = 0;
    element.addEventListener('input', () => { window.__tut005InputEvents += 1; });
  });

  await replaceRecorderFieldValue(() => messageField, canonicalMessage, 25);

  expect(await pinnedField.inputValue()).toBe(canonicalMessage);
  await expect(messageField).toHaveCount(0);
  const valueExpandedLabel = page.getByLabel(/Optional message/i);
  await expect(valueExpandedLabel).toHaveValue(canonicalMessage);
  expect(await valueExpandedLabel.evaluate(element => element === window.__tut005MessageField)).toBe(true);
  expect(await page.evaluate(() => window.__tut005InputEvents)).toBe(canonicalMessage.length);
  await expect(page.getByRole('dialog', { name: /Share property access with Gulf Coast Home Services/i })).toBeVisible();
});
