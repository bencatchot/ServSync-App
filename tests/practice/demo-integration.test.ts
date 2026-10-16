import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createLocalFixture,
  OWNER,
  SNAPSHOT,
} from "../../scripts/practice/local-fixture";
import { query, sql } from "../../server/practice/localDatabase";
import {
  createDemoPracticeTransport,
  demoPracticePayload,
  PRACTICE_DEMO_ORIGIN,
  type DemoPracticeState,
} from "../../src/features/practice/demoTransport";
import { createBlankSharedDraftComposerDraft } from "../../src/features/drafts/draftComposerMappings";
import { createWorkComposerLineDraft } from "../../src/features/work-composer/workComposerDrafts";
import { validatePracticePreview } from "../../src/features/practice/contracts";

const migration = readFileSync(
  new URL(
    "../../server/practice/demo-draft/20261016171813_practice_demo_review_draft.sql",
    import.meta.url,
  ),
  "utf8",
);
let fixture: Awaited<ReturnType<typeof createLocalFixture>>;
const admin = <T = unknown>(statement: string) =>
  query<T>(fixture.db, OWNER, statement, "postgres");
const claimsFor = (actor: string, overrides = {}) => ({
  sub: actor,
  role: "authenticated",
  is_anonymous: false,
  iss: `${PRACTICE_DEMO_ORIGIN}/auth/v1`,
  ...overrides,
});
const asUser = <T = unknown>(
  actor: string,
  statement: string,
  overrides = {},
) =>
  admin<T>(
    `set session authorization authenticated; set local request.jwt.claims=${sql(claimsFor(actor, overrides))}; ${statement}`,
  );
const rpc = (
  actor: string,
  command: string,
  args: unknown = {},
  overrides = {},
) =>
  asUser<
    Omit<DemoPracticeState, "workspace"> & {
      workspace: NonNullable<DemoPracticeState["workspace"]>;
    }
  >(
    actor,
    `select public.servsync_practice_demo(${sql(command)},${sql(args)}::jsonb);`,
    overrides,
  );
const payload = () =>
  demoPracticePayload(
    createBlankSharedDraftComposerDraft({
      title: "Fictional repair",
      scope: "Synthetic fixture only",
      line_items: [
        createWorkComposerLineDraft({
          line_title: "Repair",
          unit_price: "125.25",
          quantity: "2",
        }),
      ],
    }),
  );
