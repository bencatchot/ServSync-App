import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function openFictionalRecords(page: Page) {
  const userId = '10000000-0000-4000-8000-000000000001';
  const homeId = '20000000-0000-4000-8000-000000000001';
  const companyId = '30000000-0000-4000-8000-000000000001';
  const profile = { id: userId, role: 'homeowner', email: 'records@example.test', full_name: 'Fixture Owner' };
  const now = '2026-09-01T12:00:00Z';
  const home = { id: homeId, homeowner_user_id: userId, nickname: 'Fixture Cottage', notes: '', address_line1: '1 Fictional Way', city: 'Test City', state: 'AL', zip_code: '36532', created_at: now };
  const invoices = Array.from({ length: 16 }, (_, i) => ({
    id: `fixture-invoice-${i}`, invoice_number: `QA-${i}`, title: `Fixture repair ${i}`, status: 'viewed',
    contractor_id: companyId, homeowner_user_id: userId, home_id: homeId,
    scope: '', notes: '', terms: '', total_cents: 15000, subtotal_cents: 15000, amount_paid_cents: 0,
    issued_at: now, updated_at: now, created_at: now, line_items: [], backlog_items: [],
  }));
  const claims = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', exp: Date.now() / 1000 + 3600 })).toString('base64url');
  const session = {
    user: { id: userId, email: profile.email, aud: 'authenticated', role: 'authenticated', user_metadata: { role: 'homeowner' }, app_metadata: { provider: 'email' } },
    access_token: `eyJhbGciOiJIUzI1NiJ9.${claims}.fixture`, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600,
  };
  const replies: Record<string, unknown> = {
    token: session, profiles: [profile], homeowner_profiles: [{ user_id: userId, display_name: profile.full_name }],
    homes: [home, { ...home, id: '20000000-0000-4000-8000-000000000002', nickname: 'Fixture Cabin' }], invoices,
    servsync_get_homeowner_connections: [{ contractor_id: companyId, connection_id: 'fixture-connection', business_name: 'Fixture Plumbing', status: 'active', shared_properties: [] }],
  };
  const appOrigin = new URL(process.env.TEST_APP_URL!).origin;
  await page.routeWebSocket(/.*/, socket => socket.close());
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'records-fixture.invalid' || url.hostname.endsWith('.supabase.co')) {
      return route.fulfill({ json: replies[url.pathname.split('/').pop()!] ?? [] });
    }
    if (url.origin === appOrigin && !url.pathname.startsWith('/api/') && route.request().method() === 'GET') return route.continue();
    return route.abort();
  });
  await page.addInitScript(() => localStorage.setItem('servsync.homeowner.activeTab', 'estimates'));
  await page.goto('/#/homeowner');
  await page.getByLabel('Email', { exact: true }).fill(profile.email);
  await page.getByLabel('Password', { exact: true }).fill('fictional-only');
  await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole(page.viewportSize()!.width < 768 ? 'tabpanel' : 'region', { name: /^Open Invoices/ })).toBeVisible();
}

