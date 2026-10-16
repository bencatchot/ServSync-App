// Synthetic destination ONLY. Never creates or resolves real ServSync Drafts.
import {
  query,
  sql,
  uuid,
  type LocalDatabase,
} from "../../server/practice/localDatabase";
import { LocalPracticeStore } from "../../server/practice/store";
import type {
  PracticeOperation,
  PracticeReceipt,
  PracticeReview,
} from "../../src/features/practice/contracts";

type Resolution = PracticeReceipt & { status: "complete" | "cancelled" };
const WORKER = "00000000-0000-4000-8000-000000000000";

export async function acceptPreparedTestTransfer(
  db: LocalDatabase,
  contractor: string,
  transfer: PracticeReview,
) {
  // Only trusted test-server code can call this; the browser never supplies this package/deadline.
  return query<PracticeReceipt>(
    db,
    WORKER,
    `select destination_accept(${sql(uuid(transfer.id))},${sql(uuid(contractor))},${sql(transfer.package_hash)},${sql(transfer.expires_at)}::timestamptz,${sql(transfer.payload)}::jsonb);`,
    "practice_destination",
  );
}
export async function reconcileTestOperation(
  db: LocalDatabase,
  operation: PracticeOperation,
) {
  return query<Resolution | null>(
    db,
    WORKER,
    `select destination_reconcile(${sql(uuid(operation.id))},${sql(uuid(operation.contractor_id))},${sql(operation.package_hash)},${sql(operation.admission_deadline)}::timestamptz);`,
    "practice_destination_reconcile",
  );
}
export async function recordTestResolution(
  db: LocalDatabase,
  operation: PracticeOperation,
  result: Resolution | null,
) {
  return query<PracticeOperation | null>(
    db,
    WORKER,
    `select to_json(practice.resolve_operation(${sql(operation.id)},${sql(operation.contractor_id)},${sql(operation.package_hash)},${sql(result?.status ?? "retry")},${sql(result?.destination_id ?? null)},${sql(operation.lease_token ?? null)}));`,
    "practice_reconcile",
  );
}
export async function reconcileTestOperations(
  source: LocalDatabase,
  destination: LocalDatabase,
  batchSize = 20,
) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 20)
    throw new Error("Recovery batch must contain 1–20 operations.");
  const batch = await query<PracticeOperation[]>(
    source,
    WORKER,
    `select coalesce(jsonb_agg(o),'[]'::jsonb) from practice.reconciliation_batch(${batchSize}) o;`,
    "practice_reconcile",
  );
  const results = [];
  for (const operation of batch) {
    let result: Resolution | null = null;
    try {
      result = await reconcileTestOperation(destination, operation);
    } catch {
      /* Unknown destination outcome: never infer cancellation or recreate work. */
    }
    try {
      const recorded = await recordTestResolution(source, operation, result);
      results.push({
        operation: operation.id,
        status: recorded?.status ?? "metadata_expired",
        attempts: recorded?.attempts ?? operation.attempts,
      });
    } catch {
      // A stale/conflicting/pruned item must not starve unrelated recovery work.
      results.push({
        operation: operation.id,
        status: "recovery_pending",
        attempts: operation.attempts,
      });
    }
  }
  return results;
}
export async function pruneTestReceipts(db: LocalDatabase) {
  return query<number>(
    db,
    WORKER,
    `select to_json(destination_prune(${sql(db.database)}));`,
    "practice_destination_reconcile",
  );
}
export async function commitToTestDestination(
  db: LocalDatabase,
  store: LocalPracticeStore,
  operation: string,
  hash: string,
) {
  // Ordinary requests recheck ownership. The separate worker can recover already-authorized
  // outcomes after revocation, but has no payload or authority to create a new destination.
  const identity = await store.operation(operation);
  if (identity) {
    if (identity.package_hash !== hash)
      throw new Error("Approval does not match this transfer.");
    const result = await reconcileTestOperation(db, identity);
    if (result) {
      await recordTestResolution(store.db, identity, result);
      if (result.status === "complete") return result;
      throw new Error(
        "Transfer was cancelled after its admission deadline. No destination Draft was created.",
      );
    }
    throw new Error(
      "Transfer is pending reconciliation; do not start a new operation.",
    );
  }
  const transfer = await store.transfer(operation);
  if (transfer.package_hash !== hash)
    throw new Error("Approval does not match this transfer.");
  if (transfer.status !== "review")
    throw new Error(
      "Transfer is pending reconciliation; do not start a new operation.",
    );
  const prepared = await store.beginTransfer(operation, hash);
  const receipt = await acceptPreparedTestTransfer(
    db,
    store.contractor,
    prepared,
  );
  await store.finishTransfer(operation, receipt.destination_id);
  return receipt;
}
