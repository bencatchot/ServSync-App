import { expect, test } from "@playwright/test";

const fixture = "/tests/e2e/fixtures/discover-safety-ui/index.html";

test.beforeEach(async ({ page }) => {
  const url = new URL(process.env.TEST_APP_URL!);
  test.skip(!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Synthetic fixture is only served by local Vite");
  const host = url.origin;
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== host) return route.abort();
    if (url.pathname === "/fixtures/safe-photo.svg") return route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="green"/></svg>',
    });
    return route.continue();
  });
  await page.goto(fixture);
});

test("report is explicit, retryable, keyboard-dismissable, and returns a receipt at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const report = page.getByRole("button", { name: "Report post" });
  await report.click();
  const intake = page.getByRole("dialog", { name: "Report this Discover post" });
  await expect(intake.getByRole("heading")).toBeFocused();
  await expect(intake.getByRole("button", { name: "Send report" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(intake).toHaveCount(0);
  await expect(report).toBeFocused();
  await report.click();
  await intake.getByLabel("Reason for reporting").selectOption("other");
  await intake.getByRole("button", { name: "Send report" }).click();
  await expect(intake.getByRole("alert")).toContainText("could not be confirmed");
  await expect(page.getByText("private internal error")).toHaveCount(0);
  await intake.getByRole("button", { name: "Send report" }).click();
  const receipt = page.getByRole("dialog", { name: "Report received" });
  await expect(receipt).toContainText("TEST-REPORT-123");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("blocking is separate from reporting and requires confirmation", async ({ page }) => {
  await page.getByRole("button", { name: "Block account" }).click();
  const modal = page.getByRole("dialog", { name: "Block this account?" });
  await modal.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Fixture callback log")).toBeEmpty();
  await page.getByRole("button", { name: "Block account" }).click();
  await modal.getByRole("button", { name: "Confirm block" }).click();
  await expect(page.getByLabel("Fixture callback log")).toHaveText("block:test-contractor");
});

test("moderator sees text/image, must give a reason, and unsafe or inaccessible photos gate approval", async ({ page }) => {
  const queue = page.getByRole("region", { name: "Discover safety review" });
  const healthy = queue.getByRole("listitem").filter({ hasText: "Review my garden project" });
  await healthy.getByRole("button", { name: "Review post" }).click();
  const post = page.getByRole("dialog", { name: "Review Discover post" });
  await expect(post.getByText("A garden without personal information.")).toBeVisible();
  await expect(post.getByRole("img", { name: "Submitted photo 1" })).toBeVisible();
  await post.getByLabel("Decision", { exact: true }).selectOption("approve");
  await expect(post.getByRole("button", { name: "Save decision" })).toBeDisabled();
  await post.getByLabel("Reason for decision").fill("  Photo and text checked.  ");
  await post.getByRole("button", { name: "Save decision" }).click();
  await expect(queue.getByText("Review decision recorded.")).toBeVisible();
  await expect(healthy).toHaveCount(0);
  const unsafe = queue.getByRole("listitem").filter({ hasText: "Review only when all photos load" });
  await unsafe.getByRole("button", { name: "Review post" }).click();
  await expect(post.getByText("1 submitted photo could not be shown from an approved source.")).toBeVisible();
  await post.getByLabel("Decision", { exact: true }).selectOption("approve");
  await post.getByLabel("Reason for decision").fill("Untrusted image blocked.");
  await expect(post.getByRole("button", { name: "Save decision" })).toBeDisabled();
  await expect(post.getByRole("img")).toHaveCount(0);
});

test("moderator sees report category and can dismiss or remove the post", async ({ page }) => {
  await page.getByRole("button", { name: "Review report" }).click();
  const report = page.getByRole("dialog", { name: "Review Discover report" });
  await expect(report).toContainText("Private information shared without permission");
  await expect(report.getByRole("option", { name: "Dismiss report" })).toHaveCount(1);
  await report.getByLabel("Decision", { exact: true }).selectOption("remove");
  await report.getByLabel("Reason for decision").fill("Private details visible.");
  await expect(report.getByRole("button", { name: "Save decision" })).toBeDisabled();
  await report.getByRole("checkbox").check();

  await report.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByLabel("Fixture callback log")).toHaveText("decide:r1:report:remove:Private details visible.");
});
