import { createHash, randomUUID } from "node:crypto";
import { query, sql, uuid, type LocalDatabase } from "./localDatabase";
import {
  sanitizePracticeDraft,
  sanitizeSnapshot,
  validatePracticePreview,
  type PracticeDraft,
  type PracticeReview,
  type PracticeSnapshot,
  type PracticeWorkspace,
} from "../../src/features/practice/contracts";

function one<T>(rows: T[]) {
  if (rows.length !== 1)
    throw new Error(
      "Record unavailable, expired or changed. Reload before retrying.",
    );
  return rows[0];
}
const rows = (statement: string) =>
  `select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) from (${statement}) r;`;
const returning = (statement: string) =>
  `with changed as (${statement} returning *) ${rows("select * from changed")}`;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const packageHash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");

export class LocalPracticeStore {
  constructor(
    readonly db: LocalDatabase,
    readonly actor: string,
    readonly contractor: string,
  ) {
    uuid(actor);
    uuid(contractor);
  }
  private run<T>(statement: string) {
    return query<T>(this.db, this.actor, statement);
  }
  async start(snapshot: PracticeSnapshot) {
    return one(
      await this.run<PracticeWorkspace[]>(
        returning(
          `insert into practice.workspaces(id,contractor_id,snapshot) values(${sql(randomUUID())},${sql(this.contractor)},${sql(sanitizeSnapshot(snapshot))}::jsonb)`,
        ),
      ),
    );
  }
  async workspaces() {
    // Expired workspace payloads are deliberately excluded even before dry-run cleanup is enabled.
    return this.run<PracticeWorkspace[]>(
      rows(
        `select id,created_at,expires_at,revision,case when expires_at>clock_timestamp() then snapshot else null end as snapshot from practice.workspaces where contractor_id=${sql(this.contractor)} order by created_at desc`,
      ),
    );
  }
  async refresh(id: string, revision: number, snapshot: PracticeSnapshot) {
    return one(
      await this.run<PracticeWorkspace[]>(
        returning(
          `update practice.workspaces set snapshot=${sql(sanitizeSnapshot(snapshot))}::jsonb,revision=revision+1 where id=${sql(uuid(id))} and contractor_id=${sql(this.contractor)} and revision=${sql(revision)}::int`,
        ),
      ),
    );
  }
  async drafts(workspace: string) {
    return this.run<PracticeDraft[]>(
      rows(
        `select d.* from practice.drafts d join practice.workspaces w on w.id=d.workspace_id where w.id=${sql(uuid(workspace))} and w.contractor_id=${sql(this.contractor)} and w.expires_at>clock_timestamp() order by d.id`,
      ),
    );
  }
  async save(workspace: string, id: string, revision: number, input: unknown) {
    const payload = sanitizePracticeDraft(input);
    const statement =
      revision === 0
        ? `insert into practice.drafts(id,workspace_id,payload) select ${sql(uuid(id))},id,${sql(payload)}::jsonb from practice.workspaces where id=${sql(uuid(workspace))} and contractor_id=${sql(this.contractor)} on conflict(id) do nothing`
        : `update practice.drafts set payload=${sql(payload)}::jsonb,revision=revision+1 where id=${sql(uuid(id))} and workspace_id=${sql(uuid(workspace))} and revision=${sql(revision)}::int and exists(select 1 from practice.workspaces where id=workspace_id and contractor_id=${sql(this.contractor)})`;
    const changed = await this.run<PracticeDraft[]>(returning(statement));
    if (!changed.length && revision === 0) {
      const existing = (await this.drafts(workspace)).find((d) => d.id === id);
      if (existing && packageHash(existing.payload) === packageHash(payload))
        return existing;
    }
    return one(changed);
  }
  async file(workspace: string, id: string, pdf: Uint8Array) {
    if (
      pdf.byteLength > 5 * 1024 * 1024 ||
      new TextDecoder().decode(pdf.slice(0, 5)) !== "%PDF-"
    )
      throw new Error("Expected a generated PDF of at most 5 MiB.");
    return one(
      await this.run<Array<{ id: string }>>(
        `with changed as (insert into practice.files(id,workspace_id,bytes,mime_type) select ${sql(uuid(id))},id,decode(${sql(Buffer.from(pdf).toString("hex"))},'hex'),'application/pdf' from practice.workspaces where id=${sql(uuid(workspace))} and contractor_id=${sql(this.contractor)} returning id) ${rows("select * from changed")}`,
      ),
    );
  }
  async review(
    workspace: string,
    draftId: string,
    revision: number,
    operation: string,
  ) {
    const draft = one(
      (await this.drafts(workspace)).filter(
        (d) => d.id === uuid(draftId) && d.revision === revision,
      ),
    );
    const validated = validatePracticePreview(draft.payload);
    // Destination is explicitly unassigned; real customer mapping belongs to the future live gateway.
    const payload = {
      ...validated.draft,
      local_contact_id: "",
      local_home_id: "",
    };
    const hash = packageHash({
      contractor: this.contractor,
      workspace,
      draftId,
      revision,
      payload,
    });
    const result = await this.run<PracticeReview[]>(
      returning(`insert into practice.transfers(id,workspace_id,draft_id,draft_revision,package_hash,payload,total_cents,expires_at)
      select ${sql(uuid(operation))},w.id,d.id,d.revision,${sql(hash)},${sql(payload)}::jsonb,${validated.totalCents},least(w.expires_at,clock_timestamp()+interval '10 minutes')
      from practice.workspaces w join practice.drafts d on d.workspace_id=w.id where w.id=${sql(uuid(workspace))} and w.contractor_id=${sql(this.contractor)} and d.id=${sql(uuid(draftId))} and d.revision=${sql(revision)}::int
      on conflict(id) do nothing`),
    );
    if (result.length) return one(result);
    const existing = one(
      await this.run<PracticeReview[]>(
        rows(
          `select * from practice.transfers where id=${sql(uuid(operation))} and package_hash=${sql(hash)} and status='review' and expires_at>clock_timestamp()`,
        ),
      ),
    );
    return existing;
  }
  async beginTransfer(operation: string, approvedHash: string) {
    // Lock the workspace first, the same order used by cleanup and content writes.
    return one(
      await this.run<
        PracticeReview[]
      >(`select w.id from practice.workspaces w join practice.transfers t on t.workspace_id=w.id where t.id=${sql(uuid(operation))} and w.contractor_id=${sql(this.contractor)} for update of w;
      ${returning(`update practice.transfers t set status='committing' from practice.workspaces w, practice.drafts d where t.id=${sql(operation)} and w.id=t.workspace_id and w.contractor_id=${sql(this.contractor)} and d.id=t.draft_id and d.workspace_id=w.id and d.revision=t.draft_revision and t.status='review' and t.package_hash=${sql(approvedHash)} and t.expires_at>clock_timestamp() and w.expires_at>clock_timestamp()`)}`),
    );
  }
  async transfer(operation: string) {
    return one(
      await this.run<PracticeReview[]>(
        rows(
          `select t.* from practice.transfers t join practice.workspaces w on w.id=t.workspace_id where t.id=${sql(uuid(operation))} and w.contractor_id=${sql(this.contractor)}`,
        ),
      ),
    );
  }
  async finishTransfer(operation: string, destination: string) {
    return one(
      await this.run<PracticeReview[]>(
        returning(
          `update practice.transfers set status='complete',payload=null,destination_id=${sql(uuid(destination))} where id=${sql(uuid(operation))} and status='committing' and exists(select 1 from practice.workspaces w where w.id=workspace_id and w.contractor_id=${sql(this.contractor)})`,
        ),
      ),
    );
  }
  async cancelReview(operation: string) {
    return this.run<PracticeReview[]>(
      returning(
        `update practice.transfers set status='cancelled',payload=null where id=${sql(uuid(operation))} and status='review' and exists(select 1 from practice.workspaces w where w.id=workspace_id and w.contractor_id=${sql(this.contractor)})`,
      ),
    );
  }
}