async function pilot() {
  const actor = randomUUID(),
    tenant = randomUUID();
  await admin(
    `insert into servsync_practice_demo.pilots values(${sql(actor)},${sql(tenant)},true,clock_timestamp()+interval '31 days'); select null::json;`,
  );
  return actor;
}
before(async () => {
  fixture = await createLocalFixture();
  await admin(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role demo_installer nologin createrole nosuperuser nobypassrls;
    grant create on database "${fixture.db.database}" to demo_installer;
    grant usage,create on schema public to demo_installer;
    -- Model legacy Supabase defaults; the draft must remove accidental ambient grants.
    alter default privileges for role demo_installer grant execute on functions to anon,authenticated,service_role;
    alter default privileges for role demo_installer grant all on tables to anon,authenticated,service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    grant usage on schema auth to authenticated;
    grant usage on schema auth to demo_installer with grant option;
    grant execute on function auth.uid(), auth.jwt() to demo_installer with grant option;
    -- Sentinel table: an accidental write to this fixture aborts the test. Hosted triggers are not simulated.
    create table public.practice_test_business_tripwire(id uuid);
    create function public.practice_test_no_write() returns trigger language plpgsql as $$begin raise exception 'OUTBOUND BUSINESS WRITE'; end$$;
    create trigger no_write before insert or update or delete on public.practice_test_business_tripwire for each statement execute function public.practice_test_no_write();
    select null::json;`);
  await assert.rejects(admin(migration), /Verified Demo target/);
  await assert.rejects(
    admin(
      `set local servsync.reviewed_demo_target='uqgtheclhxqlnjpfmheq'; ${migration}`,
    ),
    /Verified Demo target/,
  );
  await admin(
    `set session authorization demo_installer; set local servsync.reviewed_demo_target='bdytwgejqnlblhrnqxkp'; ${migration} select null::json;`,
  );
});
after(() => fixture?.close());

test("draft installer requires target acknowledgement; disposable installer still rejects auth catalogs", async () => {
  const local = readFileSync(
    new URL("../../server/practice/local-schema.sql", import.meta.url),
    "utf8",
  );
  await assert.rejects(admin(local), /Disposable|disposable|local/i);
  assert.equal(
    await admin("select to_json(count(*)) from servsync_practice_demo.pilots;"),
    0,
  );
});
test("non-superuser installation leaves no ambient function grants, role switching or schema-create capability", async () => {
  const evidence = await admin(`select json_build_object(
    'anonDispatch',has_function_privilege('anon','servsync_practice_demo.dispatch(text,jsonb)','EXECUTE'),
    'serviceDispatch',has_function_privilege('service_role','servsync_practice_demo.dispatch(text,jsonb)','EXECUTE'),
    'authDispatch',has_function_privilege('authenticated','servsync_practice_demo.dispatch(text,jsonb)','EXECUTE'),
    'authHelper',has_function_privilege('authenticated','servsync_practice_demo.synthetic_snapshot()','EXECUTE'),
    'create',has_schema_privilege('servsync_practice_demo_executor','servsync_practice_demo','CREATE'),
    'installerSet',pg_has_role('demo_installer','servsync_practice_demo_executor','SET'),
    'installerInherit',pg_has_role('demo_installer','servsync_practice_demo_executor','USAGE'));`);
  assert.deepEqual(evidence, {
    anonDispatch: false,
    serviceDispatch: false,
    authDispatch: true,
    authHelper: false,
    create: false,
    installerSet: false,
    installerInherit: false,
  });
});
test("anon, service role, anonymous users and unregistered users cannot enter; user_metadata cannot grant access", async () => {
  for (const role of ["anon", "service_role"])
    await assert.rejects(
      admin(
        `set local role ${role}; select public.servsync_practice_demo('start');`,
      ),
      /permission denied/,
    );
  const actor = await pilot();
  await assert.rejects(
    rpc(actor, "start", {}, { is_anonymous: true }),
    /pilot required/,
  );
  await assert.rejects(
    rpc(actor, "start", {}, { is_anonymous: null }),
    /pilot required/,
  );
  await assert.rejects(
    rpc(
      randomUUID(),
      "start",
      {},
      { user_metadata: { owner_id: actor, practice_enabled: true } },
    ),
    /pilot required/,
  );
});
test("start is idempotent and snapshot matches synthetic fixtures, never accepts input snapshot", async () => {
  const actor = await pilot();
  await assert.rejects(
    rpc(actor, "start", { snapshot: { business: { name: "Real business" } } }),
    /Unexpected/,
  );
  const [a, b] = await Promise.all([rpc(actor, "start"), rpc(actor, "start")]);
  assert.equal(a.workspace.id, b.workspace.id);
  assert.deepEqual(a.workspace.snapshot, SNAPSHOT);
  assert.equal(
    Date.parse(a.workspace.expires_at) - Date.parse(a.workspace.created_at),
    30 * 86400000,
  );
});
test("cross-tenant cycle IDs and raw table access fail; private function has the same access checks", async () => {
  const a = await pilot(),
    b = await pilot();
  const ca = await rpc(a, "start"),
    cb = await rpc(b, "start");
  await assert.rejects(
    rpc(b, "save", {
      workspace_id: ca.workspace.id,
      draft_id: randomUUID(),
      expected_revision: 0,
      payload: payload(),
    }),
    /Active Practice/,
  );
  assert.notEqual(ca.workspace.id, cb.workspace.id);
  for (const table of ["pilots", "cycles", "drafts"])
    await assert.rejects(
      asUser(
        a,
        `select row_to_json(x) from servsync_practice_demo.${table} x;`,
      ),
      /permission denied/,
    );
  await assert.rejects(
    asUser(
      randomUUID(),
      "select servsync_practice_demo.dispatch('start','{}');",
    ),
    /pilot required/,
  );
  await assert.rejects(
    asUser(
      a,
      "set local role servsync_practice_demo_executor; select null::json;",
    ),
    /permission denied/,
  );
});
test("direct RPC rejects private fields, nested customer IDs, malformed/null fields, oversized lines and unsupported operations", async () => {
  const a = await pilot(),
    c = await rpc(a, "start");
  const good = payload();
  for (const bad of [
    { ...good, notes: "private" },
    { ...good, snapshot: SNAPSHOT },
    { ...good, labor_mode: null },
    {
      ...good,
      line_items: [{ ...good.line_items[0], customer_id: randomUUID() }],
    },
    { ...good, line_items: [{ ...good.line_items[0], quantity: "-1" }] },
    { ...good, line_items: Array(101).fill(good.line_items[0]) },
    { ...good, scope: "x".repeat(10001) },
  ]) {
    await assert.rejects(
      rpc(a, "save", {
        workspace_id: c.workspace.id,
        draft_id: randomUUID(),
        expected_revision: 0,
        payload: bad,
      }),
      /Invalid|Too many/,
    );
  }
  for (const command of [
    "send",
    "transfer",
    "cleanup",
    "refresh",
    "export",
    "charge",
  ])
    await assert.rejects(rpc(a, command), /Unsupported/);
  assert.deepEqual((await rpc(a, "state")).drafts, []);
});
test("save/reload, concurrent CAS and lost-ack retry preserve one accurate draft", async () => {
  const actor = await pilot(),
    c = await rpc(actor, "start"),
    id = randomUUID();
  const args = {
    workspace_id: c.workspace.id,
    draft_id: id,
    expected_revision: 0,
    payload: payload(),
  };
  const saved = await rpc(actor, "save", args);
  assert.deepEqual(await rpc(actor, "save", args), saved);
  const results = await Promise.allSettled([
    rpc(actor, "save", {
      ...args,
      expected_revision: 1,
      payload: { ...payload(), title: "One" },
    }),
    rpc(actor, "save", {
      ...args,
      expected_revision: 1,
      payload: { ...payload(), title: "Two" },
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const state = await rpc(actor, "state");
  assert.equal(state.drafts.length, 1);
  assert.equal(state.drafts[0].revision, 2);
  assert.equal(
    validatePracticePreview(state.drafts[0].payload).totalCents,
    25050,
  );
  await assert.rejects(rpc(actor, "save", args), /revision conflict/);
});
test("expiry hides draft payloads and snapshots, rejects writes/renewal, never deletes stored content", async () => {
  const a = await pilot(),
    c = await rpc(a, "start");
  await rpc(a, "save", {
    workspace_id: c.workspace.id,
    draft_id: randomUUID(),
    expected_revision: 0,
    payload: payload(),
  });
  await admin(
    `update servsync_practice_demo.cycles set expires_at=clock_timestamp()-interval '1 second' where user_id=${sql(a)};select null::json;`,
  );
  const expired = await rpc(a, "state");
  assert.equal(expired.status, "expired");
  assert.equal(expired.workspace.snapshot, null);
  assert.deepEqual(expired.drafts, []);
  await assert.rejects(rpc(a, "start"), /expired/);
  await assert.rejects(
    rpc(a, "save", {
      workspace_id: c.workspace.id,
      draft_id: randomUUID(),
      expected_revision: 0,
      payload: payload(),
    }),
    /Active Practice/,
  );
  assert.equal(
    await admin(
      `select to_json(count(*)) from servsync_practice_demo.drafts where cycle_id=${sql(c.workspace.id)};`,
    ),
    1,
  );
  assert.equal(
    await admin(
      `set local request.jwt.claims=${sql(claimsFor(a))};set local role servsync_practice_demo_executor;select to_json(count(*)) from servsync_practice_demo.drafts where cycle_id=${sql(c.workspace.id)};`,
    ),
    0,
  );
});
test("revoking or expiring pilot access denies reads even with a previously valid JWT", async () => {
  for (const change of [
    "enabled=false",
    "access_until=clock_timestamp()-interval '1 second'",
  ]) {
    const a = await pilot();
    await rpc(a, "start");
    await admin(
      `update servsync_practice_demo.pilots set ${change} where user_id=${sql(a)};select null::json;`,
    );
    await assert.rejects(rpc(a, "state"), /pilot required/);
  }
});
test("quota bounds accumulation; no cleanup, cross-schema FKs or business capabilities are created", async () => {
  const a = await pilot(),
    c = await rpc(a, "start");
  await admin(
    `insert into servsync_practice_demo.drafts(id,cycle_id,payload) select gen_random_uuid(),${sql(c.workspace.id)},${sql(payload())}::jsonb from generate_series(1,50);select null::json;`,
  );
  await assert.rejects(
    rpc(a, "save", {
      workspace_id: c.workspace.id,
      draft_id: randomUUID(),
      expected_revision: 0,
      payload: payload(),
    }),
    /limit reached/,
  );
  const evidence = await admin(
    `select json_build_object('businessRows',(select count(*) from public.practice_test_business_tripwire),'deleteGrant',has_table_privilege('servsync_practice_demo_executor','servsync_practice_demo.drafts','DELETE'),'crossSchemaFK',(select count(*) from pg_constraint where connamespace='servsync_practice_demo'::regnamespace and contype='f' and confrelid not in(select oid from pg_class where relnamespace='servsync_practice_demo'::regnamespace)),'bypass',(select rolbypassrls from pg_roles where rolname='servsync_practice_demo_executor'),'triggers',(select count(*) from pg_trigger where not tgisinternal and tgrelid in(select oid from pg_class where relnamespace='servsync_practice_demo'::regnamespace)));`,
  );
  assert.deepEqual(evidence, {
    businessRows: 0,
    deleteGrant: false,
    crossSchemaFK: 0,
    bypass: false,
    triggers: 0,
  });
});

const jwt = (claims: object) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.synthetic-signature`;
test("transport targets only exact Demo RPC, strips private fields, and integrates with actual PostgreSQL", async () => {
  const actor = await pilot();
  const calls: Array<{ url: string; body: unknown }> = [];
  // Mock HTTP/Auth only: statements execute the real draft migration against disposable PostgreSQL.
  const fetchImpl: typeof fetch = async (input, options) => {
    const body = JSON.parse(String(options?.body));
    calls.push({ url: String(input), body });
    assert.equal(options?.redirect, "error");
    assert.equal(options?.credentials, "omit");
    return Response.json(await rpc(actor, body.command, body.arguments));
  };
  const transport = createDemoPracticeTransport({
    enabled: true,
    origin: PRACTICE_DEMO_ORIGIN,
    publicKey: "sb_publishable_synthetic",
    getAccessToken: async () => jwt(claimsFor(actor)),
    fetchImpl,
  });
  const c = await transport.start();
  const draft = {
    ...payload(),
    notes: "NEVER COPY",
    local_contact_id: randomUUID(),
    cost: 900,
    provider_token: "NEVER COPY",
  };
  await transport.save(c.workspace!.id, randomUUID(), 0, draft);
  const state = await transport.state();
  assert.equal(
    validatePracticePreview(state.drafts[0].payload).totalCents,
    25050,
  );
  assert.equal(calls.length, 3);
  assert(
    calls.every(
      (call) =>
        call.url ===
        `${PRACTICE_DEMO_ORIGIN}/rest/v1/rpc/servsync_practice_demo`,
    ),
  );
  assert(!JSON.stringify(calls).includes("NEVER COPY"));
  assert.deepEqual(Object.keys(transport).sort(), ["save", "start", "state"]);
});
test("blank lines resume and Unicode bounds match the real composer after direct RPC saves", async () => {
  const actor = await pilot();
  const transport = createDemoPracticeTransport({
    enabled: true,
    origin: PRACTICE_DEMO_ORIGIN,
    publicKey: "sb_publishable_synthetic",
    getAccessToken: async () => jwt(claimsFor(actor)),
    fetchImpl: async (_input, options) => {
      const body = JSON.parse(String(options?.body));
      return Response.json(await rpc(actor, body.command, body.arguments));
    },
  });
  const c = await transport.start();
  const blank = createBlankSharedDraftComposerDraft({
    title: "😀".repeat(100),
    line_items: [createWorkComposerLineDraft()],
  });
  const saved = await transport.save(c.workspace!.id, randomUUID(), 0, blank);
  assert.equal(saved.payload.line_items[0].line_title, "");
  const resumed = await transport.state();
  assert.equal(resumed.drafts.length, 1);
  assert.equal(resumed.drafts[0].payload.title, blank.title);
  await assert.rejects(
    rpc(actor, "save", {
      workspace_id: c.workspace!.id,
      draft_id: randomUUID(),
      expected_revision: 0,
      payload: { ...payload(), title: "😀".repeat(101) },
    }),
    /Invalid/,
  );
  await assert.rejects(
    rpc(actor, "save", {
      workspace_id: c.workspace!.id,
      draft_id: randomUUID(),
      expected_revision: 0,
      payload: {
        ...payload(),
        line_items: [
          { ...payload().line_items[0], line_title: "😀".repeat(251) },
        ],
      },
    }),
    /Invalid/,
  );
});
test("disabled/wrong project/privileged key/non-Demo token fail before any network request", async () => {
  let calls = 0;
  const base = {
    enabled: true,
    origin: PRACTICE_DEMO_ORIGIN,
    publicKey: "sb_publishable_synthetic",
    getAccessToken: async () => jwt(claimsFor(randomUUID())),
    fetchImpl: async () => {
      calls++;
      return Response.json({});
    },
  };
  for (const changes of [
    { enabled: undefined },
    { enabled: false },
    { origin: "https://uqgtheclhxqlnjpfmheq.supabase.co" },
    { origin: `${PRACTICE_DEMO_ORIGIN}/` },
    { publicKey: "sb_secret_fake" },
    { publicKey: jwt({ role: "service_role", ref: "bdytwgejqnlblhrnqxkp" }) },
    {
      getAccessToken: async () =>
        jwt(
          claimsFor(randomUUID(), {
            iss: "https://uqgtheclhxqlnjpfmheq.supabase.co/auth/v1",
          }),
        ),
    },
    {
      getAccessToken: async () =>
        jwt(claimsFor(randomUUID(), { is_anonymous: true })),
    },
  ]) {
    await assert.rejects(
      createDemoPracticeTransport({ ...base, ...changes }).state(),
    );
  }
  assert.equal(calls, 0);
});
