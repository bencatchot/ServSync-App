import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("real browser → local API → PostgreSQL → reload → preview → reviewed test transfer", async ({
  page,
  browser,
}, info) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:5193/")
    )
      external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/scripts/practice/index.html");
  await expect(
    page.getByRole("heading", { name: "Temporary Practice workspace" }),
  ).toBeVisible();
  await expect(page.getByText("Loading Practice…")).toBeHidden();
  const start = page.getByRole("button", {
    name: "Start Practice with fictional setup",
  });
  if (await start.isVisible()) await start.click();
  await expect(
    page.getByRole("button", { name: "New Practice Draft", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New Practice Draft", exact: true })
    .click();
  const title = `Browser repair ${info.project.name} ${Date.now()}`;
  await page.getByLabel("What needs doing?").fill(title);
  await page
    .getByLabel("Scope / description", { exact: true })
    .fill("Repair the fictional fixture. No real customer contact.");
  await page
    .getByLabel("Draft estimate line item 1 description", { exact: true })
    .fill("Fictional repair");
  await page
    .getByLabel("Draft estimate line item 1 quantity", { exact: true })
    .fill("2");
  await page
    .getByLabel("Draft estimate line item 1 unit price", { exact: true })
    .fill("125");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "saved on the local server",
  );
  const expiry = await page.getByLabel("Practice retention").innerText();
  expect(expiry).toContain("(UTC)");
  expect(expiry).toContain("No email is sent");
  await page.reload();
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(page.getByLabel("What needs doing?")).toHaveValue(title);
  await expect(
    page.getByLabel("Draft estimate line item 1 quantity", { exact: true }),
  ).toHaveValue("2");
  // A completely separate browser context uses server-persisted data, not localStorage/sessionStorage.
  const second = await browser.newContext();
  const other = await second.newPage();
  await other.goto("http://127.0.0.1:5193/scripts/practice/index.html");
  await other.getByRole("button", { name: title, exact: true }).click();
  await expect(other.getByLabel("What needs doing?")).toHaveValue(title);
  await second.close();
  await page
    .getByRole("button", { name: "Preview Practice estimate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("$250.00");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download watermarked PDF" }).click();
  const download = await downloadPromise;
  const path = info.outputPath("practice-estimate.pdf");
  await download.saveAs(path);
  const pdf = (await readFile(path)).toString("latin1");
  expect(pdf).toContain("PRACTICE - NOT A LIVE DOCUMENT");
  expect(pdf).not.toContain("Invalid Date");
  expect(pdf).toContain("250.00");
  await page.getByRole("button", { name: "Close preview" }).click();
  await page
    .getByRole("button", { name: "Review transfer to test destination" })
    .click();
  await expect(page.getByLabel("Transfer review")).toContainText("$250.00");
  await page.getByRole("button", { name: "Cancel transfer" }).click();
  await expect(page.getByRole("status")).toContainText(
    "No destination Draft created",
  );
  await page
    .getByRole("button", { name: "Review transfer to test destination" })
    .click();
  await page
    .getByRole("button", { name: "Approve: create 1 test destination Draft" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Created one unsent test destination Draft",
  );
  await expect(page.getByText(/Minimal receipt expires/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("practice-review.png"),
    fullPage: true,
  });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("provider/cleanup routes fail closed and cross-origin writes are rejected", async ({
  request,
}) => {
  const base = "http://127.0.0.1:5193";
  expect(
    (
      await request.post(`${base}/api/send-local-estimate-email`, { data: {} })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post(`${base}/api/practice-local/start`, {
        headers: { origin: "https://example.invalid", "x-practice-local": "1" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post(`${base}/api/practice-local/cleanup`, {
        headers: { origin: base, "x-practice-local": "1" },
        data: {},
      })
    ).status(),
  ).toBe(400);
  expect(
    (await request.get(`${base}/api/practice-local/cleanup-dry-run`)).status(),
  ).toBe(200);
});

test("multi-page Practice PDFs mark every page; ordinary PDF output stays unmarked", async ({
  page,
}) => {
  await page.goto("/scripts/practice/index.html");
  const result = await page.evaluate(async () => {
    const [
      { createEstimatePdf },
      { practiceEstimate },
      { createBlankSharedDraftComposerDraft },
      { createWorkComposerLineDraft },
    ] = await Promise.all(
      [
        "/src/utils/pdfDocuments.ts",
        "/src/features/practice/preview.ts",
        "/src/features/drafts/draftComposerMappings.ts",
        "/src/features/work-composer/workComposerDrafts.ts",
      ].map((path) => import(path)),
    );
    const d = createBlankSharedDraftComposerDraft({
      title: "Long example",
      scope: "Fictional scope",
      line_items: Array.from({ length: 55 }, (_, i) =>
        createWorkComposerLineDraft({
          line_title: `Fictional service ${i + 1}`,
          unit_price: "5",
          quantity: "1",
        }),
      ),
    });
    const estimate = practiceEstimate(d);
    const context = {
      contractorName: "Fictional business",
      customerName: "Fictional Customer",
    };
    const marked = await createEstimatePdf(estimate, {
      ...context,
      practice: true,
    });
    const ordinary = await createEstimatePdf(estimate, context);
    const data = await marked.blob.text();
    const other = await ordinary.blob.text();
    return {
      pages: (data.match(/\/Type \/Page\b/g) || []).length,
      markers: (data.match(/PRACTICE - NOT A LIVE DOCUMENT/g) || []).length,
      ordinaryMarked: other.includes("PRACTICE - NOT A LIVE DOCUMENT"),
      filename: marked.fileName,
    };
  });
  expect(result.pages).toBeGreaterThan(1);
  expect(result.markers).toBe(result.pages);
  expect(result.ordinaryMarked).toBe(false);
  expect(result.filename).toMatch(/^PRACTICE-/);
});
