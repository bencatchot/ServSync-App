import {
  expect,
  test,
  type BrowserContext,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import { OWNER, OTHER_OWNER } from "../../scripts/practice/local-fixture";
const base = "http://127.0.0.1:5194";
const rpc =
  "https://bdytwgejqnlblhrnqxkp.supabase.co/rest/v1/rpc/servsync_practice_demo";
const storageKey = "sb-bdytwgejqnlblhrnqxkp-auth-token";
function session(actor = OWNER) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const claims = {
    sub: actor,
    role: "authenticated",
    is_anonymous: false,
    iss: "https://bdytwgejqnlblhrnqxkp.supabase.co/auth/v1",
    exp,
  };
  return {
    access_token: `synthetic.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.synthetic`,
    refresh_token: "synthetic-local-only",
    expires_at: exp,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: actor,
      aud: "authenticated",
      role: "authenticated",
      email: "fictional@example.invalid",
      is_anonymous: false,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}
async function control(
  request: APIRequestContext,
  command: string,
  actor = OWNER,
) {
  const r = await request.post(`${base}/__fixture/${command}`, {
    headers: { "x-local-fixture": "synthetic-browser-test" },
    data: { actor },
  });
  expect(r.ok()).toBe(true);
  return r.json();
}
async function bridge(context: BrowserContext, actor = OWNER) {
  const unexpected: string[] = [];
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session(actor) },
  );
  await context.route("**/*", async (route) => {
    const req = route.request();
    if (req.url() === rpc) {
      const claims = JSON.parse(
        Buffer.from(
          req.headers().authorization.split(".")[1],
          "base64url",
        ).toString(),
      );
      const r = await context.request.post(`${base}/__fixture/rpc`, {
        headers: { "x-local-fixture": "synthetic-browser-test" },
        data: { actor: claims.sub, body: req.postDataJSON() },
      });
      await route.fulfill({
        status: r.status(),
        contentType: "application/json",
        body: await r.text(),
      });
    } else if (
      /^https?:/.test(req.url()) &&
      !req.url().startsWith("http://127.0.0.1:")
    ) {
      unexpected.push(req.url());
      await route.abort();
    } else await route.continue();
  });
  return unexpected;
}
async function start(page: Page) {
  await page.goto("/#/practice-demo");
  await page
    .getByRole("button", { name: "Start blank" })
    .click();
  await expect(
    page.getByRole("button", { name: "Back to Practice drafts", exact: true }),
  ).toBeVisible();
}
async function fill(page: Page, title = "Synthetic repair") {
  await page.getByLabel("What needs doing?").fill(title);
  await page
    .getByLabel("Scope / description", { exact: true })
    .fill("Fictional repair for this isolated test.");
  await page
    .getByLabel("Draft estimate line item 1 description", { exact: true })
    .fill("Fictional repair");
  await page
    .getByLabel("Draft estimate line item 1 quantity", { exact: true })
    .fill("2");
  await page
    .getByLabel("Draft estimate line item 1 unit price", { exact: true })
    .fill("125.25");
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Practice Draft saved in Demo",
  );
}
async function broadcast(page: Page, event: string, actor?: string) {
  await page.evaluate(
    ({ key, event, value }) => {
      if (value) localStorage.setItem(key, JSON.stringify(value));
      else localStorage.removeItem(key);
      const c = new BroadcastChannel(key);
      c.postMessage({ event, session: value });
      c.close();
    },
    { key: storageKey, event, value: actor ? session(actor) : null },
  );
}
test.beforeEach(async ({ request }) => {
  await control(request, "reset");
  await control(request, "reset", OTHER_OWNER);
});

test("default-off entry loads no Auth client, app or RPC", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("http://127.0.0.1:5195/#/practice-demo");
  await expect(
    page.getByRole("heading", { name: "Practice pilot is not enabled" }),
  ).toBeVisible();
  expect(
    requests.filter((u) =>
      /supabaseClient|\/src\/App\.tsx|supabase\.co/.test(u),
    ),
  ).toEqual([]);
});

