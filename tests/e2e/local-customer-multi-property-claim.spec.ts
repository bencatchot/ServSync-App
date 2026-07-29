import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function sourceBetween(haystack: string, start: string, end: string) {
  const startIndex = haystack.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = haystack.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return haystack.slice(startIndex, endIndex);
}

function expectInOrder(haystack: string, markers: string[]) {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = haystack.indexOf(marker, previousIndex + 1);
    expect(index, `Expected source marker: ${marker}`).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}

test.describe('local customer multi-property claim source checks', () => {
  test('SQL adds private invite-property membership with stable selected set and RLS', () => {
    const sql = source('servsync-local-customer-multi-property-claim.sql');

    expect(sql).toContain('create table if not exists public.contractor_local_customer_claim_invite_homes');
    expect(sql).toContain('claim_invite_id uuid not null references public.contractor_local_customer_claim_invites(id) on delete cascade');
    expect(sql).toContain('unique (claim_invite_id, local_home_id)');
    expect(sql).toContain('alter table public.contractor_local_customer_claim_invite_homes enable row level security');
    expect(sql).toContain('Local claim invite homes: contractor reads own');
    expect(sql).toContain('public.current_user_can_manage_contractor_team(contractor_id)');
    expect(sql).toContain("tm.role = 'office'");
    expect(sql).toContain('revoke all on public.contractor_local_customer_claim_invite_homes from authenticated;');
    expect(sql).toContain('insert into public.contractor_local_customer_claim_invite_homes');
  });

  test('create v2 requires explicit selected properties and does not return raw tokens', () => {
    const sql = source('servsync-local-customer-multi-property-claim.sql');
    const createRpc = sourceBetween(
      sql,
      'create or replace function public.servsync_create_local_customer_claim_invite_v2',
      'grant execute on function public.servsync_create_local_customer_claim_invite_v2',
    );

    expect(createRpc).toContain('p_local_home_ids uuid[]');
    expect(createRpc).toContain('Choose at least one property for this claim invite.');
    expect(createRpc).toContain('A property can only be included once in a claim invite.');
    expect(createRpc).toContain('Every selected property must belong to this unclaimed local customer.');
    expect(createRpc).toContain('v_existing_home_ids = v_home_ids');
    expect(createRpc).toContain('reused_existing');
    expect(createRpc).toContain('One of these properties already has a pending claim invite.');
    expect(createRpc).toContain('local_home_ids');
    expect(createRpc).toContain('property_count');
    expect(createRpc).not.toContain("'invite_token', v_invite.invite_token");
  });

  test('legacy create delegates to v2 so older clients cannot overlap multi-property pending invites', () => {
    const sql = source('servsync-local-customer-multi-property-claim.sql');
    const legacyCreate = sourceBetween(
      sql,
      'create or replace function public.servsync_create_local_customer_claim_invite(',
      'grant execute on function public.servsync_create_local_customer_claim_invite(uuid, uuid, int) to authenticated;',
    );

    expect(legacyCreate).toContain('if p_local_home_id is null then');
    expect(legacyCreate).toContain('Choose at least one property for this claim invite.');
    expect(legacyCreate).toContain('return public.servsync_create_local_customer_claim_invite_v2(');
    expect(legacyCreate).toContain('array[p_local_home_id]');
    expect(legacyCreate).not.toContain("'invite_token'");
  });

  test('lookup preview returns all invited properties without exposing a token', () => {
    const sql = source('servsync-local-customer-multi-property-claim.sql');
    const lookupRpc = sourceBetween(
      sql,
      'create or replace function public.servsync_lookup_local_customer_claim',
      'grant execute on function public.servsync_lookup_local_customer_claim',
    );

    expect(lookupRpc).toContain("'homes', v_homes");
    expect(lookupRpc).toContain("'property_count', v_home_count");
    expect(lookupRpc).toContain('member.claim_invite_id = v_invite.id');
    expect(lookupRpc).toContain('home.home_id is not null');
    expect(lookupRpc).toContain('home.claimed_at is not null');
    expect(lookupRpc).not.toContain("'invite_token'");
  });

  test('prepare delivery validates the membership set after contact and home locks', () => {
    const sql = source('servsync-local-customer-multi-property-claim.sql');
    const prepareRpc = sourceBetween(
      sql,
      'create or replace function public.servsync_prepare_local_customer_claim_invite_delivery',
      'grant execute on function public.servsync_prepare_local_customer_claim_invite_delivery',
    );

    expectInOrder(prepareRpc, [
      'from public.contractor_local_contacts',
      'for update',
      'from public.contractor_local_customer_claim_invite_homes member',
      'for update of member, home',
      'from public.contractor_local_customer_claim_invites',
      'where id = p_invite_id',
      'for update',
      "v_invite.status <> 'pending'",
      "'invite_token', v_invite.invite_token",
    ]);
    expect(prepareRpc).toContain('property_count');
    expect(prepareRpc).toContain('home.id is null or home.home_id is not null or home.claimed_at is not null');
    expect(prepareRpc).toContain('Claim invite not found or no longer available.');
  });

  test('accept v2 requires complete distinct mappings and claims atomically', () => {
    const sql = source('servsync-local-customer-multi-property-claim.sql');
    const acceptRpc = sourceBetween(
      sql,
      'create or replace function public.servsync_accept_local_customer_claim_v2',
      'grant execute on function public.servsync_accept_local_customer_claim_v2',
    );

    expect(acceptRpc).toContain('p_home_mappings jsonb');
    expect(acceptRpc).toContain('Only homeowner accounts can claim a local customer profile.');
    expect(acceptRpc).toContain('Choose exactly one destination for every invited property.');
    expect(acceptRpc).toContain('Each invited property must map to a different homeowner property.');
    expect(acceptRpc).toContain('homeowner_user_id = auth.uid()');
    expect(acceptRpc).toContain('jsonb_array_elements(v_home_mappings) as mapping(value)');
    expect(acceptRpc).toContain('update public.contractor_local_contacts');
    expect(acceptRpc).toContain('update public.contractor_local_homes');
    expect(acceptRpc).toContain('update public.contractor_local_customer_claim_invite_homes');
    expect(acceptRpc).toContain("status = 'claimed'");
    expect(acceptRpc).toContain('claimed_home_ids');
    expect(acceptRpc).not.toContain("'invite_token'");
  });

  test('legacy accept rejects multi-property invitations before mutation', () => {
    const sql = source('servsync-local-customer-multi-property-claim.sql');
    const legacyAccept = sourceBetween(
      sql,
      'create or replace function public.servsync_accept_local_customer_claim(',
      'grant execute on function public.servsync_accept_local_customer_claim(text, uuid, jsonb, jsonb) to authenticated;',
    );

    expect(legacyAccept).toContain('if v_property_count > 1 then');
    expect(legacyAccept).toContain('This invitation includes multiple properties. Refresh ServSync before accepting it.');
    expect(legacyAccept).toContain('public.servsync_accept_local_customer_claim_v2');
  });

  test('app uses v2 list, create, and accept paths with token-free ordinary state', () => {
    const app = source('src/App.tsx');
    const loadSection = sourceBetween(app, 'const [tplRes, inspRes, jobWorkItemsRes', 'if (!tplRes.error) setInspectionTemplates');
    const createSection = sourceBetween(app, 'const createLocalCustomerClaimInvite = async', 'const prepareLocalCustomerClaimInviteDelivery = async');
    const claimPage = sourceBetween(app, 'function LocalCustomerClaimPage', 'function MissingProfile');

    expect(loadSection).toContain("supabase.rpc('servsync_list_local_customer_claim_invites_v2'");
    expect(createSection).toContain("supabase.rpc('servsync_create_local_customer_claim_invite_v2'");
    expect(createSection).toContain('p_local_home_ids: selectedHomeIds');
    expect(createSection).not.toContain('invite_token');
    expect(claimPage).toContain("supabase.rpc('servsync_accept_local_customer_claim_v2'");
    expect(claimPage).toContain('p_home_mappings: mappings');
    expect(claimPage).toContain('Choose a different existing home for each invited property.');
    expect(claimPage).toContain('localCustomerClaimPreviewHomes(preview)');
  });

  test('contractor and homeowner UI document selected-set behavior without provider delivery', () => {
    const app = source('src/App.tsx');
    const contractorInviteUi = sourceBetween(
      app,
      '<p className="text-sm font-bold text-slate-950">Homeowner claim invite</p>',
      '{localCustomer.notes && (',
    );
    const claimPage = sourceBetween(app, 'function LocalCustomerClaimPage', 'function MissingProfile');

    expect(contractorInviteUi).toContain('The invite will claim only the checked properties.');
    expect(contractorInviteUi).toContain('Later property changes are not automatically included.');
    expect(contractorInviteUi).toContain('ServSync does not email or text this invite');
    expect(claimPage).toContain('Choose one destination for each invited property.');
    expect(claimPage).toContain('ServSync will claim the complete selected set together.');
    expect(contractorInviteUi).not.toMatch(/send.*(email|sms)|edge function/i);
    expect(claimPage).not.toMatch(/send.*(email|sms)|edge function/i);
  });

  test('connected-homeowner detail rendering does not execute local-claim selection logic', () => {
    const app = source('src/App.tsx');
    const homeownerWorkspace = sourceBetween(
      app,
      "const isConn = selectedSubject.kind === 'connection';",
      'const rawFieldWork = conn ? fieldWorkForHomeowner(conn.homeowner_user_id)',
    );

    expect(homeownerWorkspace).toContain('const localClaimWorkspace = localCustomer');
    expect(homeownerWorkspace).toContain('? {');
    expect(homeownerWorkspace).toContain('selectedHomeIds: selectedClaimInviteHomeIdsForContact(localCustomer)');
    expect(homeownerWorkspace).toContain('selectedHomeIds: [] as string[]');
    expect(homeownerWorkspace).toContain('preparedLocalClaimInviteQr && latestLocalClaimInvite');
    expect(homeownerWorkspace).toContain('preparedLocalClaimInviteQr.inviteId === latestLocalClaimInvite.id');
    expect(homeownerWorkspace).not.toContain('preparedLocalClaimInviteQr?.inviteId === latestLocalClaimInvite?.id');
    expect(homeownerWorkspace).toContain('perm?.share_contact');
    expect(homeownerWorkspace).toContain('perm?.share_address');
    expect(homeownerWorkspace).not.toContain('perm!.');
    expect(homeownerWorkspace).not.toContain('localCustomer!.display_name');
  });

  test('connected-homeowner shared fields normalize RPC home data before rendering', () => {
    const app = source('src/App.tsx');
    const displayFormatter = sourceBetween(
      app,
      'function sharedFieldDisplayValue',
      'function normalizeConnectedHomeRecord',
    );
    const homeNormalizer = sourceBetween(
      app,
      'function normalizeConnectedHomeRecord',
      'function normalizeContractorConnectedHomeowner',
    );
    const connectionNormalizer = sourceBetween(
      app,
      'function normalizeContractorConnectedHomeowner',
      'function connectionSourceLabel',
    );
    const loadSection = sourceBetween(
      app,
      'const loadedConnections = ((connectionsRes.data || []) as ContractorConnectedHomeowner[])',
      'const connectionIds = [',
    );
    const sharedField = sourceBetween(
      app,
      'function SharedField',
      'function pendingSharedPropertyAddress',
    );
    const connectedHomeList = sourceBetween(
      app,
      'function connectedHomeList',
      'function ConnectedHomeProperties',
    );

    expect(displayFormatter).toContain("typeof value === 'string'");
    expect(displayFormatter).toContain("typeof value === 'number'");
    expect(displayFormatter).toContain("typeof value === 'boolean'");
    expect(displayFormatter).toContain("return ''");
    expect(homeNormalizer).toContain("if (!home || typeof home !== 'object' || Array.isArray(home)) return null");
    expect(homeNormalizer).toContain('nickname: sharedFieldDisplayValue(row.nickname)');
    expect(homeNormalizer).toContain('year_built: sharedFieldDisplayValue(row.year_built)');
    expect(homeNormalizer).toContain('square_feet: sharedFieldDisplayValue(row.square_feet)');
    expect(connectionNormalizer).toContain("const row = connection as unknown as Record<string, unknown>");
    expect(connectionNormalizer).toContain('connection_id: sharedFieldDisplayValue(row.connection_id)');
    expect(connectionNormalizer).toContain('display_name: sharedFieldDisplayValue(row.display_name)');
    expect(connectionNormalizer).toContain('permissions: normalizeSharingPermissions(row.permissions');
    expect(connectionNormalizer).not.toContain('...connection');
    expect(loadSection).toContain('.map(normalizeContractorConnectedHomeowner)');
    expect(sharedField).toContain('value?: unknown');
    expect(sharedField).toContain('const displayValue = sharedFieldDisplayValue(value)');
    expect(sharedField).not.toContain('{allowed ? value ||');
    expect(connectedHomeList).toContain('.map(home => normalizeConnectedHomeRecord(home))');
    expect(connectedHomeList).not.toContain('return connection.home ? [connection.home] : []');
  });
});
