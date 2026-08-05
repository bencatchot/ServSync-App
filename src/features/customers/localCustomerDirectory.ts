import type { ContractorLocalContact, ContractorLocalHome } from '../../types';

export type LocalCustomerDirectoryLoadState = 'idle' | 'loading' | 'ready' | 'unauthorized' | 'error';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value ? value : null;
}

function summaryHome(value: unknown, contractorId: string, contactId: string): ContractorLocalHome | null {
  const row = asObject(value);
  if (!row || !text(row.id)) return null;
  return {
    id: text(row.id),
    contractor_id: contractorId,
    local_contact_id: contactId,
    home_id: null,
    claimed_at: null,
    nickname: text(row.nickname),
    address_line1: text(row.address_line1),
    address_line2: text(row.address_line2),
    city: text(row.city),
    state: text(row.state),
    zip_code: text(row.zip_code),
    home_type: '',
    year_built: '',
    square_feet: '',
    notes: '',
    created_at: '',
    updated_at: '',
  };
}

function detailHome(value: unknown, contractorId: string, contactId: string): ContractorLocalHome | null {
  const row = asObject(value);
  if (!row || text(row.contractor_id) !== contractorId || text(row.local_contact_id) !== contactId || !text(row.id)) {
    return null;
  }
  return {
    id: text(row.id),
    contractor_id: contractorId,
    local_contact_id: contactId,
    home_id: optionalText(row.home_id),
    claimed_at: optionalText(row.claimed_at),
    nickname: text(row.nickname),
    address_line1: text(row.address_line1),
    address_line2: text(row.address_line2),
    city: text(row.city),
    state: text(row.state),
    zip_code: text(row.zip_code),
    home_type: text(row.home_type),
    year_built: text(row.year_built),
    square_feet: text(row.square_feet),
    notes: text(row.notes),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

export function normalizeLocalCustomerSummaries(payload: unknown, contractorId: string): ContractorLocalContact[] {
  if (!Array.isArray(payload) || !contractorId) throw new Error('Local customer summary response was invalid.');
  const seen = new Set<string>();
  return payload.map(value => {
    const row = asObject(value);
    const id = text(row?.id);
    if (!row || !id || seen.has(id)) throw new Error('Local customer summary response was invalid.');
    seen.add(id);
    const homes = Array.isArray(row.homes)
      ? row.homes.map(home => summaryHome(home, contractorId, id)).filter((home): home is ContractorLocalHome => Boolean(home))
      : [];
    return {
      id,
      contractor_id: contractorId,
      homeowner_user_id: null,
      display_name: text(row.display_name) || 'Customer',
      phone: '',
      email: '',
      notes: '',
      claimed_at: null,
      created_at: '',
      updated_at: '',
      homes,
    };
  });
}

export function normalizeLocalCustomerManagementDetail(payload: unknown, contractorId: string): ContractorLocalContact {
  const row = asObject(payload);
  const id = text(row?.id);
  if (!row || !id || text(row.contractor_id) !== contractorId) {
    throw new Error('Local customer detail response was invalid.');
  }
  if (!Array.isArray(row.homes)) throw new Error('Local customer detail response was invalid.');
  const normalizedHomes = row.homes.map(home => detailHome(home, contractorId, id));
  if (normalizedHomes.some(home => !home)) throw new Error('Local customer detail response was invalid.');
  const homes = normalizedHomes as ContractorLocalHome[];
  return {
    id,
    contractor_id: contractorId,
    homeowner_user_id: optionalText(row.homeowner_user_id),
    display_name: text(row.display_name) || 'Customer',
    phone: text(row.phone),
    email: text(row.email),
    notes: text(row.notes),
    claimed_at: optionalText(row.claimed_at),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
    homes,
  };
}

export function localCustomerSummaryFromFullContact(contact: ContractorLocalContact): ContractorLocalContact {
  return normalizeLocalCustomerSummaries([{
    id: contact.id,
    display_name: contact.display_name,
    homes: contact.homes ?? [],
  }], contact.contractor_id)[0];
}

export function localCustomerDirectoryFailureState(error: unknown): Exclude<LocalCustomerDirectoryLoadState, 'idle' | 'loading' | 'ready'> {
  const row = asObject(error);
  const code = text(row?.code);
  const status = typeof row?.status === 'number' ? row.status : null;
  return code === '42501' || status === 401 || status === 403 ? 'unauthorized' : 'error';
}