test("actual SQL saves, reloads, resumes in another browser context and produces accurate marked PDF", async ({
  page,
  context,
  browser,
  request,
}, info) => {
  const external = await bridge(context);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await expect(
    page.getByText("New unsaved Practice Draft.", { exact: false }),
  ).toBeVisible();
  await fill(page);
  await save(page);
  expect(await control(request, "count")).toBe(1);
  await page.reload();
  await page
    .getByRole("button", { name: /^Synthetic repair Continue saved draft/ })
    .click();
  await expect(
    page.getByLabel("Draft estimate line item 1 quantity", { exact: true }),
  ).toHaveValue("2");
  const second = await browser.newContext();
  await bridge(second);
  const other = await second.newPage();
  await other.goto(`${base}/#/practice-demo`);
  await other
    .getByRole("button", { name: /^Synthetic repair Continue saved draft/ })
    .click();
  await expect(other.getByLabel("What needs doing?")).toHaveValue(
    "Synthetic repair",
  );
  await second.close();
  await page
    .getByRole("button", { name: "Preview Practice estimate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("$250.50");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download watermarked PDF" }).click();
  const download = await downloadPromise;
  const path = info.outputPath("synthetic-demo.pdf");
  await download.saveAs(path);
  const pdf = (await readFile(path)).toString("latin1");
  expect(pdf).toContain("PRACTICE - NOT A LIVE DOCUMENT");
  expect(pdf).toContain("250.50");
  expect(pdf).not.toContain("Invalid Date");
  await page.getByRole("button", { name: "Close preview" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("practice-demo.png"),
    fullPage: true,
  });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await expect(
    page.getByRole("button", { name: /send|payment|transfer|renew|delete/i }),
  ).toHaveCount(0);
});

test("unsaved changes survive cancelled navigation, token refresh and an offline recheck", async ({
  page,
  context,
}) => {
  const external = await bridge(context);
  await start(page);
  await fill(page, "Unsaved example");
  page.on("dialog", (d) => void d.dismiss());
  await page
    .getByRole("button", { name: "Back to Practice drafts", exact: true })
    .click();
  await expect(page.getByLabel("What needs doing?")).toHaveValue(
    "Unsaved example",
  );
  await page.getByRole("button", { name: "Leave Practice" }).click();
  await expect(page).toHaveURL(/#\/practice-demo$/);
  await expect(page.getByLabel("What needs doing?")).toHaveValue(
    "Unsaved example",
  );
  await broadcast(page, "TOKEN_REFRESHED", OWNER);
  await expect(page.getByLabel("What needs doing?")).toHaveValue(
    "Unsaved example",
  );
  await page.route(rpc, (r) => r.abort());
  await page
    .getByRole("button", { name: "Preview Practice estimate", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Recheck Practice access" }),
  ).toBeVisible();
  await page.unroute(rpc);
  await page.getByRole("button", { name: "Recheck Practice access" }).click();
  await expect(page.getByLabel("What needs doing?")).toHaveValue(
    "Unsaved example",
  );
  await save(page);
  expect(external).toEqual([]);
});

test("lost save acknowledgement retries the same Draft without duplication; concurrent edit fails safely", async ({
  page,
  context,
  browser,
  request,
}) => {
  await bridge(context);
  await start(page);
  await fill(page);
  await page.route(rpc, async (route) => {
    const body = route.request().postDataJSON();
    if (body.command !== "save") return route.fallback();
    await context.request.post(`${base}/__fixture/rpc`, {
      headers: { "x-local-fixture": "synthetic-browser-test" },
      data: { actor: OWNER, body },
    });
    await route.abort();
  });
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Recheck Practice access" }),
  ).toBeVisible();
  expect(await control(request, "count")).toBe(1);
  await page.unroute(rpc);
  await page.getByRole("button", { name: "Recheck Practice access" }).click();
  await save(page);
  expect(await control(request, "count")).toBe(1);
  const second = await browser.newContext();
  await bridge(second);
  const other = await second.newPage();
  await other.goto(`${base}/#/practice-demo`);
  await other
    .getByRole("button", { name: /^Synthetic repair Continue saved draft/ })
    .click();
  await other.getByLabel("What needs doing?").fill("Other saved edit");
  await save(other);
  await second.close();
  await page.getByLabel("What needs doing?").fill("My unsaved edit");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Practice changed elsewhere",
  );
  await expect(page.getByLabel("What needs doing?")).toHaveValue(
    "My unsaved edit",
  );
  expect(await control(request, "count")).toBe(1);
});

