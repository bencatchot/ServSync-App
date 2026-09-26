import type { ComponentType } from "react";
import { expect, test, type Page } from "@playwright/test";
type Call = {
  name?: string;
  table?: string;
  method?: string;
  args?: unknown;
  action?: string;
  value?: { homeowner_user_id: string; contractor_id: string };
};
type FixtureWindow = Window & {
  discoverCalls: Call[];
  discoverFail: boolean;
  discoverSaved: string[];
};
type QueryResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
};
type Query = PromiseLike<QueryResult> &
  Record<
    | "select"
    | "eq"
    | "order"
    | "limit"
    | "maybeSingle"
    | "single"
    | "upsert"
    | "delete",
    (...args: unknown[]) => Query
  >;
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
});

async function mount(
  page: Page,
  view: "directory" | "profile" | "feed" | "presence",
  mode = "normal",
) {
  await page.route("https://discover-fixture.invalid/**", (route) =>
    route.abort(),
  );
  await page.goto("/");
  await page
    .getByRole("heading", {
      name: "Find local contractors. Keep the work organized.",
    })
    .waitFor();
  await page.evaluate(
    async ({ view, mode }) => {
      const dynamicImport = new Function("path", "return import(path)") as (
        path: string,
      ) => Promise<Record<string, unknown>>;
      const React = (await dynamicImport("/node_modules/.vite/deps/react.js"))
        .default as typeof import("react");
      const { createRoot } = (
        await dynamicImport("/node_modules/.vite/deps/react-dom_client.js")
      ).default as typeof import("react-dom/client");
      const client = (await dynamicImport("/src/supabaseClient.ts"))
        .supabase as unknown as {
        from: (table: string) => Query;
        rpc: (name: string, args?: unknown) => Query;
        auth: { signInWithPassword: () => Promise<{ error: null }> };
      };
      const calls: Call[] = [];
      Object.assign(window, {
        discoverCalls: calls,
        discoverFail: mode.includes("error") || mode === "missing",
        discoverSaved: [],
      });
      const state = window as FixtureWindow;
      const contractor = {
        id: "c1",
        owner_user_id: "owner",
        business_name: "Bay Plumbing",
        slug: "bay-plumbing",
        city: "Fairhope",
        state: "AL",
        zip_code: "36532",
        service_zip_codes: ["36526"],
        service_categories: ["Plumbing"],
        business_summary: "",
        website_url: "https://example.com",
        public_profile_enabled: true,
        account_status: "active",
        logo_url: "",
        external_review_links: [],
      };
      const post = {
        post_id: "post1",
        contractor_id: "c1",
        business_name: "Bay Plumbing",
        contractor_city: "Fairhope",
        contractor_state: "AL",
        categories: ["Plumbing"],
        post_category: "Plumbing",
        title: "A repaired faucet",
        description: "A deliberately public work example.",
        photos: [],
        created_at: "2026-09-01T12:00:00Z",
        is_saved: false,
        external_review_links: [],
        service_areas: [],
      };
      function query(result: () => QueryResult) {
        const builder = {
          then: (resolve, reject) =>
            Promise.resolve().then(result).then(resolve, reject),
        } as Query;
        (
          ["select", "eq", "order", "limit", "maybeSingle", "single"] as const
        ).forEach((method) => {
          builder[method] = (...args: unknown[]) => {
            calls.push({ method, args });
            return builder;
          };
        });
        return builder;
      }
      client.from = (table: string) => {
        calls.push({ table });
        let action = "read";
        let row = { contractor_id: "" };
        const builder = query(() => {
          if (table === "homeowner_saved_contractors") {
            if (state.discoverFail)
              return {
                data: null,
                error: { code: "42P01", message: "Unavailable" },
              };
            if (action === "save") state.discoverSaved = [row.contractor_id];
            if (action === "delete") state.discoverSaved = [];
            return {
              data: state.discoverSaved.map((contractor_id: string) => ({
                contractor_id,
              })),
              error: null,
            };
          }
          if (table === "homeowner_contractor_connections")
            return {
              data:
                mode === "connected"
                  ? { id: "connection1", status: "active" }
                  : mode === "pending"
                    ? { id: "connection1", status: "pending" }
                    : null,
              error:
                mode === "relationship-error"
                  ? { message: "Unavailable" }
                  : null,
            };
          if (table === "homes") return { data: [], error: null };
          return { data: [], error: null };
        });
        builder.upsert = (value: unknown) => {
          const savedRow = value as {
            homeowner_user_id: string;
            contractor_id: string;
          };
          calls.push({ action: "save", value: savedRow });
          action = "save";
          row = savedRow;
          return builder;
        };
        builder.delete = () => {
          calls.push({ action: "delete" });
          action = "delete";
          return builder;
        };
        return builder;
      };
      client.rpc = (name: string, args?: unknown) => {
        calls.push({ name, args });
        return query(() => {
          if (name === "servsync_get_public_contractor_profile")
            return {
              data: {
                ...contractor,
                contractor_id: "c1",
                categories: ["Plumbing"],
              },
              error:
                mode === "profile-error" && state.discoverFail
                  ? { message: "Unavailable" }
                  : null,
            };
          if (name === "servsync_delete_contractor_post")
            return {
              data: null,
              error: state.discoverFail ? { message: "Deletion failed" } : null,
            };
          if (name === "servsync_discover_saved_posts")
            return {
              data: [],
              error:
                mode === "saved-error" && state.discoverFail
                  ? { message: "Unavailable" }
                  : null,
            };
          if (
            name === "servsync_my_discover_posts" ||
            name === "servsync_discover_feed"
          )
            return {
              data: [post],
              error:
                mode === "feed-error" && state.discoverFail
                  ? { message: "Unavailable" }
                  : null,
            };
          return { data: null, error: null };
        });
      };
      client.auth.signInWithPassword = async () => {
        calls.push({ name: "fixture_signin" });
        return { error: null };
      };
      const root = document.createElement("main");
      root.className = "mx-auto max-w-4xl p-4";
      document.body.replaceChildren(root);
      const App =
        view === "profile" || view === "feed"
          ? ((await dynamicImport("/src/App.tsx")) as Record<
              string,
              ComponentType<Record<string, unknown>>
            >)
          : null;
      const homeowner = {
        id: "h1",
        role: "homeowner",
        full_name: "Fixture Homeowner",
        email: "homeowner@example.test",
      };
      let signedIn = mode !== "anonymous";
      const rendered = createRoot(root);
      const Wrapper = () => {
        if (view === "profile")
          return React.createElement(App!.ContractorPublicProfilePage, {
            slug: "bay-plumbing",
            currentProfile: signedIn ? homeowner : null,
            onAuthed: () => {
              signedIn = true;
              rendered.render(React.createElement(Wrapper));
            },
          });
        return React.createElement(App!.DiscoverFeed, {
          perspective: mode === "delete-error" ? "contractor" : "homeowner",
          userId: "h1",
          contractorId: mode === "delete-error" ? "c1" : null,
          connections: [],
          contractorSlugs: { c1: "bay-plumbing" },
        });
      };
      if (view === "directory") {
        const { ContractorDiscovery } = (await dynamicImport(
          "/src/features/discover/ContractorDiscovery.tsx",
        )) as Record<string, ComponentType<Record<string, unknown>>>;
        rendered.render(
          React.createElement(ContractorDiscovery, {
            homeownerId: "h1",
            contractors: [
              contractor,
              {
                ...contractor,
                id: "c2",
                slug: "roofing",
                business_name: "Delta Roofing",
                service_categories: ["Roofing"],
                city: "Mobile",
                zip_code: "36601",
                service_zip_codes: [],
              },
            ],
            unavailable: false,
            onRetry: () => {},
          }),
        );
      } else if (view === "presence") {
        const { ContractorPresence } = (await dynamicImport(
          "/src/features/discover/ContractorPresence.tsx",
        )) as Record<string, ComponentType<Record<string, unknown>>>;
        rendered.render(
          React.createElement(ContractorPresence, {
            contractor,
            onEdit: () => calls.push({ name: "edit_profile" }),
          }),
        );
      } else rendered.render(React.createElement(Wrapper));
    },
    { view, mode },
  );
}

