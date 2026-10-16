import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createLocalFixture,
  OWNER,
  CONTRACTOR,
  OTHER_OWNER,
  OTHER_CONTRACTOR,
  SNAPSHOT,
} from "../../scripts/practice/local-fixture";
import { commitToTestDestination } from "../../scripts/practice/test-destination";
import { query, sql } from "../../server/practice/localDatabase";
import { LocalPracticeStore } from "../../server/practice/store";
import {
  sanitizePracticeDraft,
  sanitizeSnapshot,
  retentionNotice,
  validatePracticePreview,
} from "../../src/features/practice/contracts";
import { createBlankSharedDraftComposerDraft } from "../../src/features/drafts/draftComposerMappings";
import { createWorkComposerLineDraft } from "../../src/features/work-composer/workComposerDrafts";
import {
  applyDisposableCleanup,
  practiceCleanupDryRun,
} from "../../server/practice/cleanup";

let fixture: Awaited<ReturnType<typeof createLocalFixture>>;
let store: LocalPracticeStore;
let other: LocalPracticeStore;
let workspace: string;
const draft = () =>
  createBlankSharedDraftComposerDraft({
    title: "Practice repair",
    scope: "Repair the fictional fixture",
    intended_output: "estimate",
    line_items: [
      createWorkComposerLineDraft({
        line_title: "Repair",
        unit_price: "125",
        quantity: "2",
      }),
    ],
  });
async function isolatedOwner() {
  const actor = randomUUID(),
    contractor = randomUUID();
  await query(
    fixture.db,
    OWNER,
    `insert into practice.owners values('${contractor}','${actor}',true); select '{}'::json;`,
    "postgres",
  );
  const own = new LocalPracticeStore(fixture.db, actor, contractor);
  return { own, w: await own.start(SNAPSHOT) };
}
async function expire(id: string) {
  // Test setup only: app role cannot change cycle clocks or disable triggers.
  await query(
    fixture.db,
    OWNER,
    `alter table practice.workspaces disable trigger guard_workspace; update practice.workspaces set created_at=clock_timestamp()-interval '31 days',expires_at=clock_timestamp()-interval '1 day' where id=${sql(id)}; alter table practice.workspaces enable trigger guard_workspace; select '{}'::json;`,
    "postgres",
  );
}
before(async () => {
  fixture = await createLocalFixture();
  store = new LocalPracticeStore(fixture.db, OWNER, CONTRACTOR);
  other = new LocalPracticeStore(fixture.db, OTHER_OWNER, OTHER_CONTRACTOR);
  workspace = (await store.start(SNAPSHOT)).id;
});
after(() => fixture?.close());