for (const [width, height] of [[320, 568], [375, 667], [390, 844], [440, 956], [1280, 900]]) {
  test(`homeowner sections, filters and PDF return at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    if (width === 375) await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFictionalRecords(page);
    // Exercise the native shell's inner scroller and synthetic notch/home indicator.
    if (width === 390) {
      await page.addStyleTag({ content: readFileSync('src/mobile/native.css', 'utf8') });
      await page.evaluate(() => {
        document.documentElement.classList.add('servsync-native');
        document.documentElement.style.setProperty('--safe-area-inset-top', '47px');
        document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px');
      });
    }
    const mobile = width < 768;
    const section = page.getByRole('tablist', { name: 'Record sections' });
    const tab = (name: string) => section.getByRole('tab', { name: new RegExp('^' + name) });
    const results = page.getByRole(mobile ? 'tabpanel' : 'region', { name: /^Open Invoices/ });
    const pick = async (title: string) => {
      if (mobile) await tab(title).click();
      else await page.getByRole('button', { name: new RegExp('^' + title) }).click();
    };
    const initialTabsTop = mobile ? (await section.boundingBox())!.y : 0;
    if (mobile) {
      await expect(results.getByText('Fixture repair 0', { exact: true })).toBeInViewport();
      const navigation = page.getByRole('navigation', { name: /Homeowner Portal mobile/ });
      const bounds = (await results.boundingBox())!;
      expect(bounds.y + bounds.height).toBeLessThanOrEqual((await navigation.boundingBox())!.y + 1);
      if (width === 390) expect(initialTabsTop).toBeGreaterThan(47);
      await expect(tab('Open Invoices')).toHaveAttribute('aria-selected', 'true');
      await expect(section.locator('[tabindex="0"]')).toHaveCount(1);
      await expect(tab('Open Invoices')).toBeInViewport({ ratio: 0.99 });
      const right = page.getByRole('button', { name: 'Scroll sections right' });
      const left = page.getByRole('button', { name: 'Scroll sections left' });
      const outerPosition = () => page.evaluate(() => [
        window.scrollY, document.querySelector('.workspace-content')!.scrollTop,
      ]);
      const originalPosition = await outerPosition();
      const front = section.locator('[data-front] [role="tab"]');
      await expect(front).toHaveAccessibleName(/^Open Invoices/);
      if (width === 320 || width === 390) {
        await testInfo.attach('wheel-at-rest', { body: await page.screenshot(), contentType: 'image/png' });
      }
      await right.click();
      await expect(front).toHaveAccessibleName(/^Accepted Estimates/);
      await expect(tab('Open Invoices')).toHaveAttribute('aria-selected', 'true');
      await expect(results).toBeVisible();
      // Inspect the rendered projection, not just the identity of the front slot.
      const shape = await section.evaluate(el => {
        const front = el.querySelector<HTMLElement>('[data-front] [role="tab"]')!;
        const back = el.querySelector<HTMLElement>('[aria-selected="true"]')!;
        const matrix = (button: HTMLElement) => new DOMMatrix(getComputedStyle(button).transform === 'none' ? undefined : getComputedStyle(button).transform);
        return {
          frontWidth: front.getBoundingClientRect().width, backWidth: back.getBoundingClientRect().width,
          frontLayer: Number(getComputedStyle(front.parentElement!).zIndex), backLayer: Number(getComputedStyle(back.parentElement!).zIndex),
          frontTilt: Math.abs(matrix(front).m13), backTilt: Math.abs(matrix(back).m13),
        };
      });
      expect(shape.frontLayer).toBeGreaterThan(shape.backLayer);
      expect(shape.frontWidth).toBeGreaterThan(shape.backWidth);
      expect(shape.frontTilt).toBeLessThan(0.02);
      if (width === 375) expect(shape.backTilt).toBe(0);
      else expect(shape.backTilt).toBeGreaterThan(0.25);
      expect(await outerPosition()).toEqual(originalPosition);
      if (width === 320 || width === 390) {
        await testInfo.attach('wheel-browsed', { body: await page.screenshot(), contentType: 'image/png' });
      }
      await left.click();
      await expect(front).toHaveAccessibleName(/^Open Invoices/);
      // Tap just beyond the raised face on each side, where its neighbor appears tucked under it.
      for (const [direction, neighbor] of [[-1, 'Plan Offers'], [1, 'Accepted Estimates']] as const) {
        const active = (await tab('Open Invoices').boundingBox())!;
        const x = direction === -1 ? active.x - 3 : active.x + active.width + 3;
        const y = active.y + active.height / 2;
        expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="tab"]')?.textContent, { x, y })).toContain(neighbor);
        if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
        await expect(tab(neighbor)).toHaveAttribute('aria-selected', 'true');
        await pick('Open Invoices');
        await expect(tab('Open Invoices')).toHaveAttribute('aria-selected', 'true');
        expect(await outerPosition()).toEqual(originalPosition);
      }
      await results.evaluate(el => { el.scrollTop = el.scrollHeight; });
      expect(await results.evaluate(el => el.scrollTop)).toBeGreaterThan(200);
      await expect(section).toBeInViewport();
      expect((await section.boundingBox())!.y).toBeCloseTo(initialTabsTop, 0);
      for (let step = 0; step < 8; step++) {
        const atEnd = await section.evaluate(el => el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
        if (atEnd) break;
        await right.click();
      }
      await expect(right).toBeDisabled();
      await expect(tab('Paid / Closed')).toBeInViewport({ ratio: 0.99 });
      // Browsing offscreen labels does not change the open panel.
      await expect(results).toBeVisible();
      await pick('Paid / Closed');
      const empty = page.getByRole('tabpanel', { name: /^Paid \/ Closed/ });
      await expect(empty.getByText('No paid or closed records yet', { exact: true })).toBeInViewport();
      expect((await empty.boundingBox())!.y).toBeCloseTo(bounds.y, 0);
      expect(bounds.y - initialTabsTop - (await section.boundingBox())!.height).toBeLessThanOrEqual(12);
      expect((await section.boundingBox())!.y).toBeCloseTo(initialTabsTop, 0);
      expect(await outerPosition()).toEqual(originalPosition);
      await expect(tab('Paid / Closed')).toBeInViewport({ ratio: 0.99 });
      for (let step = 0; step < 8; step++) {
        const visible = await tab('Open Invoices').evaluate(el => {
          const rail = el.closest('[role="tablist"]')!.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          return box.right > rail.left && box.left < rail.right;
        });
        if (visible) break;
        await left.click();
      }
      await pick('Open Invoices');
      await expect(tab('Open Invoices')).toBeInViewport({ ratio: 0.99 });
      await expect(results.getByText('Fixture repair 0', { exact: true })).toBeInViewport();
      expect(await results.evaluate(el => el.scrollTop)).toBe(0);
      expect((await results.boundingBox())!.y).toBeCloseTo(bounds.y, 0);
      expect((await section.boundingBox())!.y).toBeCloseTo(initialTabsTop, 0);
      expect(await outerPosition()).toEqual(originalPosition);
      await tab('Open Invoices').focus();
      for (const [key, title] of [['End', 'Paid / Closed'], ['ArrowRight', 'Needs Review'], ['ArrowLeft', 'Paid / Closed'], ['ArrowLeft', 'Active Plans'], ['ArrowLeft', 'Accepted Estimates'], ['Home', 'Needs Review'], ['ArrowRight', 'Plan Offers'], ['ArrowRight', 'Open Invoices']]) {
        await page.keyboard.press(key);
        await expect(tab(title)).toBeFocused();
        await expect(tab('Open Invoices')).toHaveAttribute('aria-selected', 'true');
        await expect(results).toBeVisible();
        await expect(front).toHaveAccessibleName(new RegExp('^' + title));
        await expect(tab(title)).toBeInViewport({ ratio: 0.99 });
        expect((await section.boundingBox())!.y).toBeCloseTo(initialTabsTop, 0);
      }
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Enter');
      await expect(tab('Plan Offers')).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Space');
      await expect(tab('Open Invoices')).toHaveAttribute('aria-selected', 'true');
    }
    await pick('Plan Offers');
    await expect(page.getByText('No plan offers yet', { exact: true })).toBeVisible();
    if (mobile) await expect(page.getByText('No plan offers yet', { exact: true })).toBeInViewport();
    await pick('Open Invoices');
    if (mobile) {
      expect((await section.boundingBox())!.y).toBeCloseTo(initialTabsTop, 0);
      expect(await results.evaluate(el => el.scrollTop)).toBe(0);
    }
    const first = results.getByRole('button', { name: 'View Invoice' }).first();
    await first.click();
    await pick('Open Invoices');
    await expect(results.getByRole('button', { name: 'Hide Details' })).toHaveCount(1);
    for (let attempt = 0; attempt < 2; attempt++) {
      await results.getByRole('button', { name: 'Preview PDF' }).first().click();
      const preview = page.getByRole('dialog', { name: 'PDF preview' });
      await expect(preview).toBeVisible();
      await expect(preview.getByTitle('ServSync PDF document')).toHaveAttribute('src', /^blob:/);
      await preview.getByRole('button', { name: 'Close PDF preview' }).click();
      await expect(preview).toHaveCount(0);
    }
    if (mobile) await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.getByRole('combobox', { name: 'Show', exact: true }).selectOption('all');
    await page.getByRole('combobox', { name: 'Contractor', exact: true }).selectOption({ label: 'Fixture Plumbing' });
    await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('oldest');
    await page.getByLabel('Search', { exact: true }).fill('no matching fixture');
    if (mobile) await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(results.getByText('No matching records', { exact: true })).toBeVisible();
    await results.getByRole('button', { name: 'Clear search and filters' }).click();
    await expect(results.getByText('Fixture repair 0', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('a horizontal touch swipe browses tabs without selecting a section', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Raw touch-drag input uses the Chromium DevTools protocol.');
  await page.setViewportSize({ width: 320, height: 568 });
  await openFictionalRecords(page);
  const strip = page.getByRole('tablist', { name: 'Record sections' });
  const box = (await strip.boundingBox())!;
  const initial = await strip.evaluate(el => el.scrollLeft);
  const input = await page.context().newCDPSession(page);
  await input.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const y = box.y + box.height / 2;
  const startX = box.x + box.width * 0.84;
  await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y }] });
  for (let i = 1; i <= 6; i++) {
    await input.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: startX - box.width * 0.1 * i, y }],
    });
  }
  await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => strip.evaluate(el => el.scrollLeft)).toBeGreaterThan(initial + 20);
  await expect(page.getByRole('tab', { name: /^Open Invoices/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: /^Open Invoices/ })).toBeVisible();
  expect((await strip.boundingBox())!.y).toBeCloseTo(box.y, 0);
});
