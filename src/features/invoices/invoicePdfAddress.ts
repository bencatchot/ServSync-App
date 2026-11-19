import type { ContractorConnectedHomeowner, ContractorConnectedHomeownerHome, ContractorLocalContact, HomeProfile, Invoice } from '../../types';

type Address = Pick<HomeProfile, 'nickname' | 'address_line1' | 'address_line2' | 'city' | 'state' | 'zip_code'>;
export type InvoiceServiceAddress = { serviceLabel: string; serviceAddress: string };
const empty = (): InvoiceServiceAddress => ({ serviceLabel: '', serviceAddress: '' });

function format(home: Address, addressAllowed = true, labelAllowed = true): InvoiceServiceAddress {
  const locality = [home.city?.trim(), [home.state?.trim(), home.zip_code?.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return {
    serviceLabel: labelAllowed ? home.nickname?.trim() || '' : '',
    serviceAddress: addressAllowed ? [home.address_line1?.trim(), home.address_line2?.trim(), locality].filter(Boolean).join('\n') : '',
  };
}

// Shared by PDF output and the editor: never reveal stale fields when sharing is off.
export function connectedInvoiceHomeDisplay(home: ContractorConnectedHomeownerHome, connection: ContractorConnectedHomeowner): InvoiceServiceAddress {
  if (connection.status !== 'active') return empty();
  return format(home,
    (home.share_address ?? connection.permissions.share_address) === true,
    (home.share_home_overview ?? connection.permissions.share_home_overview) === true);
}

// Only exact IDs in this customer's already-authorized context. Never fall back
// to invoice snapshot text, a default property, or another customer's home.
export function contractorInvoiceServiceAddress(invoice: Pick<Invoice, 'contractor_id' | 'homeowner_user_id' | 'local_contact_id' | 'home_id' | 'local_home_id'>, connection?: ContractorConnectedHomeowner | null, local?: ContractorLocalContact | null): InvoiceServiceAddress {
  if (invoice.homeowner_user_id) {
    if (!invoice.home_id || connection?.homeowner_user_id !== invoice.homeowner_user_id || connection.status !== 'active') return empty();
    const homes = connection.homes?.length ? connection.homes : connection.home ? [connection.home] : [];
    const home = homes.find(item => item.id === invoice.home_id);
    if (!home) return empty();
    // Legacy responses omit per-home flags but are already server-redacted.
    // An explicit per-home false always wins over the aggregate connection flag.
    return connectedInvoiceHomeDisplay(home, connection);
  }
  if (!invoice.local_home_id || !invoice.local_contact_id || local?.id !== invoice.local_contact_id || local.contractor_id !== invoice.contractor_id) return empty();
  const home = local.homes?.find(item => item.id === invoice.local_home_id && item.local_contact_id === local.id && item.contractor_id === invoice.contractor_id);
  return home ? format(home) : empty();
}

export function homeownerInvoiceServiceAddress(invoice: Pick<Invoice, 'home_id' | 'homeowner_user_id'>, homes: HomeProfile[], viewerId: string): InvoiceServiceAddress {
  if (!invoice.home_id || invoice.homeowner_user_id !== viewerId) return empty();
  const home = homes.find(item => item.id === invoice.home_id && item.homeowner_user_id === viewerId);
  return home ? format(home) : empty();
}