test("real PostgreSQL persistence, duplicate-create recovery and stale-write rejection", async () => {
  const id = randomUUID();
  const saved = await store.save(workspace, id, 0, draft());
  fixture.restart();
  const resumed = new LocalPracticeStore(fixture.db, OWNER, CONTRACTOR);
  assert.equal(
    (await resumed.drafts(workspace)).find((d) => d.id === id)?.payload.title,
    "Practice repair",
  );
  assert.equal((await resumed.save(workspace, id, 0, draft())).id, id);
  assert.equal((await resumed.save(workspace, id, 1, draft())).revision, 2);
  await assert.rejects(resumed.save(workspace, id, 1, draft()), /changed/);
  assert.equal(saved.revision, 1);
});
test("RLS denies another tenant, field actor, revoked owner and ownership reassignment", async () => {
  assert.deepEqual(await other.drafts(workspace), []);
  await assert.rejects(other.save(workspace, randomUUID(), 0, draft()));
  const field = new LocalPracticeStore(fixture.db, randomUUID(), CONTRACTOR);
  await assert.rejects(field.start(SNAPSHOT));
  await assert.rejects(
    query(
      fixture.db,
      OWNER,
      `update practice.workspaces set contractor_id='${OTHER_CONTRACTOR}' where id='${workspace}'; select '{}'::json;`,
    ),
  );
  await query(
    fixture.db,
    OWNER,
    `update practice.owners set enabled=false where contractor_id='${CONTRACTOR}'; select '{}'::json;`,
    "postgres",
  );
  assert.deepEqual(await store.workspaces(), []);
  await query(
    fixture.db,
    OWNER,
    `update practice.owners set enabled=true where contractor_id='${CONTRACTOR}'; select '{}'::json;`,
    "postgres",
  );
});
test("snapshot and work allowlists exclude tokens, contacts, private costs and notes", () => {
  const s = sanitizeSnapshot({
    ...SNAPSHOT,
    secret: "SECRET",
    business: { ...SNAPSHOT.business, apiKey: "SECRET" },
    prices: SNAPSHOT.prices.map((p) => ({
      ...p,
      internal_cost_cents: 1,
      internal_notes: "SECRET",
    })),
  });
  assert.ok(!JSON.stringify(s).includes("SECRET"));
  const d = sanitizePracticeDraft({
    ...draft(),
    homeowner_user_id: OWNER,
    notes: "SECRET",
    line_items: [{ ...draft().line_items[0], internal_notes: "SECRET" }],
  });
  assert.equal(d.homeowner_user_id, "");
  assert.equal(d.local_contact_id, "practice-customer");
  assert.ok(!JSON.stringify(d).includes("SECRET"));
  assert.throws(
    () =>
      sanitizeSnapshot({
        ...SNAPSHOT,
        prices: Array(501).fill(SNAPSHOT.prices[0]),
      }),
    /limits/,
  );
});
test("canonical money totals, blank versus zero, invalid inputs and warning thresholds", () => {
  assert.equal(validatePracticePreview(draft()).totalCents, 25000);
  const d = draft();
  d.line_items[0].unit_price = "";
  assert.throws(() => validatePracticePreview(d), /Price every/);
  d.line_items[0].unit_price = "0";
  assert.equal(validatePracticePreview(d).totalCents, 0);
  d.line_items[0].quantity = "NaN";
  assert.throws(() => validatePracticePreview(d));
  const expiry = Date.parse("2026-11-15T10:00:00Z");
  assert.equal(
    retentionNotice(new Date(expiry).toISOString(), expiry - 7 * 86400000 - 1),
    "active",
  );
  assert.equal(
    retentionNotice(new Date(expiry).toISOString(), expiry - 7 * 86400000),
    "seven_days",
  );
  assert.equal(
    retentionNotice(new Date(expiry).toISOString(), expiry - 86400000),
    "one_day",
  );
  assert.equal(
    retentionNotice(new Date(expiry).toISOString(), expiry),
    "expired",
  );
});
test("create-only transfer, explicit hash approval, retries and stripping fictional relationship IDs", async () => {
  const d = await store.save(workspace, randomUUID(), 0, draft());
  const op = randomUUID();
  const review = await store.review(workspace, d.id, d.revision, op);
  assert.equal(review.payload?.local_contact_id, "");
  await assert.rejects(
    commitToTestDestination(fixture.destination, store, op, "bad"),
    /Approval/,
  );
  const r = await commitToTestDestination(
    fixture.destination,
    store,
    op,
    review.package_hash,
  );
  assert.equal(
    (
      await commitToTestDestination(
        fixture.destination,
        store,
        op,
        review.package_hash,
      )
    ).destination_id,
    r.destination_id,
  );
  const records = await query<Array<{ status: string }>>(
    fixture.destination,
    OWNER,
    `select json_agg(d) from destination_drafts d;`,
    "postgres",
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "draft");
  assert.equal((await store.transfer(op)).payload, null);
  await assert.rejects(
    commitToTestDestination(
      fixture.destination,
      other,
      op,
      review.package_hash,
    ),
  );
});
test("edited Draft invalidates review; cancelled review writes no destination", async () => {
  const d = await store.save(workspace, randomUUID(), 0, draft());
  const review = await store.review(workspace, d.id, d.revision, randomUUID());
  await store.save(workspace, d.id, d.revision, draft());
  await assert.rejects(store.beginTransfer(review.id, review.package_hash));
  await store.cancelReview(review.id);
  assert.equal((await store.transfer(review.id)).status, "cancelled");
});
test("generated files are bounded and app cannot invoke cleanup or extend expiry", async () => {
  const w = await other.start(SNAPSHOT);
  for (let i = 0; i < 10; i++)
    await other.file(w.id, randomUUID(), new TextEncoder().encode("%PDF-test"));
  await assert.rejects(
    other.file(w.id, randomUUID(), new TextEncoder().encode("%PDF-test")),
    /quota/,
  );
  await assert.rejects(
    other.file(w.id, randomUUID(), new Uint8Array(5 * 1024 * 1024 + 1)),
    /5 MiB/,
  );
  await assert.rejects(
    query(
      fixture.db,
      OWNER,
      `select practice.cleanup_disposable(${sql(fixture.db.database)},'${workspace}',now());`,
    ),
    /permission/,
  );
  await assert.rejects(
    query(
      fixture.db,
      OWNER,
      `update practice.workspaces set expires_at=now()+interval '90 days' where id='${workspace}'; select '{}'::json;`,
    ),
    /permission/,
  );
});
test("cleanup is dry-run, exact-target guarded and idempotent; fresh cycle and destination survive", async () => {
  const { own, w } = await isolatedOwner();
  const d = await own.save(w.id, randomUUID(), 0, draft());
  await own.file(w.id, randomUUID(), new TextEncoder().encode("%PDF-owned"));
  const review = await own.review(w.id, d.id, d.revision, randomUUID());
  const receipt = await commitToTestDestination(
    fixture.destination,
    own,
    review.id,
    review.package_hash,
  );
  await expire(w.id);
  assert.deepEqual(await own.drafts(w.id), []);
  await assert.rejects(own.save(w.id, randomUUID(), 0, draft()), /expired/);
  const c = (await practiceCleanupDryRun(fixture.db)).find(
    (c) => c.workspace_id === w.id,
  )!;
  assert.equal(c.file_count, 1);
  assert.equal(c.blocked, false);
  assert.equal((await own.workspaces()).length, 1); // dry-run made no deletion
  await assert.rejects(
    applyDisposableCleanup(fixture.db, c, "production"),
    /mismatch/,
  );
  await assert.rejects(
    applyDisposableCleanup(
      fixture.db,
      { ...c, expires_at: new Date().toISOString() },
      fixture.db.database,
    ),
    /changed/,
  );
  const fresh = await own.start({
    ...SNAPSHOT,
    business: { ...SNAPSHOT.business, name: "New snapshot" },
  });
  const result = await Promise.all([
    applyDisposableCleanup(fixture.db, c, fixture.db.database),
    applyDisposableCleanup(fixture.db, c, fixture.db.database),
  ]);
  assert.deepEqual(result.sort(), [false, true]);
  assert.equal((await own.workspaces())[0].id, fresh.id);
  assert.equal(
    await query(
      fixture.destination,
      OWNER,
      `select to_json(count(*)) from destination_drafts where id='${receipt.destination_id}';`,
      "postgres",
    ),
    1,
  );
  assert.equal(
    await query(
      fixture.db,
      OWNER,
      `select to_json(count(*)) from practice.files where workspace_id='${w.id}';`,
      "postgres",
    ),
    0,
  );
  assert.equal((await store.workspaces())[0].id, workspace); // unrelated tenant untouched
});
test("active transfer pins expired payloads until reconciliation; cleanup cannot race it", async () => {
  const { own, w } = await isolatedOwner();
  const d = await own.save(w.id, randomUUID(), 0, draft());
  const review = await own.review(w.id, d.id, d.revision, randomUUID());
  const attempts = await Promise.allSettled([
    own.beginTransfer(review.id, review.package_hash),
    own.beginTransfer(review.id, review.package_hash),
  ]);
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  await expire(w.id);
  const c = (await practiceCleanupDryRun(fixture.db)).find(
    (c) => c.workspace_id === w.id,
  )!;
  assert.equal(c.blocked, true);
  await assert.rejects(
    applyDisposableCleanup(fixture.db, c, fixture.db.database),
    /Active transfer/,
  );
  await assert.rejects(own.start(SNAPSHOT), /pending transfer/);
  // Synthetic reconciliation: verified destination receipt means the payload can be discarded.
  await own.finishTransfer(review.id, randomUUID());
  assert.equal((await own.transfer(review.id)).payload, null);
  assert.equal(
    await applyDisposableCleanup(fixture.db, c, fixture.db.database),
    true,
  );
});
test("concurrent writers cannot exceed Draft quota; snapshots refresh without overwriting saved work", async () => {
  const { own, w } = await isolatedOwner();
  for (let i = 0; i < 49; i++) await own.save(w.id, randomUUID(), 0, draft());
  const result = await Promise.allSettled([
    own.save(w.id, randomUUID(), 0, draft()),
    own.save(w.id, randomUUID(), 0, draft()),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await own.drafts(w.id)).length, 50);
  const refreshed = await own.refresh(w.id, w.revision, {
    ...SNAPSHOT,
    business: { ...SNAPSHOT.business, laborRate: "90" },
  });
  assert.equal(refreshed.revision, 2);
  assert.equal(
    (await own.drafts(w.id))[0].payload.labor_rate,
    draft().labor_rate,
  );
  await assert.rejects(own.refresh(w.id, 1, SNAPSHOT), /changed/);
});
test("file byte quota is enforced across concurrent requests and no shared file references exist", async () => {
  const { own, w } = await isolatedOwner();
  const bytes = new Uint8Array(5 * 1024 * 1024);
  bytes.set(new TextEncoder().encode("%PDF-"));
  for (let i = 0; i < 3; i++) await own.file(w.id, randomUUID(), bytes);
  const result = await Promise.allSettled([
    own.file(w.id, randomUUID(), bytes),
    own.file(w.id, randomUUID(), bytes),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    await query(
      fixture.db,
      OWNER,
      `select to_json(sum(octet_length(bytes))) from practice.files where workspace_id='${w.id}';`,
      "postgres",
    ),
    20 * 1024 * 1024,
  );
});
test("terminal transfer prevents replay after finite minimal receipt retention", async () => {
  const { own, w } = await isolatedOwner();
  const d = await own.save(w.id, randomUUID(), 0, draft());
  const review = await own.review(w.id, d.id, d.revision, randomUUID());
  const receipt = await commitToTestDestination(
    fixture.destination,
    own,
    review.id,
    review.package_hash,
  );
  // Disposable destination fixture only; the deployed receipt purge is not implemented/enabled.
  await query(
    fixture.destination,
    OWNER,
    `update transfer_receipts set expires_at=now()-interval '1 second' where operation_id='${review.id}'; delete from transfer_receipts where expires_at<=now(); select '{}'::json;`,
    "postgres",
  );
  await assert.rejects(
    commitToTestDestination(
      fixture.destination,
      own,
      review.id,
      review.package_hash,
    ),
    /reconciliation/,
  );
  assert.equal(
    await query(
      fixture.destination,
      OWNER,
      `select to_json(count(*)) from destination_drafts where id='${receipt.destination_id}';`,
      "postgres",
    ),
    1,
  );
});
test("a lost completion acknowledgement recovers the same receipt without duplicating destination work", async () => {
  const { own, w } = await isolatedOwner();
  const d = await own.save(w.id, randomUUID(), 0, draft());
  const r = await own.review(w.id, d.id, d.revision, randomUUID());
  const original = own.finishTransfer.bind(own);
  let lost = true;
  own.finishTransfer = async (operation, destination) => {
    if (lost) {
      lost = false;
      throw new Error("Simulated interrupted acknowledgement");
    }
    return original(operation, destination);
  };
  await assert.rejects(
    commitToTestDestination(fixture.destination, own, r.id, r.package_hash),
    /interrupted/,
  );
  assert.equal((await own.transfer(r.id)).status, "committing");
  const receipt = await commitToTestDestination(
    fixture.destination,
    own,
    r.id,
    r.package_hash,
  );
  assert.equal((await own.transfer(r.id)).status, "complete");
  assert.equal(
    await query(
      fixture.destination,
      OWNER,
      `select to_json(count(*)) from destination_drafts where id='${receipt.destination_id}';`,
      "postgres",
    ),
    1,
  );
});
test("database accepts only one active cycle under concurrent start; cycle expiry is fixed", async () => {
  const actor = randomUUID(),
    contractor = randomUUID();
  await query(
    fixture.db,
    OWNER,
    `insert into practice.owners values('${contractor}','${actor}',true);select '{}'::json;`,
    "postgres",
  );
  const own = new LocalPracticeStore(fixture.db, actor, contractor);
  const result = await Promise.allSettled([
    own.start(SNAPSHOT),
    own.start(SNAPSHOT),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  const w = (await own.workspaces())[0];
  assert.equal(
    Date.parse(w.expires_at) - Date.parse(w.created_at),
    30 * 86400000,
  );
});
test("SQL text is escaped, and a remote database target is rejected before connecting", async () => {
  const value = draft();
  value.title = "Repair '); drop schema practice cascade; --";
  const saved = await store.save(workspace, randomUUID(), 0, value);
  assert.equal(saved.payload.title, value.title);
  await assert.rejects(
    query({ ...fixture.db, database: "postgres" }, OWNER, "select '{}'::json;"),
    /Local database/,
  );
});