test("expiry closes the PDF and revocation prevents download", async ({
  page,
  context,
  request,
}) => {
  await bridge(context);
  await start(page);
  await fill(page);
  await save(page);
  await control(request, "expire");
  await page
    .getByRole("button", { name: "Preview Practice estimate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 6000 });
  await expect(
    page.getByText("Practice access has ended.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("What needs doing?")).toHaveCount(0);
  await control(request, "reset");
  await page.reload();
  await page
    .getByRole("button", { name: "Start blank" })
    .click();
  await fill(page);
  await save(page);
  await page
    .getByRole("button", { name: "Preview Practice estimate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await control(request, "revoke");
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.getByRole("link", { name: "Download watermarked PDF" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("What needs doing?")).toHaveCount(0);
  expect(downloads).toBe(0);
});

test("account changes discard old input and ignore a late save response", async ({
  page,
  context,
}) => {
  await bridge(context);
  await start(page);
  await fill(page, "First account secret fixture");
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let reached!: () => void;
  const seen = new Promise<void>((r) => (reached = r));
  let finished!: () => void;
  const delivered = new Promise<void>((r) => (finished = r));
  await page.route(rpc, async (route) => {
    const body = route.request().postDataJSON();
    if (body.command !== "save") return route.fallback();
    const r = await context.request.post(`${base}/__fixture/rpc`, {
      headers: { "x-local-fixture": "synthetic-browser-test" },
      data: { actor: OWNER, body },
    });
    reached();
    await held;
    await route.fulfill({
      status: r.status(),
      contentType: "application/json",
      body: await r.text(),
    });
    finished();
  });
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await seen;
  await broadcast(page, "SIGNED_IN", OTHER_OWNER);
  await expect(
    page.getByRole("button", { name: "Start blank" }),
  ).toBeVisible();
  release();
  await delivered;
  await page.unroute(rpc);
  await page
    .getByRole("button", { name: "Start blank" })
    .click();
  await expect(page.getByLabel("What needs doing?")).toHaveValue("");
  await expect(
    page.getByRole("button", {
      name: "First account secret fixture",
      exact: true,
    }),
  ).toHaveCount(0);
  await broadcast(page, "SIGNED_OUT");
  await expect(
    page.getByRole("heading", { name: "Demo sign-in required" }),
  ).toBeVisible();
});

test("initial access checks are serialized and delayed expired responses never open a PDF", async ({
  page,
  context,
  request,
}) => {
  await bridge(context);
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let stateCalls = 0;
  await page.route(rpc, async (route) => {
    stateCalls++;
    await held;
    await route.fallback();
  });
  await page.goto("/#/practice-demo");
  await expect(
    page.getByRole("button", { name: "Recheck Practice access" }),
  ).toBeDisabled();
  // Development StrictMode intentionally mounts the access effect twice.
  await expect.poll(() => stateCalls).toBe(2);
  const calls = stateCalls;
  await page.evaluate(() => dispatchEvent(new Event("focus")));
  expect(stateCalls).toBe(calls);
  release();
  await expect(
    page.getByRole("button", { name: "Start blank" }),
  ).toBeVisible();
  await page.unroute(rpc);
  await page
    .getByRole("button", { name: "Start blank" })
    .click();
  await fill(page);
  await save(page);
  await control(request, "expire");
  await page.route(rpc, async (route) => {
    const r = await context.request.post(`${base}/__fixture/rpc`, {
      headers: { "x-local-fixture": "synthetic-browser-test" },
      data: { actor: OWNER, body: route.request().postDataJSON() },
    });
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await route.fulfill({
      status: r.status(),
      contentType: "application/json",
      body: await r.text(),
    });
  });
  await page
    .getByRole("button", { name: "Preview Practice estimate", exact: true })
    .click();
  await expect(
    page.getByText("Practice access has ended.", { exact: false }),
  ).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("browser Back cancellation keeps unsaved input and public delivery entry remains isolated", async ({
  page,
  context,
}) => {
  await bridge(context);
  await page.goto("/#/estimate-delivery");
  await page.goto("/#/practice-demo");
  await page
    .getByRole("button", { name: "Start blank" })
    .click();
  await fill(page, "Keep after Back");
  page.on("dialog", (d) => void d.dismiss());
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/#\/practice-demo$/);
  await expect(page.getByLabel("What needs doing?")).toHaveValue(
    "Keep after Back",
  );
});

test("public delivery routes consume tokens without mounting the business app", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  for (const [kind, endpoint] of [
    ["estimate", "local-estimate"],
    ["invoice", "local-invoice"],
    ["report", "finalized-report"],
  ]) {
    const bodies: unknown[] = [];
    const token = "a".repeat(64);
    await page.route(`**/api/request-free-${endpoint}-delivery`, (r) => {
      bodies.push(r.request().postDataJSON());
      return r.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ state: "invalid" }),
      });
    });
    await page.goto(`/#/${kind}-delivery?access=${token}`);
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toEqual({ token });
    expect(page.url()).not.toContain(token);
    // A same-hash history entry has no paired hashchange; it must not swallow
    // the next legitimate token-bearing navigation.
    await page.evaluate(async () => {
      history.pushState({ fixture: true }, "", location.href);
      await new Promise<void>((resolve) => {
        addEventListener("popstate", () => resolve(), { once: true });
        history.back();
      });
    });
    expect(
      await page.evaluate(
        (secret) =>
          JSON.stringify([
            localStorage,
            sessionStorage,
            history.state,
            document.cookie,
          ]).includes(secret),
        token,
      ),
    ).toBe(false);
  }
  expect(
    requests.filter((u) =>
      /supabaseClient|\/src\/App\.tsx|supabase\.co/.test(u),
    ),
  ).toEqual([]);
});

test('guided sample uses real editor, stays unsaved until Save, and returns to saved drafts', async ({ page, context, request }, info) => {
  const external = await bridge(context);
  await page.goto('/#/practice-demo');
  await page.getByRole('button', { name: 'Try sample repair', exact: true }).click();
  await expect(page.getByLabel('What needs doing?')).toHaveValue('Sample — small repair visit');
  await expect(page.getByLabel('Draft estimate line item 1 unit price', { exact: true })).toHaveValue('75');
  await expect(page.getByLabel('Draft estimate line item 2 description', { exact: true })).toHaveValue('Small repair');
  expect(await control(request, 'count')).toBe(0);
  await expect(page.getByLabel('Work format', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show draft estimate line item 1 more details' })).toHaveCount(0);
  await expect(page.getByText('Build a work list or start from an inspection checklist.')).toHaveCount(0);
  const previewButton = page.getByRole('button', { name: 'Preview Practice estimate', exact: true });
  const colors = await previewButton.evaluate(el => ({ text: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
  expect(colors.text).not.toBe(colors.background);
  expect(colors.background).not.toBe('rgb(255, 255, 255)');
  const saveBounds = await page.getByRole('button', { name: 'Save Draft', exact: true }).boundingBox();
  const previewBounds = await previewButton.boundingBox();
  expect(Math.abs(saveBounds!.y - previewBounds!.y)).toBeLessThan(5);
  const position = await page.getByLabel('What needs doing?').evaluate(el => ({ top: el.getBoundingClientRect().top, height: innerHeight }));
  expect(position.top).toBeLessThan(position.height + 150);
  await page.screenshot({ path: info.outputPath('guided-sample.png'), fullPage: true });
  await save(page);
  await page.getByRole('button', { name: 'Back to Practice drafts' }).click();
  await expect(page.getByLabel('What needs doing?')).toHaveCount(0);
  await page.getByRole('button', { name: /Sample — small repair visit Continue saved draft/ }).click();
  await expect(page.getByLabel('What needs doing?')).toHaveValue('Sample — small repair visit');
  expect(await control(request, 'count')).toBe(1);
  expect(external).toEqual([]);
});

test('currency keyboard entry, rounding, inline recovery and missing-description preview use consistent values', async ({ page, context, request }) => {
  await bridge(context); await start(page); await fill(page);
  const price = page.getByLabel('Draft estimate line item 1 unit price', { exact: true });
  await price.fill(''); await price.pressSequentially('125.25');
  await expect(price).toHaveValue('125.25');
  await price.fill('$125.255'); await save(page);
  await expect(price).toHaveValue('125.255');
  await page.getByRole('button', { name: 'Preview Practice estimate', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('$250.52');
  await page.getByRole('button', { name: 'Close preview' }).click();
  await expect(page.getByRole('button', { name: 'Preview Practice estimate', exact: true })).toBeFocused();
  await price.fill('1,250.50'); await save(page);
  await expect(price).toHaveValue('1250.5');
  await price.fill('not a price');
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a non-negative price');
  await expect(price).toBeVisible(); await expect(price).toBeFocused();
  await expect(price).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Recheck Practice access' })).toHaveCount(0);
  await price.fill('$125.25'); await save(page);
  await page.reload();
  await page.getByRole('button', { name: /^Synthetic repair Continue saved draft/ }).click();
  await expect(price).toHaveValue('125.25');
  const description = page.getByLabel('Draft estimate line item 1 description', { exact: true });
  await description.fill('x'.repeat(501));
  await page.getByRole('button', { name: 'Preview Practice estimate', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid or oversized text');
  await expect(description).toBeFocused();
  await expect(description).toHaveValue('x'.repeat(501));
  await expect(page.getByRole('button', { name: 'Recheck Practice access' })).toHaveCount(0);
  await description.fill('');
  await page.getByRole('button', { name: 'Preview Practice estimate', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Describe what line 1 covers');
  await expect(description).toBeFocused(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await description.fill('Fictional repair');
  await page.getByRole('button', { name: 'Preview Practice estimate', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('$250.50');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Preview Practice estimate', exact: true })).toBeFocused();
  expect(await control(request, 'count')).toBe(1);
});

test('pending deadline response uses earliest access expiry; legacy response never labels cycle as access', async ({ page, context, request }) => {
  await bridge(context); await start(page); await fill(page);
  await page.route(rpc, async route => {
    const body = route.request().postDataJSON();
    const r = await context.request.post(`${base}/__fixture/rpc`, { headers: { 'x-local-fixture': 'synthetic-browser-test' }, data: { actor: OWNER, body } });
    const value = await r.json(); delete value.accessExpiresAt;
    await route.fulfill({ status: r.status(), contentType: 'application/json', body: JSON.stringify(value) });
  });
  await page.reload();
  await expect(page.getByLabel('Practice access deadline')).toContainText('Access deadline unavailable');
  await expect(page.getByLabel('Practice access deadline')).not.toContainText('Access ends');
  await page.unroute(rpc);
  await page.getByRole('button', { name: 'Start blank', exact: true }).click(); await fill(page);
  await control(request, 'short-access');
  await page.getByRole('button', { name: 'Preview Practice estimate', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Practice access deadline')).toContainText('Access ends');
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 6000 });
  await expect(page.getByRole('alert')).toContainText('Practice access has ended');
});
