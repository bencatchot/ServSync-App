import { useState } from 'react';
import { X, Plus, Trash2, Info } from 'lucide-react';
import { Customer, Invoice, InvoiceLineItem, InvoiceStatus } from '../types';

interface InvoiceModalProps {
  customer: Customer;
  invoice?: Invoice | null;
  readOnly?: boolean;
  qbConnected: boolean;
  existingCount: number;
  onSave: (invoice: Invoice) => void;
  onClose: () => void;
}

function today(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function nextInvoiceNumber(count: number): string {
  const year = new Date().getFullYear();
  return `INV-${year}-${String(count + 1).padStart(3, '0')}`;
}

function calcAmount(qty: number, rate: number): number {
  return Math.round(qty * rate * 100) / 100;
}

const STATUS_STYLES: Record<InvoiceStatus, React.CSSProperties> = {
  Draft: { backgroundColor: '#f1f5f9', color: '#64748b' },
  Sent: { backgroundColor: '#dbeafe', color: '#2563eb' },
  Paid: { backgroundColor: '#dcfce7', color: '#16a34a' },
  Overdue: { backgroundColor: '#fee2e2', color: '#dc2626' },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={STATUS_STYLES[status]}>{status}</span>
  );
}

export default function InvoiceModal({ customer, invoice, readOnly = false, qbConnected, existingCount, onSave, onClose }: InvoiceModalProps) {
  const prefilledItems = (): InvoiceLineItem[] => {
    if (invoice) return invoice.lineItems;
    const allFindings = Object.values(customer.findings).flat()
      .filter(f => f.status !== 'Fixed On Site' && (f.quoteStatus === 'Approved' || f.quoteStatus === 'Ready to Quote'));
    if (allFindings.length === 0) {
      return [{ id: crypto.randomUUID(), description: '', category: '', quantity: 1, rate: 0, amount: 0 }];
    }
    return allFindings.map(f => ({
      id: crypto.randomUUID(),
      description: `${f.title} — ${f.room}`,
      category: f.priority,
      quantity: 1,
      rate: 0,
      amount: 0,
    }));
  };

  const [invoiceNumber] = useState(invoice?.invoiceNumber || nextInvoiceNumber(existingCount));
  const [date, setDate] = useState(invoice?.date || today());
  const [dueDate, setDueDate] = useState(invoice?.dueDate || addDays(30));
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(prefilledItems);
  const [taxRate, setTaxRate] = useState(invoice?.taxRate ?? 0);
  const [notes, setNotes] = useState(invoice?.notes || '');
  const [showQBBanner, setShowQBBanner] = useState(false);

  const updateItem = (id: string, field: keyof InvoiceLineItem, value: string | number) => {
    setLineItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'rate') {
        updated.amount = calcAmount(
          field === 'quantity' ? Number(value) : item.quantity,
          field === 'rate' ? Number(value) : item.rate
        );
      }
      return updated;
    }));
  };

  const addItem = () => {
    setLineItems(prev => [...prev, { id: crypto.randomUUID(), description: '', category: '', quantity: 1, rate: 0, amount: 0 }]);
  };

  const removeItem = (id: string) => {
    setLineItems(prev => prev.filter(i => i.id !== id));
  };

  const subtotal = lineItems.reduce((s, i) => s + i.amount, 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = subtotal + taxAmount;

  const buildInvoice = (status: InvoiceStatus): Invoice => ({
    id: invoice?.id || crypto.randomUUID(),
    invoiceNumber,
    customerId: customer.id,
    date,
    dueDate,
    lineItems,
    taxRate,
    notes,
    status,
  });

  const handleSendViaQB = () => {
    if (!qbConnected) { setShowQBBanner(true); return; }
    onSave(buildInvoice('Sent'));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-white text-xs" style={{ backgroundColor: '#16a34a' }}>QB</div>
            <div>
              <h3 className="font-semibold text-slate-800">
                {readOnly ? `Invoice ${invoiceNumber}` : 'Create QuickBooks Invoice'}
              </h3>
              <p className="text-xs text-slate-400">{customer.name} · {customer.address}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {invoice && <InvoiceStatusBadge status={invoice.status} />}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="p-6 space-y-5">
            {/* Invoice Meta */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Invoice #</label>
                <input
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none bg-slate-50 text-slate-500 cursor-default"
                  value={invoiceNumber}
                  readOnly
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Invoice Date</label>
                <input
                  className={`w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500 ${readOnly ? 'bg-slate-50 text-slate-500 cursor-default' : ''}`}
                  value={date}
                  onChange={e => !readOnly && setDate(e.target.value)}
                  readOnly={readOnly}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Due Date</label>
                <input
                  className={`w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500 ${readOnly ? 'bg-slate-50 text-slate-500 cursor-default' : ''}`}
                  value={dueDate}
                  onChange={e => !readOnly && setDueDate(e.target.value)}
                  readOnly={readOnly}
                />
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Line Items</label>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 w-auto">Description</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 w-24">Category</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 w-16">Qty</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 w-24">Rate ($)</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 w-20">Amount</th>
                      {!readOnly && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map(item => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          {readOnly ? (
                            <span className="text-slate-700 text-sm">{item.description}</span>
                          ) : (
                            <input
                              className="w-full border-0 outline-none text-sm text-slate-700 bg-transparent"
                              value={item.description}
                              onChange={e => updateItem(item.id, 'description', e.target.value)}
                              placeholder="Item description..."
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {readOnly ? (
                            <span className="text-slate-500 text-xs">{item.category}</span>
                          ) : (
                            <input
                              className="w-full border-0 outline-none text-xs text-slate-500 bg-transparent"
                              value={item.category}
                              onChange={e => updateItem(item.id, 'category', e.target.value)}
                              placeholder="Category"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {readOnly ? (
                            <span className="text-slate-700">{item.quantity}</span>
                          ) : (
                            <input
                              type="number"
                              min="1"
                              className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-blue-500"
                              value={item.quantity}
                              onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 1)}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {readOnly ? (
                            <span className="text-slate-700">${item.rate.toFixed(2)}</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-blue-500"
                              value={item.rate || ''}
                              placeholder="0.00"
                              onChange={e => updateItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-medium text-slate-700">${item.amount.toFixed(2)}</span>
                        </td>
                        {!readOnly && (
                          <td className="px-2 py-2">
                            <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!readOnly && (
                <button
                  onClick={addItem}
                  className="mt-2 flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <Plus size={13} /> Add Line Item
                </button>
              )}
            </div>

            {/* Summary */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium text-slate-700">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Tax</span>
                    {!readOnly && (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        className="w-14 border border-slate-200 rounded-lg px-2 py-0.5 text-xs outline-none focus:border-blue-500 text-center"
                        value={taxRate}
                        onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                      />
                    )}
                    <span className="text-slate-400 text-xs">%</span>
                  </div>
                  <span className="font-medium text-slate-700">${taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="font-bold text-slate-800">Total</span>
                  <span className="font-bold text-xl text-slate-800">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Notes to Customer</label>
              {readOnly ? (
                <p className="text-sm text-slate-600">{notes || '—'}</p>
              ) : (
                <textarea
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none"
                  placeholder="Notes to customer..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              )}
            </div>

            {/* QB Banner */}
            {showQBBanner && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                Connect QuickBooks in <strong>Settings</strong> to send invoices directly. You can save as draft and send later.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {!readOnly && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0 gap-3">
            <button onClick={onClose} className="border border-slate-200 text-slate-600 rounded-xl px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => { onSave(buildInvoice('Draft')); onClose(); }}
                className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Save as Draft
              </button>
              <div className="relative group">
                <button
                  onClick={handleSendViaQB}
                  className="flex items-center gap-2 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
                  style={{ backgroundColor: '#16a34a' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#15803d')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#16a34a')}
                >
                  Send Invoice via QuickBooks
                  {!qbConnected && (
                    <span className="flex items-center gap-1 bg-amber-400 text-amber-900 text-xs font-bold px-1.5 py-0.5 rounded-full">
                      <Info size={9} /> QB Required
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
