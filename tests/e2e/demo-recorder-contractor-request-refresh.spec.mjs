import { expect, test } from '@playwright/test';

import { homeownerConnectServiceRequestScenario } from '../../scripts/demo/recorder/scenarios/homeowner-connect-service-request.mjs';

const HARNESS_ORIGIN = 'http://tut005-recorder.test';

async function mountExpandedContractorRequest(page) {
  await page.goto('/');
  await page.evaluate(async request => {
    const dynamicImport = new Function('path', 'return import(path)');
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const reactDomModule = await dynamicImport('/node_modules/.vite/deps/react-dom_client.js');
    const appModule = await dynamicImport('/src/App.tsx');
    const requestDescriptionModule = await dynamicImport('/src/features/requests/ContractorServiceRequestDescription.tsx');
    const React = reactModule.default;
    const createRoot = reactDomModule.default.createRoot;
    document.body.innerHTML = '<main id="contractor-request-harness"></main>';
    createRoot(document.getElementById('contractor-request-harness')).render(
      React.createElement('article', { 'data-testid': 'contractor-service-request-card' },
        React.createElement('h2', null, request.title),
        React.createElement(requestDescriptionModule.ContractorServiceRequestDescription, { description: request.description }),
        React.createElement(appModule.ServiceRequestMessages, {
          messages: [{
            id: 'request-message',
            actor_role: 'homeowner',
            created_at: '2026-09-03T12:00:00.000Z',
            body: request.description,
          }],
          media: [],
        }),
        React.createElement('p', null, request.home),
      ),
    );
  }, {
    title: homeownerConnectServiceRequestScenario.request.title,
    description: homeownerConnectServiceRequestScenario.request.description,
    home: homeownerConnectServiceRequestScenario.property.nickname,
  });
}

test('TUT-005 scopes exact description verification to the rendered expanded Request detail', async ({ page }) => {
  const request = homeownerConnectServiceRequestScenario.request;
  await mountExpandedContractorRequest(page);

  const card = page.getByTestId('contractor-service-request-card').filter({ hasText: request.title });
  await expect(card.getByText(request.description, { exact: true })).toHaveCount(2);

  const expandedDescription = card.getByTestId('contractor-service-request-description');
  await expect(expandedDescription).toHaveCount(1);
  await expect(expandedDescription).toHaveText(request.description, { useInnerText: true });
  await expect(card).toContainText(homeownerConnectServiceRequestScenario.property.nickname);
});

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
