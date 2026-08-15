import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test.describe('finalized report Home History lineage', () => {
  test('migration changes only the current finalizer contract and performs no historical backfill', () => {
    const sql = source('servsync-finalized-report-home-lineage.sql');

    expect(sql).toMatch(/^--[\s\S]*\nbegin;/);
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain('create or replace function public.servsync_finalize_field_work(');
    expect(sql).toContain('public.current_user_can_write_contractor_jobs(i.contractor_id)');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = public');
    expect(sql).toContain('homeowner_user_id,\n      home_id,\n      storage_path');
    expect(sql).toContain('v_insp.homeowner_user_id,\n      v_insp.home_id,\n      p_storage_path');
    expect(sql).toContain('report_document_id,\n      home_id,\n      category');
    expect(sql).toContain('v_report_document_id,\n      v_insp.home_id,');
    expect(sql).toContain('home_id = coalesce(excluded.home_id, public.home_maintenance_log.home_id)');
    expect(sql).toContain("'inspection_report_filed'");
    expect(sql).toContain("job_status = case when job_status = 'closed' then 'closed' else 'completed' end");
    expect(sql).not.toMatch(/\bupdate\s+public\.home_documents\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.home_maintenance_log\s+\w+\s+set\b/i);
    expect(sql).not.toMatch(/\bcreate\s+policy\b|\balter\s+table\b/i);
  });

  test('authorization and operational validation remain explicit', () => {
    const sql = source('servsync-finalized-report-home-lineage.sql');
    const validation = source('tests/sql/finalized-report-home-lineage-validation.sql');
    const runner = source('scripts/validation/validate-finalized-report-home-lineage.sh');

    expect(sql).toContain('revoke all on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, integer) from public;');
    expect(sql).toContain('revoke all on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, integer) from anon;');
    expect(sql).toContain('grant execute on function public.servsync_finalize_field_work(uuid, jsonb, text, text, text, integer) to authenticated;');
    expect(validation).toContain('Cross-tenant finalization unexpectedly succeeded.');
    expect(validation).toContain('Read-only member finalization unexpectedly succeeded.');
    expect(validation).toContain('Null-home finalization invented property lineage.');
    expect(validation).toContain('Report leaked into another home scope.');
    expect(validation).toContain('Expected notification behavior changed.');
    expect(runner).toContain('servsync-finalized-report-home-lineage.sql');
    expect(runner.match(/servsync-finalized-report-home-lineage\.sql/g)).toHaveLength(2);
  });
});
