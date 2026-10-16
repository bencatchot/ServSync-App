import { query, sql, uuid, type LocalDatabase } from "./localDatabase";
export type CleanupCandidate = {
  workspace_id: string;
  expires_at: string;
  draft_count: number;
  file_count: number;
  file_bytes: number;
  blocked: boolean;
};
export async function practiceCleanupDryRun(db: LocalDatabase) {
  return query<CleanupCandidate[]>(
    db,
    "00000000-0000-4000-8000-000000000000",
    "select coalesce(jsonb_agg(p), '[]'::jsonb) from practice.cleanup_plan() p;",
    "practice_cleanup",
  );
}
// No HTTP route, cron job, environment switch or Production implementation calls this.
// The SQL function rechecks the exact disposable database, workspace, expiry and transfer lock.
export async function applyDisposableCleanup(
  db: LocalDatabase,
  candidate: CleanupCandidate,
  expectedDatabase: string,
) {
  return query<boolean>(
    db,
    "00000000-0000-4000-8000-000000000000",
    `select to_json(practice.cleanup_disposable(${sql(expectedDatabase)},${sql(uuid(candidate.workspace_id))},${sql(candidate.expires_at)}::timestamptz));`,
    "practice_cleanup",
  );
}
