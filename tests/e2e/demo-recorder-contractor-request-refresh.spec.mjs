import { expect, test } from '@playwright/test';

import { homeownerConnectServiceRequestScenario } from '../../scripts/demo/recorder/scenarios/homeowner-connect-service-request.mjs';

const HARNESS_ORIGIN = 'http://tut005-recorder.test';

test('TUT-005 reloads stale contractor state before exact Request retrieval', async ({ page }) => {
  const scenario = homeownerConnectServiceRequestScenario;
  const request = {
    title: scenario.request.title,
    description: scenario.request.description,
    home: scenario.property.nickname,
  };
  let persistedRequests = [];
  const browserErrors = [];
  const serverErrors = [];
  const providerRequests = [];

  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on('request', currentRequest => {
    if (/stripe|checkout|payment[-_]?intent|openai|resend/i.test(currentRequest.url())) {
      providerRequests.push(currentRequest.url());
    }
  });

  await page.route(`${HARNESS_ORIGIN}/**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/requests') {
      await route.fulfill({ json: persistedRequests });
      return;
    }
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html>
        <html>
          <body>
            <main>
              <h1>Service Requests</h1>
              <section id="request-list" aria-label="Contractor service requests"></section>
            </main>
            <script>
              const list = document.getElementById('request-list');
              fetch('/api/requests')
                .then(response => response.json())
                .then(requests => {
                  list.replaceChildren(...requests.map(request => {
                    const card = document.createElement('article');
                    card.dataset.testid = 'contractor-service-request-card';
                    const title = document.createElement('h2');
                    title.textContent = request.title;
                    const button = document.createElement('button');
                    button.textContent = 'View Request';
                    const details = document.createElement('div');
                    details.hidden = true;
                    const description = document.createElement('p');
                    description.textContent = request.description;
                    const home = document.createElement('p');
                    home.textContent = request.home;
                    details.append(description, home);
                    button.addEventListener('click', () => { details.hidden = false; });
                    card.append(title, button, details);
                    return card;
                  }));
                });
            </script>
          </body>
        </html>`,
    });
  });

  await page.goto(`${HARNESS_ORIGIN}/contractor`);
  const exactCard = page.getByTestId('contractor-service-request-card').filter({ hasText: request.title });
  await expect(exactCard).toHaveCount(0);

  // The homeowner-created Request now exists in the durable source, but this
  // already-open contractor page retains the list loaded before it existed.
  persistedRequests = [request];
  const persistedReadback = await page.evaluate(async () => (await fetch('/api/requests')).json());
  expect(persistedReadback).toEqual([request]);
  await expect(exactCard).toHaveCount(0);

  // This is the same explicit state refresh used by the recorder before its
  // unchanged exact contractor title/description/home assertions.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(exactCard).toBeVisible();
  await exactCard.getByRole('button', { name: 'View Request' }).click();
  await expect(exactCard.getByText(request.description, { exact: true })).toBeVisible();
  await expect(exactCard.getByText(request.home, { exact: true })).toBeVisible();
  await expect(exactCard).toContainText(request.title);

  expect(browserErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
  expect(providerRequests).toEqual([]);
});
