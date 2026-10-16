import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  createLocalFixture,
  OWNER,
  CONTRACTOR,
  OTHER_OWNER,
  OTHER_CONTRACTOR,
  SNAPSHOT,
} from "../../scripts/practice/local-fixture";
import {
  acceptPreparedTestTransfer,
  commitToTestDestination,
  reconcileTestOperation,
  reconcileTestOperations,
  recordTestResolution,
  pruneTestReceipts,
} from "../../scripts/practice/test-destination";
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
  pruneDisposableOperations,
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
  assert.throws(() => validatePracticePreview(d), /Price line/);
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
  const request = randomUUID();
  const review = await store.review(workspace, d.id, d.revision, request);
  const op = review.id;
  assert.equal(
    (await store.review(workspace, d.id, d.revision, request)).id,
    op,
  );
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
  await assert.rejects(
    query(
      fixture.db,
      OWNER,
      "delete from practice.workspaces; select '{}'::json;",
      "practice_cleanup",
    ),
    /permission/,
  );
  await assert.rejects(
    query(
      fixture.db,
      OWNER,
      "select json_agg(payload) from practice.drafts;",
      "practice_cleanup",
    ),
    /permission/,
  );
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
  assert.deepEqual(result.sort(), [false, false]); // fresh start already removed this expired cycle
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
test("expired committing payloads can be purged and fresh cycles start while recovery survives", async () => {
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
  assert.equal(c.blocked, false);
  const cleanup = await Promise.all([
    applyDisposableCleanup(fixture.db, c, fixture.db.database),
    applyDisposableCleanup(fixture.db, c, fixture.db.database),
  ]);
  assert.deepEqual(cleanup.sort(), [false, true]);
  assert.equal((await own.operation(review.id))?.status, "committing");
  assert.ok(await own.start(SNAPSHOT));
  await assert.rejects(own.transfer(review.id));
  assert.equal(
    await query(
      fixture.db,
      OWNER,
      `select to_json(count(*)) from practice.transfers where id='${review.id}';`,
      "postgres",
    ),
    0,
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
  assert.equal(
    (
      await commitToTestDestination(
        fixture.destination,
        own,
        review.id,
        review.package_hash,
      )
    ).destination_id,
    receipt.destination_id,
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

test("expiry is enforced by database reads and privileged recovery cannot read payloads", async () => {
  const { own, w } = await isolatedOwner();
  const d = await own.save(w.id, randomUUID(), 0, draft());
  await own.file(w.id, randomUUID(), new TextEncoder().encode("%PDF-secret"));
  const r = await own.review(w.id, d.id, d.revision, randomUUID());
  await own.beginTransfer(r.id, r.package_hash);
  await expire(w.id);
  for (const table of ["workspaces", "drafts", "files", "transfers"]) {
    assert.equal(
      await query(
        fixture.db,
        own.actor,
        `select to_json(count(*)) from practice.${table};`,
      ),
      0,
      table,
    );
    await assert.rejects(
      query(
        fixture.db,
        own.actor,
        `select to_json(count(*)) from practice.${table};`,
        "practice_reconcile",
      ),
      /permission/,
    );
  }
  assert.equal((await own.workspaces())[0].snapshot, null);
  assert.equal(await other.operation(r.id), null);
  await assert.rejects(
    query(fixture.db, own.actor, `select * from practice.operations;`),
    /permission/,
  );
  await assert.rejects(
    query(
      fixture.db,
      own.actor,
      `select practice.resolve_operation('${r.id}','${own.contractor}','${r.package_hash}','complete','${randomUUID()}');`,
    ),
    /permission/,
  );
  await assert.rejects(
    query(
      fixture.db,
      own.actor,
      `update practice.transfers set status='complete',payload=null,destination_id='${randomUUID()}' where id='${r.id}';`,
    ),
    /permission/,
  );
  await query(
    fixture.db,
    OWNER,
    `update practice.owners set enabled=false where contractor_id='${own.contractor}'; select '{}'::json;`,
    "postgres",
  );
  assert.deepEqual(await own.workspaces(), []);
  assert.equal(await own.operation(r.id), null);
  await assert.rejects(
    commitToTestDestination(fixture.destination, own, r.id, r.package_hash),
  );
});

test("lost acknowledgement recovers after source purge and revoked ownership without another write", async () => {
  const { own, w } = await isolatedOwner();
  const d = await own.save(w.id, randomUUID(), 0, draft());
  const r = await own.review(w.id, d.id, d.revision, randomUUID());
  const prepared = await own.beginTransfer(r.id, r.package_hash);
  const identity = (await own.operation(r.id))!;
  const receipt = await acceptPreparedTestTransfer(
    fixture.destination,
    own.contractor,
    prepared,
  );
  await expire(w.id);
  const c = (await practiceCleanupDryRun(fixture.db)).find(
    (c) => c.workspace_id === w.id,
  )!;
  await applyDisposableCleanup(fixture.db, c, fixture.db.database);
  await query(
    fixture.db,
    OWNER,
    `update practice.owners set enabled=false where contractor_id='${own.contractor}';select '{}'::json;`,
    "postgres",
  );
  await assert.rejects(
    commitToTestDestination(fixture.destination, own, r.id, r.package_hash),
  );
  const recovered = await reconcileTestOperation(fixture.destination, identity);
  assert.equal(recovered?.destination_id, receipt.destination_id);
  assert.equal(
    (await recordTestResolution(fixture.db, identity, recovered))?.status,
    "complete",
  );
  const repeated = await Promise.all([
    recordTestResolution(fixture.db, identity, recovered),
    recordTestResolution(fixture.db, identity, recovered),
  ]);
  assert.ok(
    repeated.every((r) => r?.destination_id === receipt.destination_id),
  );
  assert.equal(
    await query(
      fixture.destination,
      OWNER,
      `select to_json(count(*)) from destination_drafts where operation_id='${r.id}';`,
      "postgres",
    ),
    1,
  );
  await assert.rejects(
    reconcileTestOperation(fixture.destination, {
      ...identity,
      contractor_id: OTHER_CONTRACTOR,
    }),
    /identity conflict/,
  );
});

test("destination cancellation fence serializes late commits and never erases an uncertain write", async () => {
  const { own, w } = await isolatedOwner();
  const d = await own.save(w.id, randomUUID(), 0, draft());
  const r = await own.review(w.id, d.id, d.revision, randomUUID());
  const prepared = await own.beginTransfer(r.id, r.package_hash);
  const identity = (await own.operation(r.id))!;
  const past = new Date(Date.now() - 1000).toISOString();
  // Narrow the trusted admission window to simulate its passage without waiting ten minutes.
  const outcomes = await Promise.allSettled([
    acceptPreparedTestTransfer(fixture.destination, own.contractor, {
      ...prepared,
      expires_at: past,
    }),
    reconcileTestOperation(fixture.destination, {
      ...identity,
      admission_deadline: past,
    }),
  ]);
  assert.equal(outcomes[0].status, "rejected");
  assert.equal(outcomes[1].status, "fulfilled");
  const resolution = await reconcileTestOperation(fixture.destination, {
    ...identity,
    admission_deadline: past,
  });
  assert.equal(resolution?.status, "cancelled");
  // Even a still-in-memory original package cannot write after the fence exists.
  await assert.rejects(
    acceptPreparedTestTransfer(fixture.destination, own.contractor, prepared),
    /cancelled/,
  );
  assert.equal(
    (await recordTestResolution(fixture.db, identity, resolution))?.status,
    "cancelled",
  );
  assert.equal(
    await query(
      fixture.destination,
      OWNER,
      `select to_json(count(*)) from destination_drafts where operation_id='${r.id}';`,
      "postgres",
    ),
    0,
  );
});

test("admission is rechecked after waiting on the destination operation lock", async () => {
  const { own, w } = await isolatedOwner();
  const d = await own.save(w.id, randomUUID(), 0, draft());
  const r = await own.review(w.id, d.id, d.revision, randomUUID());
  const prepared = await own.beginTransfer(r.id, r.package_hash);
  // Wait until PostgreSQL confirms the blocker actually owns the operation lock.
  const blocker = query(
    fixture.destination,
    OWNER,
    `select pg_advisory_xact_lock(hashtextextended('${r.id}',0)); select pg_sleep(0.6);select '{}'::json;`,
    "postgres",
  );
  let locked = false;
  for (let i = 0; i < 30 && !locked; i++) {
    locked = await query(
      fixture.destination,
      OWNER,
      `select to_json(exists(select 1 from pg_locks where locktype='advisory' and granted));`,
      "postgres",
    );
  }
  assert.ok(locked);
  await assert.rejects(
    acceptPreparedTestTransfer(fixture.destination, own.contractor, {
      ...prepared,
      expires_at: new Date(Date.now() + 100).toISOString(),
    }),
    /expired/,
  );
  await blocker;
});

test("bounded recovery retries surface unknown outcomes and finite metadata purge cannot replay stale IDs", async () => {
  const { own, w } = await isolatedOwner();
  const d = await own.save(w.id, randomUUID(), 0, draft());
  const r = await own.review(w.id, d.id, d.revision, randomUUID());
  const prepared = await own.beginTransfer(r.id, r.package_hash);
  for (let i = 0; i < 12; i++) {
    await query(
      fixture.db,
      OWNER,
      `update practice.operations set next_attempt_at=clock_timestamp()-interval '1 hour' where id='${r.id}';select '{}'::json;`,
      "postgres",
    );
    await reconcileTestOperations(fixture.db, {
      ...fixture.destination,
      database: "servsync_destination_local_deadbeef",
    });
  }
  const identity = (await own.operation(r.id))!;
  assert.equal(identity.status, "needs_review");
  assert.equal(identity.attempts, 12);
  await reconcileTestOperations(fixture.db, fixture.destination);
  assert.equal((await own.operation(r.id))?.attempts, 12);
  await expire(w.id);
  assert.ok(await own.start(SNAPSHOT));
  await query(
    fixture.db,
    OWNER,
    `update practice.operations set retain_until=clock_timestamp()-interval '1 second' where id='${r.id}';select '{}'::json;`,
    "postgres",
  );
  const pruned = await pruneDisposableOperations(fixture.db);
  assert.ok(pruned.unresolved >= 1);
  assert.equal(await own.operation(r.id), null);
  const oldPrefix = (Date.now() - 91 * 86400000).toString(16).padStart(12, "0");
  const agedId =
    oldPrefix.slice(0, 8) + "-" + oldPrefix.slice(8) + prepared.id.slice(13);
  // An old server ID remains expired even if a caller tries to renew the supplied deadline.
  await assert.rejects(
    acceptPreparedTestTransfer(fixture.destination, own.contractor, {
      ...prepared,
      id: agedId,
      expires_at: new Date(Date.now() + 600000).toISOString(),
    }),
    /expired/,
  );
  await assert.rejects(
    commitToTestDestination(fixture.destination, own, r.id, r.package_hash),
  );
});

test("source and receipt pruning preserve permanent destination identity and tenant bounds", async () => {
  const { own, w } = await isolatedOwner();
  const d = await own.save(w.id, randomUUID(), 0, draft());
  const r = await own.review(w.id, d.id, d.revision, randomUUID());
  const prepared = await own.beginTransfer(r.id, r.package_hash);
  const receipt = await acceptPreparedTestTransfer(
    fixture.destination,
    own.contractor,
    prepared,
  );
  await query(
    fixture.destination,
    OWNER,
    `update transfer_receipts set expires_at=clock_timestamp()-interval '1 second' where operation_id='${r.id}';select '{}'::json;`,
    "postgres",
  );
  assert.ok(await pruneTestReceipts(fixture.destination));
  const recovered = await acceptPreparedTestTransfer(
    fixture.destination,
    own.contractor,
    { ...prepared, expires_at: "2000-01-01T00:00:00Z" },
  );
  assert.equal(recovered.destination_id, receipt.destination_id);
  await assert.rejects(
    acceptPreparedTestTransfer(fixture.destination, OTHER_CONTRACTOR, prepared),
    /identity conflict/,
  );
  await assert.rejects(
    acceptPreparedTestTransfer(fixture.destination, own.contractor, {
      ...prepared,
      package_hash: "0".repeat(64),
    }),
    /identity conflict/,
  );
  await assert.rejects(
    query(
      fixture.destination,
      OWNER,
      "select * from destination_drafts;",
      "practice_destination_reconcile",
    ),
    /permission/,
  );
  await assert.rejects(
    query(
      fixture.destination,
      OWNER,
      `select destination_accept('${r.id}','${own.contractor}','${r.package_hash}',now(),'{}');`,
      "practice_destination_reconcile",
    ),
    /permission/,
  );
});

test("concurrent workers claim once and stale retries cannot consume the budget or overwrite completion", async () => {
  const { own, w } = await isolatedOwner();
  const d = await own.save(w.id, randomUUID(), 0, draft());
  const r = await own.review(w.id, d.id, d.revision, randomUUID());
  const prepared = await own.beginTransfer(r.id, r.package_hash);
  const batches = await Promise.all(
    Array.from({ length: 8 }, () =>
      query<
        import("../../src/features/practice/contracts").PracticeOperation[]
      >(
        fixture.db,
        OWNER,
        "select coalesce(jsonb_agg(o),'[]'::jsonb) from practice.reconciliation_batch(20) o;",
        "practice_reconcile",
      ),
    ),
  );
  const claims = batches.flat().filter((o) => o.id === r.id);
  assert.equal(claims.length, 1);
  assert.equal((await own.operation(r.id))?.attempts, 1);
  const receipt = await acceptPreparedTestTransfer(
    fixture.destination,
    own.contractor,
    prepared,
  );
  const complete = await reconcileTestOperation(fixture.destination, claims[0]);
  await recordTestResolution(fixture.db, claims[0], complete);
  const stale = await Promise.all(
    Array.from({ length: 15 }, () =>
      recordTestResolution(fixture.db, claims[0], null),
    ),
  );
  assert.deepEqual(
    stale.map((o) => ({
      status: o?.status,
      attempts: o?.attempts,
      destination: o?.destination_id,
    })),
    Array.from({ length: 15 }, () => ({
      status: "complete",
      attempts: 1,
      destination: receipt.destination_id,
    })),
    "Stale retries must preserve the completed operation and claimed attempt count",
  );
  await query(
    fixture.db,
    OWNER,
    `update practice.operations set retain_until=clock_timestamp()-interval '1 second' where id='${r.id}';select '{}'::json;`,
    "postgres",
  );
  await pruneDisposableOperations(fixture.db);
  assert.equal(
    await recordTestResolution(fixture.db, claims[0], complete),
    null,
  );
});

test("fresh start races cleanup and committed-write reconciliation without losing either cycle or destination", async () => {
  const { own, w } = await isolatedOwner();
  const d = await own.save(w.id, randomUUID(), 0, draft());
  const r = await own.review(w.id, d.id, d.revision, randomUUID());
  const prepared = await own.beginTransfer(r.id, r.package_hash);
  const identity = (await own.operation(r.id))!;
  const receipt = await acceptPreparedTestTransfer(
    fixture.destination,
    own.contractor,
    prepared,
  );
  const resolution = await reconcileTestOperation(
    fixture.destination,
    identity,
  );
  await expire(w.id);
  const c = (await practiceCleanupDryRun(fixture.db)).find(
    (c) => c.workspace_id === w.id,
  )!;
  const [fresh, , resolved] = await Promise.all([
    own.start(SNAPSHOT),
    applyDisposableCleanup(fixture.db, c, fixture.db.database),
    recordTestResolution(fixture.db, identity, resolution),
  ]);
  assert.equal((await own.workspaces())[0].id, fresh.id);
  assert.equal(resolved?.destination_id, receipt.destination_id);
  assert.equal((await own.operation(r.id))?.status, "complete");
  assert.equal(
    await query(
      fixture.destination,
      OWNER,
      `select to_json(count(*)) from destination_drafts where operation_id='${r.id}';`,
      "postgres",
    ),
    1,
  );
});

test("an admissible destination commit races a cancellation fence with exactly one durable outcome", async () => {
  for (let i = 0; i < 4; i++) {
    const { own, w } = await isolatedOwner();
    const d = await own.save(w.id, randomUUID(), 0, draft());
    const r = await own.review(w.id, d.id, d.revision, randomUUID());
    const prepared = await own.beginTransfer(r.id, r.package_hash);
    const identity = (await own.operation(r.id))!;
    // Concurrent calls may observe opposite sides of a deadline; emulate that clock boundary.
    // Whichever obtains the shared operation lock first establishes the sole durable result.
    const jobs = [
      () =>
        acceptPreparedTestTransfer(
          fixture.destination,
          own.contractor,
          prepared,
        ),
      () =>
        reconcileTestOperation(fixture.destination, {
          ...identity,
          admission_deadline: "2000-01-01T00:00:00Z",
        }),
    ];
    await Promise.allSettled((i % 2 ? jobs.reverse() : jobs).map((f) => f()));
    const result = await reconcileTestOperation(fixture.destination, identity);
    const count = await query<number>(
      fixture.destination,
      OWNER,
      `select to_json(count(*)) from destination_drafts where operation_id='${r.id}';`,
      "postgres",
    );
    assert.ok(result);
    assert.equal(count, result.status === "complete" ? 1 : 0);
    if (result.status === "cancelled")
      await assert.rejects(
        acceptPreparedTestTransfer(
          fixture.destination,
          own.contractor,
          prepared,
        ),
        /cancelled/,
      );
    else
      assert.equal(
        (
          await acceptPreparedTestTransfer(
            fixture.destination,
            own.contractor,
            prepared,
          )
        ).destination_id,
        result.destination_id,
      );
  }
});

test("local query waits for stdout close and distinguishes missing output from SQL null", async () => {
  // Deterministic process contract: the launcher exits before its inherited stdout writer.
  // This reproduces exit-before-drain ordering without changing database behavior.
  const launcher = `${fixture.db.socket}/delayed-output.cjs`;
  writeFileSync(
    launcher,
    `#!/usr/bin/env node
const {spawn}=require('node:child_process');
process.stdin.resume();
process.stdin.on('end',()=>{
 const writer=spawn(process.execPath,['-e',"setTimeout(()=>process.stdout.write(JSON.stringify({status:'complete',attempts:1})),40)"],{stdio:['ignore','inherit','ignore']});
 writer.unref();
});
`,
    { mode: 0o700 },
  );
  assert.deepEqual(
    await query({ ...fixture.db, psql: launcher }, OWNER, "select null::json;"),
    { status: "complete", attempts: 1 },
  );
  await assert.rejects(
    query(fixture.db, OWNER, "select null::json where false;"),
    /Missing database result/,
  );
  assert.equal(await query(fixture.db, OWNER, "select null::json;"), null);
});

test('Practice currency normalization agrees with shared rounding and requires descriptions only at preview', () => {
  const d = draft();
  for (const [input, expected] of [['$125.25', 25050], ['1,250.50', 250100], ['125.255', 25052], ['.50', 100]]) {
    d.line_items[0].unit_price = String(input);
    assert.equal(validatePracticePreview(d).totalCents, expected);
  }
  d.line_items[0].unit_price = 'invalid';
  assert.throws(() => sanitizePracticeDraft(d), /non-negative price/);
  d.line_items[0].unit_price = '125.25'; d.line_items[0].line_title = ''; d.line_items[0].description = '';
  assert.doesNotThrow(() => sanitizePracticeDraft(d));
  assert.throws(() => validatePracticePreview(d), /Describe what line 1 covers/);
});
