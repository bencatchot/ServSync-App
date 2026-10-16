// Synthetic destination ONLY. This is NOT the real ServSync Draft import API.
import { randomUUID } from "node:crypto";
import {
  query,
  sql,
  uuid,
  type LocalDatabase,
} from "../../server/practice/localDatabase";
import { LocalPracticeStore } from "../../server/practice/store";
import type { PracticeReceipt } from "../../src/features/practice/contracts";

export async function testReceipt(
  db: LocalDatabase,
  store: LocalPracticeStore,
  operation: string,
) {
  return query<PracticeReceipt | null>(
    db,
    store.actor,
    `select (select row_to_json(r) from transfer_receipts r where operation_id=${sql(uuid(operation))} and contractor_id=${sql(store.contractor)});`,
    "postgres",
  );
}
export async function commitToTestDestination(
  db: LocalDatabase,
  store: LocalPracticeStore,
  operation: string,
  hash: string,
) {
  // Always re-authorize the source binding before receipt recovery too.
  let transfer = await store.transfer(operation);
  if (transfer.package_hash !== hash)
    throw new Error("Approval does not match this transfer.");
  const recover = async () => {
    const receipt = await testReceipt(db, store, operation);
    if (receipt && receipt.package_hash !== hash)
      throw new Error("Operation ID is already bound to another package.");
    if (receipt && transfer.status === "committing")
      await store
        .finishTransfer(operation, receipt.destination_id)
        .catch(async () => {
          if ((await store.transfer(operation)).status !== "complete")
            throw new Error(
              "Receipt exists; Practice reconciliation still pending.",
            );
        });
    return receipt;
  };
  const previous = await recover();
  if (previous) return previous;
  if (transfer.status !== "review")
    throw new Error(
      "Transfer is pending reconciliation; do not start a new operation.",
    );
  transfer = await store.beginTransfer(operation, hash);
  const destinationId = randomUUID();
  // Both insertions commit together in a separate database. No provider/lifecycle calls exist here.
  const receipt = await query<PracticeReceipt>(
    db,
    store.actor,
    `
    select pg_advisory_xact_lock(hashtextextended(${sql(operation)},0));
    do $$ begin if exists(select 1 from transfer_receipts where operation_id=${sql(operation)} and (package_hash<>${sql(hash)} or contractor_id<>${sql(store.contractor)}::uuid)) then raise exception 'Transfer identity conflict'; end if; end $$;
    insert into destination_drafts(id,contractor_id,status,payload) select ${sql(destinationId)},${sql(store.contractor)},'draft',${sql(transfer.payload)}::jsonb where not exists(select 1 from transfer_receipts where operation_id=${sql(operation)});
    insert into transfer_receipts(operation_id,contractor_id,package_hash,destination_id) values(${sql(operation)},${sql(store.contractor)},${sql(hash)},${sql(destinationId)}) on conflict(operation_id) do nothing;
    select row_to_json(r) from transfer_receipts r where operation_id=${sql(operation)};`,
    "postgres",
  );
  await store.finishTransfer(operation, receipt.destination_id);
  return receipt;
}
