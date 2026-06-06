import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Customer, Finding, QuoteStatus, QBSettings, Invoice } from '../types';
import InvoiceModal from './InvoiceModal';

interface WorkTrackerProps {
  customers: Customer[];
  selectedCustomerId: string | null;
  onUpdateCustomer: (c: Customer) => void;
  qbSettings: QBSettings;
}

const PRIORITY_STYLES: Record<string, React.CSSProperties> = {
  'Urgent': { backgroundColor: '#fee2e2', color: '#dc2626' },
  'High': { backgroundColor: '#fef3c7', color: '#d97706' },
  'Medium': { backgroundColor: '#dbeafe', color: '#2563eb' },
  'Low': { backgroundColor: '#f1f5f9', color: '#64748b' },
};

const QUOTE_STATUSES: QuoteStatus[] = ['Not Sent', 'Ready to Quote', 'Needs Approval', 'Approved', 'Declined', 'Included in Plan'];

export default function WorkTracker({ customers, selectedCustomerId, onUpdateCustomer, qbSettings }: WorkTrackerProps) {
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  const customer = customers.find(c => c.id === selectedCustomerId) || customers[0];
  if (!customer) return <div className="p-6 text-slate-400">No customer selected.</div>;

  const allFindings: (Finding & { customerName: string })[] = Object.values(customer.findings)
    .flat()
    .filter(f => f.status !== 'Pass' && f.status !== 'Fixed On Site')
    .map(f => ({ ...f, customerName: customer.name }));

  const updateQuoteStatus = (finding: Finding, quoteStatus: QuoteStatus) => {
    const roomFindings = (customer.findings[finding.room] || []).map(f =>
      f.id === finding.id ? { ...f, quoteStatus } : f
    );
    onUpdateCustomer({
      ...customer,
      findings: { ...customer.findings, [finding.room]: roomFindings },
    });
  };

  const handleSaveInvoice = (invoice: Invoice) => {
    const existing = (customer.invoices || []).find(i => i.id === invoice.id);
    const invoices = existing
      ? (customer.invoices || []).map(i => i.id === invoice.id ? invoice : i)
      : [...(customer.invoices || []), invoice];
    onUpdateCustomer({ ...customer, invoices });
  };

  const approvedCount = allFindings.filter(f => f.quoteStatus === 'Approved' || f.quoteStatus === 'Ready to Quote').length;

  return (
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-slate-800 text-xl">Work Tracker</h1>
          <p className="text-slate-500 text-sm mt-0.5">{customer.name} — {allFindings.length} open item{allFindings.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowInvoiceModal(true)}
          className="flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex-shrink-0"
          style={{ backgroundColor: '#16a34a' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#15803d')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#16a34a')}
        >
          <FileText size={15} />
          Create Invoice
          {approvedCount > 0 && (
            <span className="bg-white text-green-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{approvedCount}</span>
          )}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {allFindings.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No open items. All inspected items are passed, monitored, or fixed on site.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Item</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Room</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-56">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-48">Recommended Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-44">Quote Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allFindings.map(finding => {
                  const priorityStyle = PRIORITY_STYLES[finding.priority] || PRIORITY_STYLES['Low'];
                  return (
                    <tr key={finding.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 text-sm leading-tight">{finding.title}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-600 text-sm whitespace-nowrap">{finding.room}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={priorityStyle}>
                          {finding.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-600 text-xs line-clamp-2">{finding.description || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-blue-600 text-xs font-medium">{finding.action || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-600 text-xs whitespace-nowrap">{finding.due || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500 bg-white w-full"
                          value={finding.quoteStatus}
                          onChange={e => updateQuoteStatus(finding, e.target.value as QuoteStatus)}
                        >
                          {QUOTE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showInvoiceModal && (
        <InvoiceModal
          customer={customer}
          qbConnected={qbSettings.connected}
          existingCount={(customer.invoices || []).length}
          onSave={handleSaveInvoice}
          onClose={() => setShowInvoiceModal(false)}
        />
      )}
    </div>
  );
}
