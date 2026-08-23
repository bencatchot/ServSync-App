import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectionRequestContextPresentation, normalizeConnectionRequestContext } from '../../src/features/customers/connectionRequestContext';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(haystack: string, start: string, end: string) {
  const startIndex = haystack.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = haystack.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return haystack.slice(startIndex, endIndex);
}

test.describe('accepted connection-request context continuity', () => {
  test('active reader returns context only through the established contractor-scoped contract', () => {
    const sql = source('servsync-accepted-connection-request-context-visibility.sql');
    const reader = sourceBetween(
      sql,
      'create function public.servsync_contractor_connected_homeowners()',
      'comment on function public.servsync_contractor_connected_homeowners()',
    );

    expect(reader).toContain('security definer');
    expect(reader).toContain('set search_path = public');
    expect(reader).toContain('left join public.connection_request_contexts ctx on ctx.connection_id = c.id');
    expect(reader).toContain("'message', ctx.message");
    expect(reader).toContain("'created_at', ctx.created_at");
    expect(reader).toContain('public.current_user_can_access_contractor(cp.id)');
    expect(reader).toContain("c.status = 'active'");
    expect(sql).toContain('revoke all on function public.servsync_contractor_connected_homeowners() from anon;');
    expect(sql).toContain('grant execute on function public.servsync_contractor_connected_homeowners() to authenticated;');
    expect(sql).not.toMatch(/create\s+policy|alter\s+table|grant\s+select\s+on\s+table/i);
  });

  test('acceptance changes lifecycle status without touching stored request context', () => {
    const sql = source('servsync-connection-shared-properties.sql');
    const responder = sourceBetween(
      sql,
      'create function public.servsync_respond_to_connection_request(',
      'revoke execute on function public.servsync_respond_to_connection_request(uuid, text)',
    );

    expect(responder).toContain('update public.homeowner_contractor_connections');
    expect(responder).toContain('set status = v_next_status');
    expect(responder).not.toMatch(/(?:update|delete\s+from)\s+public\.connection_request_contexts/i);
  });

  test('blank-schema application order installs the active reader after pending context support', () => {
    for (const path of ['scripts/apply-blank-supabase-schema.sh', 'scripts/apply-sql-dry-run.sh']) {
      const script = source(path);
      const pendingIndex = script.indexOf('servsync-contextual-connection-pending-review-rpc.sql');
      const activeIndex = script.indexOf('servsync-accepted-connection-request-context-visibility.sql');
      const laterOverride = script.indexOf('servsync_contractor_connected_homeowners', activeIndex + 1);
      expect(pendingIndex).toBeGreaterThanOrEqual(0);
      expect(activeIndex).toBeGreaterThan(pendingIndex);
      expect(laterOverride).toBe(-1);
    }
  });

  test('normalization preserves the homeowner message exactly and rejects malformed legacy payloads', () => {
    const message = '  Replace valve\nPlease estimate unchanged.  ';
    expect(normalizeConnectionRequestContext({
      message,
      created_at: '2026-08-22T14:30:00Z',
      updated_at: '2026-08-22T14:30:00Z',
    })).toEqual({
      message,
      created_at: '2026-08-22T14:30:00Z',
      updated_at: '2026-08-22T14:30:00Z',
    });
    expect(normalizeConnectionRequestContext(null)).toBeNull();
    expect(normalizeConnectionRequestContext([])).toBeNull();
  });

  test('pending and connected customer UI use the shared context section with timestamp and graceful empty states', () => {
    const app = source('src/App.tsx');
    const section = source('src/features/customers/ConnectionRequestContextSection.tsx');

    expect(app).toContain('context={reqSubject.request_context} title="Customer message"');
    expect(app).toContain('context={conn.request_context} title="Original connection request"');
    expect(app).toContain("formatTimestamp={formatDateTime}");
    expect(app).toContain("conn.request_context ? 'No message included.' : 'No original connection request is available for this connection.'");
    expect(section).toContain('{presentation.submittedLabel}');
    expect(section).toContain('whitespace-pre-wrap');
    expect(section).toContain('{presentation.message}');
    expect(section).not.toMatch(/\.trim\(\)/);
  });

  test('connected customer presentation preserves the exact message, timestamp, and both empty states', () => {
    const message = '  Replace valve\nPlease estimate unchanged.  ';
    expect(connectionRequestContextPresentation(
      { message, created_at: '2026-08-22T14:30:00Z', updated_at: '2026-08-22T14:30:00Z' },
      'No message included.',
      value => `formatted:${value}`,
    )).toEqual({ message, submittedLabel: 'Submitted formatted:2026-08-22T14:30:00Z' });
    expect(connectionRequestContextPresentation(
      { message: '', created_at: '2026-08-22T14:30:00Z', updated_at: '2026-08-22T14:30:00Z' },
      'No message included.',
    ).message).toBe('No message included.');
    expect(connectionRequestContextPresentation(
      null,
      'No original connection request is available for this connection.',
    ).message).toBe('No original connection request is available for this connection.');
  });

  test('repair does not create downstream work records or label current property sharing as original', () => {
    const changedSources = [
      source('servsync-accepted-connection-request-context-visibility.sql'),
      source('src/features/customers/ConnectionRequestContextSection.tsx'),
    ].join('\n');

    expect(changedSources).not.toMatch(/insert\s+into\s+public\.(service_requests|estimates|inspections|jobs|invoices)/i);
    expect(changedSources).not.toMatch(/original (?:property|sharing|permission) (?:snapshot|state)/i);
  });
});