for (const width of [1440, 390]) {
  test(`discovery finds contractors without posts and keeps saves private at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mount(page, "directory");
    await page.getByRole("heading", { name: "Bay Plumbing", exact: true }).waitFor();
    await page.screenshot({ path: `/tmp/servsync-discover-${width}.png`, fullPage: true });
    await expect(
      page.getByRole("heading", { name: "Bay Plumbing", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Service", exact: true })
      .selectOption("Plumbing");
    await page.getByLabel("ZIP or city").fill("36526");
    await expect(
      page.getByRole("heading", { name: "Delta Roofing" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Save contractor Bay Plumbing",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Remove saved contractor Bay Plumbing",
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Saved contractors", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Bay Plumbing", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Remove saved contractor Bay Plumbing" })
      .click();
    await expect(
      page.getByText("No contractors match these choices in your saved list."),
    ).toBeVisible();
    const calls = await page.evaluate(
      () => (window as FixtureWindow).discoverCalls,
    );
    expect(calls.filter((call: Call) => call.name)).toEqual([]);
    expect(calls.find((call: Call) => call.action === "save")?.value).toEqual({
      homeowner_user_id: "h1",
      contractor_id: "c1",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("missing migration is unavailable, never an empty saved list or successful save", async ({
  page,
}) => {
  await mount(page, "directory", "missing");
  await expect(page.getByRole("alert")).toContainText(
    "Saved contractors are unavailable",
  );
  await expect(
    page.getByRole("button", {
      name: "Save contractor Bay Plumbing",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Saved contractors", exact: true })
    .click();
  await expect(
    page.getByText("Your saved list could not be confirmed."),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as FixtureWindow).discoverFail = false;
  });
  await page.getByRole("button", { name: "Retry saved contractors" }).click();
  await expect(
    page.getByText("No contractors match these choices in your saved list."),
  ).toBeVisible();
});

test("area is never silently broadened", async ({ page }) => {
  await mount(page, "directory");
  await page.getByLabel("ZIP or city").fill("365");
  await expect(
    page.getByText("No contractors match these choices."),
  ).toBeVisible();
  await page.getByLabel("ZIP or city").fill("Fairhope");
  await expect(
    page.getByRole("heading", { name: "Bay Plumbing", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Delta Roofing" }),
  ).toHaveCount(0);
});

test("anonymous referral preserves contractor through sign-in without submitting connection", async ({
  page,
}) => {
  await mount(page, "profile", "anonymous");
  await expect(page.getByRole("link", { name: "Visit website" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A repaired faucet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign in to connect" }).click();
  await expect(page).toHaveURL(/#\/profile\?slug=bay-plumbing&intent=connect/);
  await page
    .getByLabel("Email", { exact: true })
    .fill("homeowner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Request connection with Bay Plumbing" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as FixtureWindow).discoverCalls.some(
        (call: Call) =>
          call.name === "servsync_submit_contextual_connection_request",
      ),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Set up my property" }).click();
  await expect(page).toHaveURL(/return_profile=bay-plumbing/);
});

test("connected profile links directly to the existing service request entry", async ({
  page,
}) => {
  await mount(page, "profile", "connected");
  await page
    .getByRole("button", { name: "Request service", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/homeowner\?request_contractor=c1/);
});

test("pending profile does not offer a duplicate connection or service request", async ({
  page,
}) => {
  await mount(page, "profile", "pending");
  await expect(
    page.getByText("Connection request sent", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Request (connection|service)/ }),
  ).toHaveCount(0);
});

test("profile load failure remains recoverable and is not a not-found prospect", async ({
  page,
}) => {
  await mount(page, "profile", "profile-error");
  await expect(page.getByRole("alert")).toContainText(
    "This profile could not be loaded",
  );
  await page.evaluate(() => {
    (window as FixtureWindow).discoverFail = false;
  });
  await page.getByRole("button", { name: "Retry profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Bay Plumbing", exact: true }),
  ).toBeVisible();
});

test("relationship lookup failure cannot invite a duplicate request", async ({
  page,
}) => {
  await mount(page, "profile", "relationship-error");
  await expect(page.getByRole("alert")).toContainText(
    "This profile could not be loaded",
  );
  await expect(
    page.getByRole("button", { name: /^Request connection/ }),
  ).toHaveCount(0);
});

for (const mode of ["feed-error", "saved-error"]) {
  test(`${mode} is shown as an error with retry`, async ({ page }) => {
    await mount(page, "feed", mode);
    if (mode === "saved-error")
      await page.getByRole("button", { name: "Saved Posts" }).click();
    await expect(page.getByRole("alert")).toContainText("could not be loaded");
    await expect(page.getByText("No saved posts yet")).toHaveCount(0);
    await page.evaluate(() => {
      (window as FixtureWindow).discoverFail = false;
    });
    await page.getByRole("button", { name: "Retry posts" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    if (mode === "feed-error")
      await expect(
        page.getByText("A repaired faucet", { exact: true }),
      ).toBeVisible();
  });
}

test("failed deletion preserves post; successful retry removes it", async ({
  page,
}) => {
  await mount(page, "feed", "delete-error");
  await expect(page.locator("time")).toContainText("9/1/2026");
  await page.getByRole("button", { name: "Delete post" }).click();
  await expect(
    page.getByText("Deletion failed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("A repaired faucet", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as FixtureWindow).discoverFail = false;
  });
  await page.getByRole("button", { name: "Delete post" }).click();
  await expect(page.getByText("Post deleted.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("A repaired faucet", { exact: true }),
  ).toHaveCount(0);
});

test("contractor presence has actionable setup and profile sharing", async ({
  page,
}) => {
  await mount(page, "presence");
  await expect(
    page.getByRole("link", { name: "View public profile" }),
  ).toHaveAttribute("href", /#\/profile\?slug=bay-plumbing/);
  await expect(
    page.getByRole("button", { name: "Copy profile link" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit business profile" }).click();
  expect(
    await page.evaluate(() =>
      (window as FixtureWindow).discoverCalls.some(
        (call: Call) => call.name === "edit_profile",
      ),
    ),
  ).toBe(true);
});

test('publishing requires deliberate public-content acknowledgment', async ({ page }) => {
  await mount(page, 'feed', 'delete-error');
  await page.getByPlaceholder('e.g. Spring HVAC maintenance reminder').fill('Public example');
  await page.getByRole('button', { name: 'Create Post', exact: true }).click();
  await expect(page.getByText('Confirm you have permission to publish this content.')).toBeVisible();
  expect(await page.evaluate(() => (window as FixtureWindow).discoverCalls.some(call => call.name === 'servsync_create_contractor_post'))).toBe(false);
});

test('saved post filters do not imply geographic filtering', async ({ page }) => {
  await mount(page, 'feed');
  await page.getByRole('button', { name: 'Saved Posts' }).click();
  await expect(page.getByLabel('Search by ZIP or city')).toBeDisabled();
  await expect(page.getByText('Saved posts are shown across all areas.', { exact: false })).toBeVisible();
});
