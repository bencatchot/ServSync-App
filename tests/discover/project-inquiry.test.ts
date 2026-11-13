import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { appendPublicProject, loadPublicProject, projectReferenceText } from '../../src/features/discover/projectInquiry';
const contractorId = '10000000-0000-4000-8000-000000000001';
const postId = '40000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const post = { contractor_id: contractorId, post_id: postId, title: 'Public faucet update', created_at: '2026-01-01T00:00:00Z', photos: ['private-must-never-be-copied'], description: 'not included' };
function fixture(options: { post?: unknown; profile?: unknown; error?: boolean } = {}) {
  const calls: { name: string; args?: unknown }[] = [];
  const filters: unknown[][] = [];
  const client = { rpc(name: string, args: unknown) {
    calls.push({ name, args });
    if (name === 'servsync_get_public_contractor_profile') return Promise.resolve({ data: 'profile' in options ? options.profile : { contractor_id: contractorId }, error: null });
    const query = {
      eq(...args: unknown[]) { filters.push(args); return query; },
      limit(value: number) { filters.push(['limit', value]); return Promise.resolve({ data: 'post' in options ? options.post : [post], error: options.error ? { message: 'offline' } : null }); },
    };
    return query;
  } } as unknown as SupabaseClient;
  return { client, calls, filters };
}
test('resolves exact public post using both identifiers and excludes media/private details', async () => {
  const { client, calls, filters } = fixture();
  const result = await loadPublicProject(client, contractorId, 'bay-plumbing', postId);
  assert.deepEqual(filters, [['contractor_id', contractorId], ['post_id', postId], ['limit', 1]]);
  assert.deepEqual(calls.map(call => call.name), ['servsync_get_public_contractor_profile', 'servsync_discover_feed']);
  assert.equal(Object.keys(result).length, 5);
  assert.doesNotMatch(projectReferenceText(result), /private-must|not included|verified/);
});
for (const [name, options] of Object.entries({
  hidden: { profile: null },
  'wrong profile owner': { profile: { contractor_id: otherId } },
  deleted: { post: [] },
  'wrong post owner': { post: [{ ...post, contractor_id: otherId }] },
  'wrong post id': { post: [{ ...post, post_id: otherId }] },
  'lookup failure': { error: true },
})) test(`${name} rejects reference`, async () => {
  await assert.rejects(loadPublicProject(fixture(options).client, contractorId, 'bay-plumbing', postId));
});
test('malformed route identifier never queries backend', async () => {
  const f = fixture();
  await assert.rejects(loadPublicProject(f.client, contractorId, 'bay-plumbing', 'spoof&anything'));
  assert.equal(f.calls.length, 0);
});
test('send revalidates, preserves full original text, and appends once without mutating draft', async () => {
  const f = fixture();
  const reference = await loadPublicProject(f.client, contractorId, 'bay-plumbing', postId);
  const text = 'A'.repeat(500);
  const result = await appendPublicProject(f.client, text, reference, contractorId);
  assert.equal(result, `${text}\n\n${projectReferenceText(reference)}`);
  assert.equal(await appendPublicProject(f.client, text, reference, contractorId), result);
  assert.equal(await appendPublicProject(f.client, text, undefined, contractorId), text);
});
test('contractor switch cannot misattribute reference; edits after selection require renewed review', async () => {
  const reference = await loadPublicProject(fixture().client, contractorId, 'bay-plumbing', postId);
  const f = fixture();
  await assert.rejects(appendPublicProject(f.client, 'Original', reference, otherId), /different contractor/);
  assert.equal(f.calls.length, 0);
  await assert.rejects(appendPublicProject(fixture({ post: [{ ...post, title: 'Changed' }] }).client, 'Original', reference, contractorId), /post changed/);
});
