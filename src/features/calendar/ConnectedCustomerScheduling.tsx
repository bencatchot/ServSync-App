import { useState } from 'react';

type Customer = { connection_id: string; display_name?: string | null };
type Request = { id: string; connection_id?: string | null; title: string; status: string };

export function ConnectedCustomerScheduling({ customers, requests, onOpenRequest, onOpenCustomer }: {
  customers: Customer[];
  requests: Request[];
  onOpenRequest: (id: string) => void;
  onOpenCustomer: (id: string) => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const customer = customers.find(item => item.connection_id === customerId);
  const openRequests = customer ? requests.filter(item => item.connection_id === customer.connection_id && !['closed', 'declined'].includes(item.status)) : [];
  if (!customers.length) return null;
  return (
    <section className="mb-4 space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-3" aria-label="Schedule with a connected customer">
      <p className="text-sm font-bold text-blue-950">Schedule with a connected customer</p>
      <p className="text-xs leading-5 text-blue-900">Open a service request to review the work and propose an appointment. Shared appointments stay tied to that request.</p>
      <label className="block text-sm font-semibold text-slate-800">Connected customer
        <select value={customer?.connection_id ?? ''} onChange={event => setCustomerId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
          <option value="">Choose customer…</option>
          {customers.map(item => <option key={item.connection_id} value={item.connection_id}>{item.display_name || 'Customer'}</option>)}
        </select>
      </label>
      {customer && (openRequests.length ? openRequests.map(request => (
        <button key={request.id} type="button" onClick={() => onOpenRequest(request.id)} className="block min-h-11 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-left text-sm font-semibold text-blue-800">Open request: {request.title}</button>
      )) : <div className="space-y-2">
        <p className="text-sm text-slate-700">No open service request. Ask this customer to request the work before proposing a shared appointment.</p>
        <button type="button" onClick={() => onOpenCustomer(customer.connection_id)} className="min-h-11 rounded-lg border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-800">View customer requests</button>
      </div>)}
    </section>
  );
}
