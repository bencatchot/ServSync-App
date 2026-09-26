import { expect, test } from "@playwright/test";

// Public-only checks: these never sign in, submit a form, or mutate app data.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Home service, in sync." }),
  ).toBeVisible();
});

test("hero assets load and both audience links open the existing signup screens", async ({
  page,
}) => {
  const image = page.getByRole("img", {
    name: "A home-service professional arriving at a welcoming coastal home",
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  for (const [label, role] of [
    ["I’m a homeowner", "homeowner"],
    ["I’m a contractor", "contractor"],
  ]) {
    await page.getByRole("link", { name: label, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`#/${role}\\?mode=signup$`));
    await expect(page.getByLabel(/^Email$/i)).toBeVisible();
    await expect(page.getByLabel(/^Password$/i)).toBeVisible();
    await page.goto("/");
  }
});

test("journey can be explored with pointer and keyboard", async ({ page }) => {
  const tabs = page.getByRole("tablist", {
    name: "Explore the service journey",
  });
  await tabs.getByRole("tab", { name: "02 Plan" }).click();
  await expect(page.getByRole("tabpanel", { name: "02 Plan" })).toContainText(
    "Agree on the work before it starts.",
  );
  await tabs.getByRole("tab", { name: "02 Plan" }).press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "03 Complete" })).toBeFocused();
  await expect(
    page.getByRole("tabpanel", { name: "03 Complete" }),
  ).toContainText("Keep the details with the job.");
  await tabs.getByRole("tab", { name: "03 Complete" }).press("End");
  await expect(page.getByRole("tabpanel", { name: "04 Keep" })).toContainText(
    "Add a manual follow-up reminder",
  );
  await tabs.getByRole("tab", { name: "04 Keep" }).press("Home");
  await expect(tabs.getByRole("tab", { name: "01 Connect" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("audience tabs change the copy, illustration and signup destination together", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "For homeowners", exact: true }).click();
  const panel = page.getByRole("tabpanel", {
    name: "For homeowners",
    exact: true,
  });
  await expect(panel).toContainText("Keep track of work");
  await expect(
    panel.getByRole("link", { name: "Create a homeowner account" }),
  ).toHaveAttribute("href", "#/homeowner?mode=signup");
  await expect(panel).toContainText("Core homeowner features are free.");
  await page
    .getByRole("tab", { name: "For homeowners", exact: true })
    .press("ArrowLeft");
  await expect(
    page
      .getByRole("tabpanel", { name: "For contractors", exact: true })
      .getByRole("link", { name: "Create a contractor account" }),
  ).toHaveAttribute("href", "#/contractor?mode=signup");
});

test("FAQ disclosures expose beta and payment limits", async ({ page }) => {
  const pricing = page
    .locator("details")
    .filter({ hasText: "Is ServSync free to use?" });
  await pricing.locator("summary").click();
  await expect(pricing).toHaveAttribute("open", "");
  await expect(pricing).toContainText("We’ll explain any future paid plans");
  const payments = page
    .locator("details")
    .filter({ hasText: "Can customers pay invoices in ServSync?" });
  await payments.locator("summary").click();
  await expect(payments).toContainText("Customers pay outside ServSync");
  await payments.locator("summary").press("Enter");
  await expect(payments).not.toHaveAttribute("open", "");
});

test("section navigation stays on the landing page and moves focus to the destination", async ({
  page,
}) => {
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "FAQs" })
    .click();
  await expect(page.locator("#questions")).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Common questions." }),
  ).toBeInViewport();
  await expect(page).not.toHaveURL(/#questions/);
});

test("mobile menu supports navigation, Escape, and both sign-in routes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("link", { name: "Homeowner sign in" }),
  ).toHaveAttribute("href", "#/homeowner");
  await expect(
    menu.getByRole("link", { name: "Contractor sign in" }),
  ).toHaveAttribute("href", "#/contractor");
  await menu.getByRole("link", { name: "FAQs" }).press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  await page.getByRole("button", { name: "Open menu" }).click();
  await menu.getByRole("link", { name: "Built for you" }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator("#for-you")).toBeFocused();
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`layout stays within the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const clipped = await page
      .locator(
        ".ss-landing a, .ss-landing button, .ss-landing h1, .ss-landing h2",
      )
      .evaluateAll((elements) =>
        elements
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              !element.classList.contains("ss-skip") &&
              (rect.left < -1 || rect.right > innerWidth + 1)
            );
          })
          .map((element) => element.textContent),
      );
    expect(clipped).toEqual([]);
  });
}

test("all legal links keep their existing routes", async ({ page }) => {
  const footer = page.getByRole("contentinfo");
  for (const route of [
    "terms",
    "privacy",
    "acceptable-use",
    "contractor-agreement",
    "trust-safety",
  ]) {
    await expect(footer.locator(`a[href="#/${route}"]`)).toHaveCount(1);
  }
});

test("desktop sign-in offers both roles without changing authentication", async ({
  page,
}) => {
  const menu = page.locator(".ss-signin-menu");
  await menu.locator("summary").click();
  await expect(
    menu.getByRole("link", { name: "Homeowner", exact: true }),
  ).toBeVisible();
  await expect(
    menu.getByRole("link", { name: "Homeowner", exact: true }),
  ).toHaveAttribute("href", "#/homeowner");
  await expect(
    menu.getByRole("link", { name: "Contractor", exact: true }),
  ).toHaveAttribute("href", "#/contractor");
  await menu.locator("summary").press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
});

test("bottom-of-page signup starts at the top of the existing auth screen", async ({
  page,
}) => {
  await page
    .locator("#get-started")
    .getByRole("link", { name: "I’m a homeowner", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/homeowner\?mode=signup$/);
  await expect(
    page.getByRole("heading", {
      name: "Create homeowner account",
      exact: true,
    }),
  ).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("200 percent text reflows on a small phone without clipping navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
  const clipped = await page
    .locator(
      ".ss-landing a, .ss-landing button, .ss-landing h1, .ss-landing h2",
    )
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            !element.classList.contains("ss-skip") &&
            (rect.left < -1 || rect.right > innerWidth + 1)
          );
        })
        .map((element) => element.textContent),
    );
  expect(clipped).toEqual([]);
  await page.getByRole("tab", { name: "04 Keep" }).click();
  await expect(page.getByRole("tabpanel", { name: "04 Keep" })).toContainText(
    "Save the records you’ll need later.",
  );
  await page.getByRole("tab", { name: "For homeowners", exact: true }).click();
  await expect(
    page.getByRole("tabpanel", { name: "For homeowners", exact: true }),
  ).toContainText("Keep track of work");
  expect(
    await page.evaluate(
      () => document.querySelector(".ss-landing")?.scrollLeft,
    ),
  ).toBe(0);
});
