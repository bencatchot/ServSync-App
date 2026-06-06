import { useEffect, useState } from 'react';
import { Plus, CreditCard as Edit2, Trash2, Phone, Mail, X, FileText, CalendarDays, Download, ExternalLink, Send, EyeOff, Star } from 'lucide-react';
import { Customer, Vendor, ServicePlan, RoofType, HvacType, Page, ServiceRequest, RequestStatus, Invoice, QBSettings, ReportLog } from '../types';
import { VENDOR_ICONS, VENDOR_TYPES } from '../data';
import InvoiceModal, { InvoiceStatusBadge } from './InvoiceModal';
import { supabase } from '../supabaseClient';

interface CustomersProps {
  customers: Customer[];
  selectedCustomerId: string | null;
  onSelectCustomer: (id: string) => void;
  onAddCustomer: (c: Customer) => void;
  onUpdateCustomer: (c: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  onNavigate: (page: Page) => void;
  qbSettings: QBSettings;
  onUpdateReportLogVisibility: (customerId: string, reportId: string, publish: boolean) => void;
}

const PLANS: ServicePlan[] = ['Monthly $85/mo', 'Quarterly $240', 'Biannually $450', 'Custom Plan', 'No active plan'];
const ROOF_TYPES: RoofType[] = ['Asphalt Shingles', 'Metal', 'Tile', 'Flat/TPO', 'Slate', 'Wood Shake', 'Other'];
const HVAC_TYPES: HvacType[] = ['Central Air/Gas Heat', 'Heat Pump', 'Mini-Split', 'Window Units', 'Radiant', 'Other'];

type Tab = 'profile' | 'home' | 'vendors' | 'requests' | 'schedule' | 'reports' | 'invoices' | 'actions';

const CATEGORY_ICONS: Record<string, string> = {
  'HVAC': '❄️', 'Plumbing': '🔧', 'Electrical': '⚡', 'Appliance': '🫧',
  'Exterior': '🏡', 'Interior': '🛋️', 'Pest/Landscaping': '🌿', 'Other': '📋',
};

const STATUS_OPTIONS: RequestStatus[] = ['Pending', 'Scheduled', 'In Progress', 'Completed'];

const STATUS_STYLES: Record<RequestStatus, React.CSSProperties> = {
  'Pending': { backgroundColor: '#f1f5f9', color: '#64748b' },
  'Scheduled': { backgroundColor: '#dbeafe', color: '#2563eb' },
  'In Progress': { backgroundColor: '#fef3c7', color: '#d97706' },
  'Completed': { backgroundColor: '#dcfce7', color: '#16a34a' },
};

const PRIORITY_STYLES: Record<string, React.CSSProperties> = {
  'Urgent': { backgroundColor: '#fee2e2', color: '#dc2626' },
  'Medium': { backgroundColor: '#dbeafe', color: '#2563eb' },
  'Low': { backgroundColor: '#f1f5f9', color: '#64748b' },
};


function customerGroupKey(customer: Customer) {
  const email = customer.email.trim().toLowerCase();
  if (email) return `email:${email}`;
  const owner = customer.owner.trim().toLowerCase();
  const phone = customer.phone.replace(/\D/g, '');
  if (owner && phone) return `owner-phone:${owner}:${phone}`;
  if (owner) return `owner:${owner}`;
  return `single:${customer.id}`;
}

function customerGroupLabel(group: Customer[]) {
  if (group.length <= 1) return group[0]?.name || 'Customer';
  const first = group[0];
  return first.owner || first.email || first.name || 'Customer Group';
}

function unitLabel(customer: Customer) {
  const unitMatch = customer.name.match(/(?:unit|apt|apartment|suite|#)\s*([a-z0-9-]+)/i);
  if (unitMatch) return `Unit ${unitMatch[1]}`;
  return customer.name;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-6 flex-1">{children}</div>
      </div>
    </div>
  );
}

function CustomerFormModal({ customer, onSave, onClose }: {
  customer?: Customer | null;
  onSave: (data: Partial<Customer>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: customer?.name || '',
    address: customer?.address || '',
    owner: customer?.owner || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    plan: customer?.plan || 'No active plan' as ServicePlan,
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Modal title={customer ? 'Edit Customer' : 'Add Customer'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Property Name</label>
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. 142 Oakwood Drive" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Address</label>
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.address} onChange={e => set('address', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Owner Name</label>
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.owner} onChange={e => set('owner', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Service Plan</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.plan} onChange={e => set('plan', e.target.value)}>
            {PLANS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2 text-sm font-medium hover:bg-slate-50 transition-colors">Cancel</button>
          <button
            onClick={() => { onSave(form); onClose(); }}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            {customer ? 'Save Changes' : 'Add Customer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function HomeDetailsModal({ customer, onSave, onClose }: {
  customer: Customer;
  onSave: (home: Customer['home']) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ ...customer.home });
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Modal title="Edit Home Details" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {([['sqft', 'Square Footage'], ['yearBuilt', 'Year Built'], ['stories', 'Stories'], ['garage', 'Garage'], ['roofAge', 'Roof Age'], ['hvacAge', 'HVAC Age']] as [string, string][]).map(([k, label]) => (
            <div key={k}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form[k as keyof typeof form] as string} onChange={e => set(k, e.target.value)} />
            </div>
          ))}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Pool</label>
          <div className="flex gap-3">
            {['Yes', 'No'].map(v => (
              <button key={v} onClick={() => set('pool', v === 'Yes')} className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${form.pool === (v === 'Yes') ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}>{v}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Roof Type</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.roofType} onChange={e => set('roofType', e.target.value)}>
            {ROOF_TYPES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">HVAC Type</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.hvacType} onChange={e => set('hvacType', e.target.value)}>
            {HVAC_TYPES.map(h => <option key={h}>{h}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Property Notes</label>
          <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2 text-sm font-medium hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={() => { onSave(form); onClose(); }} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors">Save Changes</button>
        </div>
      </div>
    </Modal>
  );
}

function VendorModal({ vendor, onSave, onClose }: {
  vendor?: Vendor | null;
  onSave: (v: Vendor) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Vendor>({
    id: vendor?.id || crypto.randomUUID(),
    type: vendor?.type || 'HVAC',
    company: vendor?.company || '',
    phone: vendor?.phone || '',
    account: vendor?.account || '',
    notes: vendor?.notes || '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Modal title={vendor ? 'Edit Vendor' : 'Add Vendor'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-2">Vendor Type</label>
          <div className="flex flex-wrap gap-2">
            {VENDOR_TYPES.map(type => (
              <button
                key={type}
                onClick={() => set('type', type)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${form.type === type ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}
              >
                {VENDOR_ICONS[type]} {type}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Company Name</label>
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.company} onChange={e => set('company', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Account/Contract #</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.account} onChange={e => set('account', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
          <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2 text-sm font-medium hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={() => { onSave(form); onClose(); }} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors">{vendor ? 'Save Changes' : 'Add Vendor'}</button>
        </div>
      </div>
    </Modal>
  );
}


function SavedReportModal({ log, onClose }: { log: ReportLog; onClose: () => void }) {
  const snapshot = log.snapshot;
  return (
    <Modal title={log.title} onClose={onClose}>
      {!snapshot ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          This older report entry only has summary details. Export a new PDF after running the latest SQL to save a full reopenable copy.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-blue-600 rounded-2xl p-4 text-white">
            <p className="font-bold text-lg">ServSync</p>
            <p className="text-blue-100 text-sm mt-1">Saved report copy</p>
          </div>
          {log.pdfUrl && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => window.open(log.pdfUrl, '_blank', 'noopener,noreferrer')}
                className="flex items-center gap-1.5 text-sm font-semibold text-white px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                <ExternalLink size={14} /> Open Original PDF
              </button>
              <a
                href={log.pdfUrl}
                download={log.fileName || 'inspection-report.pdf'}
                className="flex items-center gap-1.5 text-sm font-semibold border border-slate-200 text-slate-600 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <Download size={14} /> Download PDF
              </a>
            </div>
          )}
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="font-semibold text-slate-800">{snapshot.customerName}</p>
            <p className="text-sm text-slate-500">{snapshot.address}</p>
            <p className="text-xs text-slate-400 mt-1">Saved {new Date(snapshot.createdAt).toLocaleString()}</p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-white rounded-xl p-3"><p className="text-xs text-slate-400">Owner</p><p className="text-sm font-semibold text-slate-700">{snapshot.owner}</p></div>
              <div className="bg-white rounded-xl p-3"><p className="text-xs text-slate-400">Plan</p><p className="text-sm font-semibold text-slate-700">{snapshot.plan}</p></div>
              <div className="bg-white rounded-xl p-3"><p className="text-xs text-slate-400">Rooms</p><p className="text-sm font-semibold text-slate-700">{snapshot.rooms.length}</p></div>
            </div>
          </div>

          {snapshot.rooms.map(room => (
            <div key={room.name} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="font-semibold text-slate-800 text-sm">{room.name}</p>
                <p className="text-xs text-slate-400">{room.passed.length} pass · {room.findings.length} issues</p>
              </div>
              <div className="p-4 space-y-3">
                {room.roomPhotoUrls.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {room.roomPhotoUrls.map(url => <img key={url} src={url} className="w-full h-20 object-cover rounded-lg" />)}
                  </div>
                )}
                {[...room.findings, ...room.passed].map(item => (
                  <div key={item.id} className="border-l-4 border-slate-300 bg-slate-50 rounded-r-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white text-slate-600">{item.status}</span>
                    </div>
                    {item.description && <p className="text-sm text-slate-600 mt-2">{item.description}</p>}
                    {item.action && <p className="text-sm text-blue-600 font-medium mt-1">→ {item.action}</p>}
                    {item.photoUrls.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mt-3">
                        {item.photoUrls.map(url => <img key={url} src={url} className="w-full h-20 object-cover rounded-lg" />)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function RequestCard({ req, onUpdate, onRead }: {
  req: ServiceRequest;
  onUpdate: (status: RequestStatus, notes: string) => void;
  onRead: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<RequestStatus>(req.status);
  const [notes, setNotes] = useState(req.contractorNotes);

  const handleSave = () => {
    onUpdate(status, notes);
    setEditing(false);
  };

  return (
    <div
      className={`bg-white rounded-2xl border overflow-hidden ${!req.read ? 'border-blue-300' : 'border-slate-200'}`}
      onMouseEnter={() => { if (!req.read) onRead(); }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl flex-shrink-0">{CATEGORY_ICONS[req.category] || '📋'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold text-slate-800">{req.category}</span>
              {req.room && <span className="text-xs text-slate-400">· {req.room}</span>}
              {!req.read && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">New</span>}
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={PRIORITY_STYLES[req.priority]}>{req.priority}</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={STATUS_STYLES[req.status]}>{req.status}</span>
            </div>
            <p className="text-sm text-slate-600">{req.description}</p>
            <p className="text-xs text-slate-400 mt-1">{req.submittedAt}</p>
            {req.photoUrl && (
              <button
                type="button"
                onClick={() => window.open(req.photoUrl, '_blank', 'noopener,noreferrer')}
                className="mt-3 block text-left"
              >
                <img src={req.photoUrl} alt="Customer request upload" className="h-28 w-36 rounded-xl object-cover border border-slate-200 hover:opacity-90 transition-opacity" />
                <span className="text-xs text-blue-600 font-medium mt-1 inline-block">Open photo</span>
              </button>
            )}
            {req.contractorNotes && !editing && (
              <div className="mt-2 bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-xs text-slate-500 font-medium">Your notes:</p>
                <p className="text-xs text-slate-700 mt-0.5">{req.contractorNotes}</p>
              </div>
            )}
          </div>
        </div>

        {editing ? (
          <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Update Status</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                value={status}
                onChange={e => setStatus(e.target.value as RequestStatus)}
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Contractor Notes</label>
              <textarea
                rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none"
                placeholder="Add notes for the customer..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-1.5 text-xs font-medium hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSave} className="flex-1 bg-blue-600 text-white rounded-lg py-1.5 text-xs font-medium hover:bg-blue-700 transition-colors">Save</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
            Update status & notes →
          </button>
        )}
      </div>
    </div>
  );
}

export default function Customers({ customers, selectedCustomerId, onSelectCustomer, onAddCustomer, onUpdateCustomer, onDeleteCustomer, onNavigate, qbSettings, onUpdateReportLogVisibility }: CustomersProps) {
  const [tab, setTab] = useState<Tab>('profile');
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [viewReportLog, setViewReportLog] = useState<ReportLog | null>(null);
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [showHomeDetails, setShowHomeDetails] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [customerFilter, setCustomerFilter] = useState<'active' | 'inactive'>('active');
  const [sendingOnboardingEmail, setSendingOnboardingEmail] = useState(false);
  const [connectedPropertyIds, setConnectedPropertyIds] = useState<Set<string>>(new Set());

  const visibleCustomers = customers.filter(c => customerFilter === 'active' ? c.isActive !== false : c.isActive === false);
  const visibleCustomerGroups = Array.from(visibleCustomers.reduce((map, customer) => {
    const key = customerGroupKey(customer);
    map.set(key, [...(map.get(key) || []), customer]);
    return map;
  }, new Map<string, Customer[]>()).values());

  const selected = customers.find(c => c.id === selectedCustomerId) || visibleCustomers[0] || customers[0];
  const selectedGroup = selected ? customers.filter(c => customerGroupKey(c) === customerGroupKey(selected)) : [];

  useEffect(() => {
    let cancelled = false;
    const loadConnectedPropertyIds = async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase.rpc('get_contractor_connected_homes');
        if (error) throw error;
        if (cancelled) return;
        const ids = new Set<string>(
          ((Array.isArray(data) ? data : []) as { property_id?: string }[])
            .map(row => row.property_id)
            .filter((id): id is string => Boolean(id))
        );
        setConnectedPropertyIds(ids);
      } catch (error) {
        console.warn('Unable to load connected homeowner badges:', error);
      }
    };
    void loadConnectedPropertyIds();
    return () => { cancelled = true; };
  }, []);

  const handleAddCustomer = (data: Partial<Customer>) => {
    const newCustomer: Customer = {
      id: crypto.randomUUID(),
      name: data.name || 'New Property',
      address: data.address || '',
      owner: data.owner || '',
      phone: data.phone || '',
      email: data.email || '',
      plan: data.plan || 'No active plan',
      home: { sqft: '', yearBuilt: '', stories: '', garage: '', pool: false, roofType: 'Asphalt Shingles', roofAge: '', hvacType: 'Central Air/Gas Heat', hvacAge: '', notes: '' },
      vendors: [],
      rooms: ['Exterior', 'Living Room', 'Kitchen', 'Master Bedroom', 'Master Bathroom', 'Garage'],
      checklist: {},
      findings: {},
      photos: {},
      requests: [],
      invoices: [],
      reportLogs: [],
      isActive: true,
    };
    onAddCustomer(newCustomer);
  };

  const handleEditCustomer = (data: Partial<Customer>) => {
    if (!selected) return;
    onUpdateCustomer({ ...selected, ...data });
  };

  const handleSaveHome = (home: Customer['home']) => {
    if (!selected) return;
    onUpdateCustomer({ ...selected, home });
  };

  const handleSaveVendor = (vendor: Vendor) => {
    if (!selected) return;
    const exists = selected.vendors.find(v => v.id === vendor.id);
    const vendors = exists
      ? selected.vendors.map(v => v.id === vendor.id ? vendor : v)
      : [...selected.vendors, vendor];
    onUpdateCustomer({ ...selected, vendors });
  };

  const handleDeleteVendor = (id: string) => {
    if (!selected) return;
    onUpdateCustomer({ ...selected, vendors: selected.vendors.filter(v => v.id !== id) });
  };

  const handleSetActive = (isActive: boolean) => {
    if (!selected) return;
    const label = isActive ? 'reactivate' : 'make inactive';
    if (!window.confirm(`Are you sure you want to ${label} ${selected.name}?`)) return;
    onUpdateCustomer({ ...selected, isActive });
  };

  const handlePlanChange = (plan: ServicePlan) => {
    if (!selected) return;
    onUpdateCustomer({ ...selected, plan });
  };

  const handlePermanentDelete = () => {
    if (!selected) return;
    const ok = window.confirm(`Permanently delete ${selected.name}? This removes the customer and related database records. Use this only for test/mistake customers.`);
    if (!ok) return;
    const extraOk = window.confirm('Final confirmation: this cannot be undone. Delete this customer permanently?');
    if (!extraOk) return;
    onDeleteCustomer(selected.id);
  };


  const missingVendorTypes = VENDOR_TYPES.filter(t => !selected?.vendors.some(v => v.type === t));

  const unreadRequestCount = (selected?.requests || []).filter(r => !r.read).length;

  const handleRequestStatusUpdate = (reqId: string, status: RequestStatus, notes: string) => {
    if (!selected) return;
    const updated = (selected.requests || []).map(r =>
      r.id === reqId ? { ...r, status, contractorNotes: notes, read: true } : r
    );
    onUpdateCustomer({ ...selected, requests: updated });
  };

  const markRequestRead = (reqId: string) => {
    if (!selected) return;
    const updated = (selected.requests || []).map(r =>
      r.id === reqId ? { ...r, read: true } : r
    );
    onUpdateCustomer({ ...selected, requests: updated });
  };

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'home', label: 'Home Details' },
    { id: 'vendors', label: 'Preferred Vendors' },
    { id: 'requests', label: 'Requests', badge: unreadRequestCount || undefined },
    { id: 'schedule', label: 'Schedule' },
    { id: 'reports', label: 'Report History' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'actions', label: 'Actions' },
  ];

  const handleSaveInvoice = (invoice: Invoice) => {
    if (!selected) return;
    const existing = (selected.invoices || []).find(i => i.id === invoice.id);
    const invoices = existing
      ? (selected.invoices || []).map(i => i.id === invoice.id ? invoice : i)
      : [...(selected.invoices || []), invoice];
    onUpdateCustomer({ ...selected, invoices });
  };

  const handleSyncToQB = () => {
    if (!selected) return;
    onUpdateCustomer({ ...selected, qbCustomerId: `QB-CUST-${Math.floor(Math.random() * 9000) + 1000}` });
  };

  const actionButtons = [
    { label: 'Build Checklist', page: 'checklist' as Page, color: 'border-blue-600 text-blue-600 hover:bg-blue-50' },
    { label: 'Start Inspection', page: 'inspection' as Page, color: 'bg-blue-600 text-white hover:bg-blue-700' },
    { label: 'View Report', page: 'report' as Page, color: 'border-slate-300 text-slate-700 hover:bg-slate-50' },
    { label: 'Work Tracker', page: 'tracker' as Page, color: 'border-slate-300 text-slate-700 hover:bg-slate-50' },
  ];

  const appBaseUrl = window.location.origin;
  const onboardingLink = selected ? `${appBaseUrl}/#/onboarding?customer=${selected.id}` : '';

  const openOnboardingForm = () => {
    if (!selected) return;
    window.location.hash = `#/onboarding?customer=${selected.id}`;
  };

  const copyOnboardingLink = async () => {
    if (!onboardingLink) return;
    try {
      await navigator.clipboard.writeText(onboardingLink);
      alert('Onboarding link copied. You can paste it into a text or email to the customer.');
    } catch {
      window.prompt('Copy this onboarding link:', onboardingLink);
    }
  };


  const sendOnboardingLink = async () => {
    if (!selected || !onboardingLink) return;
    if (!selected.email) {
      alert('This customer does not have an email address saved yet.');
      return;
    }
    setSendingOnboardingEmail(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error('Your admin login session has expired. Please sign out, sign back in, and try again.');
      }

      const { data, error } = await supabase.functions.invoke('send-onboarding-email', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          customerId: selected.id,
          customerName: selected.name,
          ownerName: selected.owner,
          email: selected.email,
          onboardingLink,
        },
      });
      if (error) {
        const context = (error as { context?: Response }).context;
        let details = error.message;
        try {
          const body = await context?.clone().json();
          details = body?.error || body?.message || JSON.stringify(body);
          if (body?.details?.message) details += ` — ${body.details.message}`;
          if (body?.details?.name) details += ` — ${body.details.name}`;
        } catch {
          // keep the default error message
        }
        throw new Error(details || 'Email function failed.');
      }
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
      alert(`Onboarding email sent to ${selected.email}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to send onboarding email:', error);
      alert(`Unable to send onboarding email: ${message}`);
    } finally {
      setSendingOnboardingEmail(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Left column */}
      <div className="w-72 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-sm">Customers</h2>
            <button
              onClick={() => setShowAddCustomer(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              <Plus size={14} /> Add
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1 mt-3 bg-slate-100 rounded-xl p-1">
            {(['active', 'inactive'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setCustomerFilter(filter)}
                className={`py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${customerFilter === filter ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
              >
                {filter} ({customers.filter(c => filter === 'active' ? c.isActive !== false : c.isActive === false).length})
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {visibleCustomers.length === 0 && <p className="text-xs text-slate-400 text-center py-8">No {customerFilter} customers.</p>}
          {visibleCustomerGroups.map(group => {
            const first = group[0];
            const urgentCount = group.reduce((sum, c) => sum + Object.values(c.findings).flat().filter(f => f.status === 'Urgent').length, 0);
            const isSelected = !!selected && group.some(c => c.id === selected.id);
            const isMultiProperty = group.length > 1;
            const isConnected = group.some(c => connectedPropertyIds.has(c.id));
            const label = customerGroupLabel(group);
            return (
              <button
                key={customerGroupKey(first)}
                onClick={() => onSelectCustomer(isSelected && selected ? selected.id : first.id)}
                className={`w-full px-4 py-4 text-left hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
              >
                <p className={`font-medium text-sm ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>{isMultiProperty ? label : first.name}</p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {isMultiProperty ? `${group.length} properties / units` : first.owner}
                </p>
                {isMultiProperty && (
                  <p className="text-xs text-slate-500 mt-1 truncate">Selected: {selected && group.some(c => c.id === selected.id) ? unitLabel(selected) : unitLabel(first)}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{first.plan}</span>
                  {isConnected && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                      <Star size={11} fill="currentColor" /> Connected
                    </span>
                  )}
                  {isMultiProperty && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">Multi-property</span>}
                  {first.isActive === false && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Inactive</span>}
                  {group.some(c => c.qbCustomerId) && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: '#16a34a', fontSize: '10px' }}>QB</span>
                  )}
                  {urgentCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>{urgentCount} urgent</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right column */}
      {selected && (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          {/* Header */}
          <div className="bg-white border-b border-slate-200 px-6 py-4">
            <div className="flex items-start justify-between">
              <div>
                {selectedGroup.length > 1 && <p className="text-xs font-semibold text-indigo-600 mb-1">{customerGroupLabel(selectedGroup)} · {selectedGroup.length} properties</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-slate-800 text-lg">{selected.name}</h2>
                  {connectedPropertyIds.has(selected.id) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      <Star size={12} fill="currentColor" /> Connected homeowner
                    </span>
                  )}
                </div>
                <p className="text-slate-500 text-sm">{selected.address}</p>
                {selectedGroup.length > 1 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {selectedGroup.map(property => (
                      <button
                        key={property.id}
                        onClick={() => onSelectCustomer(property.id)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${property.id === selected.id ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700'}`}
                      >
                        {unitLabel(property)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {selected.isActive === false ? (
                  <button onClick={() => handleSetActive(true)} className="text-xs font-medium border border-green-200 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-50 transition-colors">Reactivate</button>
                ) : (
                  <button onClick={() => handleSetActive(false)} className="text-xs font-medium border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors">Make Inactive</button>
                )}
                <button
                  onClick={() => setShowEditCustomer(true)}
                  className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Edit2 size={13} /> Edit
                </button>
                <button onClick={handlePermanentDelete} className="flex items-center gap-1.5 text-xs font-medium border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={13} /> Delete</button>
              </div>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 mt-4 flex-wrap">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                >
                  {t.label}
                  {t.badge ? (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">{t.badge}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* Profile Tab */}
            {tab === 'profile' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 grid grid-cols-2 gap-4">
                  {[
                    ['Owner', selected.owner],
                    ['Phone', selected.phone],
                    ['Email', selected.email],
                    ['Status', selected.isActive === false ? 'Inactive' : 'Active'],
                    ['Rooms', `${selected.rooms.length} rooms`],
                    ['Vendors', `${selected.vendors.length} vendors`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
                      <p className="text-sm text-slate-800 font-medium">{value}</p>
                    </div>
                  ))}
                  <div className="col-span-2 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Service Plan</p>
                        <p className="text-sm text-slate-700 mt-0.5">Change this when a customer switches billing/visit frequency.</p>
                      </div>
                      <select
                        className="w-full sm:w-64 border border-blue-200 bg-white rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        value={selected.plan}
                        onChange={e => handlePlanChange(e.target.value as ServicePlan)}
                      >
                        {PLANS.map(plan => <option key={plan} value={plan}>{plan}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* QuickBooks row */}
                  <div className="col-span-2 pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-400 font-medium mb-1.5">QuickBooks</p>
                    {selected.qbCustomerId ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: '#16a34a' }}>QB</span>
                        <span className="text-sm font-medium text-slate-700">Synced</span>
                        <span className="text-xs text-slate-400">· ID: {selected.qbCustomerId}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-500">Not Synced</span>
                        <button
                          onClick={handleSyncToQB}
                          disabled={!qbSettings.connected}
                          className="text-xs font-semibold text-white px-3 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ backgroundColor: '#16a34a' }}
                          title={!qbSettings.connected ? 'Connect QuickBooks in Settings first' : 'Sync to QuickBooks'}
                        >
                          Sync to QuickBooks
                        </button>
                        {!qbSettings.connected && <span className="text-xs text-slate-400">Connect QB in Settings first</span>}
                      </div>
                    )}
                  </div>
                </div>
                {selected.home.notes && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                    <p className="text-xs font-semibold text-yellow-700 mb-1">Property Notes</p>
                    <p className="text-sm text-yellow-800">{selected.home.notes}</p>
                  </div>
                )}
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-center gap-3">
                    <Phone size={14} className="text-slate-400" />
                    <span className="text-sm text-slate-700">{selected.phone}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <Mail size={14} className="text-slate-400" />
                    <span className="text-sm text-slate-700">{selected.email}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Home Details Tab */}
            {tab === 'home' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-800 text-sm">Home Details</h3>
                    <button onClick={() => setShowHomeDetails(true)} className="text-xs font-medium border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                      Edit Details
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      ['Sq Footage', selected.home.sqft || '—'],
                      ['Year Built', selected.home.yearBuilt || '—'],
                      ['Stories', selected.home.stories || '—'],
                      ['Garage', selected.home.garage || '—'],
                      ['Pool', selected.home.pool ? 'Yes' : 'No'],
                      ['Roof Type', selected.home.roofType],
                      ['Roof Age', selected.home.roofAge || '—'],
                      ['HVAC Type', selected.home.hvacType],
                      ['HVAC Age', selected.home.hvacAge || '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-slate-50 rounded-xl p-3">
                        <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
                        <p className="text-sm text-slate-800 font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {selected.home.notes && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                    <p className="text-xs font-semibold text-yellow-700 mb-1">Property Notes</p>
                    <p className="text-sm text-yellow-800">{selected.home.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Vendors Tab */}
            {tab === 'vendors' && (
              <div className="space-y-4">
                {selected.vendors.map(vendor => (
                  <div key={vendor.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">{VENDOR_ICONS[vendor.type]}</span>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{vendor.company}</p>
                          <p className="text-xs text-slate-400">{vendor.type}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <Phone size={11} className="text-slate-400" />
                            <span className="text-xs text-slate-600">{vendor.phone}</span>
                          </div>
                          {vendor.account && (
                            <p className="text-xs text-slate-500 mt-0.5">Acct: {vendor.account}</p>
                          )}
                          {vendor.notes && (
                            <p className="text-xs text-slate-400 mt-1">{vendor.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditVendor(vendor)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => handleDeleteVendor(vendor.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {missingVendorTypes.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold text-slate-500 mb-3">Quick Add Missing Vendors</p>
                    <div className="flex flex-wrap gap-2">
                      {missingVendorTypes.slice(0, 6).map(type => (
                        <button
                          key={type}
                          onClick={() => { setEditVendor(null); setShowAddVendor(true); }}
                          className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-colors"
                        >
                          <span>{VENDOR_ICONS[type]}</span> {type}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => { setEditVendor(null); setShowAddVendor(true); }}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-blue-300 text-blue-600 rounded-2xl py-3 text-sm font-medium hover:bg-blue-50 transition-colors"
                >
                  <Plus size={16} /> Add Vendor
                </button>
              </div>
            )}

            {/* Requests Tab */}
            {tab === 'requests' && (
              <div className="space-y-3">
                {(selected?.requests || []).length === 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">No customer requests yet.</div>
                )}
                {[...(selected?.requests || [])].reverse().map(req => (
                  <RequestCard
                    key={req.id}
                    req={req}
                    onUpdate={(status, notes) => handleRequestStatusUpdate(req.id, status, notes)}
                    onRead={() => markRequestRead(req.id)}
                  />
                ))}
              </div>
            )}

            {/* Schedule Tab */}
            {tab === 'schedule' && (
              <div className="space-y-3">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Maintenance Scheduler</p>
                      <p className="text-xs text-slate-400 mt-0.5">Auto-created reminders from finalized inspections. Auto follow-ups are added to the next checklist and highlighted on the Inspect tab.</p>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                      {(selected?.maintenanceSchedule || []).filter(item => item.status !== 'Completed').length} open
                    </span>
                  </div>
                </div>

                {(selected?.maintenanceSchedule || []).length === 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                    <CalendarDays size={24} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-slate-500 text-sm font-medium">No scheduled reminders yet.</p>
                    <p className="text-slate-400 text-xs mt-1">Finalize an inspection with monitor, fixed, repair, or urgent items to create next-visit reminders.</p>
                  </div>
                )}

                {[...(selected?.maintenanceSchedule || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(item => (
                  <div key={item.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                          <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">Auto</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{item.room} · {item.source} · {item.frequency}</p>
                        {item.notes && <p className="text-xs text-slate-500 mt-2">{item.notes}</p>}
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${item.priority === 'Urgent' ? 'bg-red-100 text-red-600' : item.status === 'Due' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div className="bg-slate-50 rounded-xl px-3 py-2"><p className="text-xs text-slate-400">Due Date</p><p className="text-sm font-bold text-slate-800">{item.nextDueDate || 'Next visit'}</p></div>
                      <div className="bg-slate-50 rounded-xl px-3 py-2"><p className="text-xs text-slate-400">Visit</p><p className="text-sm font-bold text-slate-800">{item.nextDueVisit}</p></div>
                      <div className="bg-slate-50 rounded-xl px-3 py-2"><p className="text-xs text-slate-400">Priority</p><p className="text-sm font-bold text-slate-800">{item.priority}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reports Tab */}
            {tab === 'reports' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{(selected?.reportLogs || []).length} report{(selected?.reportLogs || []).length !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Finalized reports are saved internally first. Publish only when ready for the customer portal.</p>
                  </div>
                  <button
                    onClick={() => onNavigate('report')}
                    className="flex items-center gap-1.5 text-sm font-semibold text-white px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 transition-colors"
                  >
                    <FileText size={14} /> View Current Report
                  </button>
                </div>

                {(selected?.reportLogs || []).length === 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                    <FileText size={24} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-slate-500 text-sm font-medium">No reports logged yet.</p>
                    <p className="text-slate-400 text-xs mt-1">Finalize an inspection from the Report tab to save the first history entry.</p>
                  </div>
                )}

                {[...(selected?.reportLogs || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(log => (
                  <div key={log.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                          <FileText size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{log.title}</p>
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400">
                            <CalendarDays size={12} />
                            <span>{new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                          </div>
                          {log.notes && <p className="text-xs text-slate-500 mt-2">{log.notes}</p>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {log.urgentCount > 0 ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">{log.urgentCount} urgent</span>
                        ) : (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Saved</span>
                        )}
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${log.isPublished ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                          {log.isPublished ? 'Customer Visible' : 'Internal Draft'}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-3 flex-wrap">
                      {log.isPublished ? (
                        <button
                          onClick={() => onUpdateReportLogVisibility(selected.id, log.id, false)}
                          className="flex items-center gap-1 text-xs font-semibold border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          <EyeOff size={12} /> Hide from Customer
                        </button>
                      ) : (
                        <button
                          onClick={() => onUpdateReportLogVisibility(selected.id, log.id, true)}
                          className="flex items-center gap-1 text-xs font-semibold border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                        >
                          <Send size={12} /> Publish to Customer
                        </button>
                      )}
                      <button
                        onClick={() => setViewReportLog(log)}
                        className="text-xs font-semibold border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        View Saved Copy
                      </button>
                      {log.pdfUrl ? (
                        <>
                          <button
                            onClick={() => window.open(log.pdfUrl, '_blank', 'noopener,noreferrer')}
                            className="flex items-center gap-1 text-xs font-semibold border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            <ExternalLink size={12} /> Open Original PDF
                          </button>
                          <a
                            href={log.pdfUrl}
                            download={log.fileName || 'inspection-report.pdf'}
                            className="flex items-center gap-1 text-xs font-semibold border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            <Download size={12} /> Download PDF
                          </a>
                        </>
                      ) : (
                        <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">No original PDF saved</span>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-2 mt-3">
                      {[
                        ['Issues', log.issueCount],
                        ['Passed', log.passCount],
                        ['Rooms', log.roomCount],
                        ['Photos', log.photoCount],
                        ['Urgent', log.urgentCount],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-slate-50 rounded-xl px-3 py-2">
                          <p className="text-xs text-slate-400 font-medium">{label}</p>
                          <p className="text-sm text-slate-800 font-bold mt-0.5">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Invoices Tab */}
            {tab === 'invoices' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">{(selected?.invoices || []).length} invoice{(selected?.invoices || []).length !== 1 ? 's' : ''}</p>
                  <button
                    onClick={() => { setViewInvoice(null); setShowInvoiceModal(true); }}
                    className="flex items-center gap-1.5 text-sm font-semibold text-white px-3 py-1.5 rounded-xl transition-colors"
                    style={{ backgroundColor: '#16a34a' }}
                  >
                    <Plus size={14} /> Create Invoice
                  </button>
                </div>

                {(selected?.invoices || []).length === 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-sm">No invoices yet.</div>
                )}
                {[...(selected?.invoices || [])].reverse().map(inv => {
                  const subtotal = inv.lineItems.reduce((s, i) => s + i.amount, 0);
                  const tax = Math.round(subtotal * (inv.taxRate / 100) * 100) / 100;
                  const total = subtotal + tax;
                  return (
                    <div key={inv.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-slate-800">{inv.invoiceNumber}</p>
                          <InvoiceStatusBadge status={inv.status} />
                        </div>
                        <p className="text-xs text-slate-400">{inv.date} · Due {inv.dueDate}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{inv.lineItems.length} item{inv.lineItems.length !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-bold text-slate-800">${total.toFixed(2)}</p>
                        <button
                          onClick={() => { setViewInvoice(inv); setShowInvoiceModal(true); }}
                          className="text-xs font-medium border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Actions Tab */}
            {tab === 'actions' && (
              <div className="space-y-3">
                <div className="bg-white rounded-2xl border border-blue-100 p-5">
                  <p className="font-semibold text-slate-800 text-sm">Customer Onboarding Form</p>
                  <p className="text-xs text-slate-500 mt-1">Simple customer-friendly form that fills Home Details and Preferred Vendors.</p>
                  <div className="flex gap-2 mt-4 flex-wrap">
                    <button
                      onClick={openOnboardingForm}
                      className="flex-1 min-w-40 py-3 px-4 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      Open Form
                    </button>
                    <button
                      onClick={() => { void copyOnboardingLink(); }}
                      className="flex-1 min-w-40 py-3 px-4 rounded-xl text-sm font-semibold border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      Copy Customer Link
                    </button>
                    <button
                      onClick={() => { void sendOnboardingLink(); }}
                      disabled={sendingOnboardingEmail}
                      className="flex-1 min-w-40 py-3 px-4 rounded-xl text-sm font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-60"
                    >
                      {sendingOnboardingEmail ? 'Sending...' : 'Send Onboarding Email'}
                    </button>
                  </div>
                  {onboardingLink && <p className="text-xs text-slate-400 mt-3 break-all">{onboardingLink}</p>}
                </div>

                {actionButtons.map(({ label, page, color }) => (
                  <button
                    key={label}
                    onClick={() => onNavigate(page)}
                    className={`w-full py-4 px-5 rounded-2xl text-sm font-semibold border transition-colors text-left ${color}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddCustomer && (
        <CustomerFormModal onSave={handleAddCustomer} onClose={() => setShowAddCustomer(false)} />
      )}
      {showEditCustomer && selected && (
        <CustomerFormModal customer={selected} onSave={handleEditCustomer} onClose={() => setShowEditCustomer(false)} />
      )}
      {showHomeDetails && selected && (
        <HomeDetailsModal customer={selected} onSave={handleSaveHome} onClose={() => setShowHomeDetails(false)} />
      )}
      {(showAddVendor || editVendor) && (
        <VendorModal vendor={editVendor} onSave={v => { handleSaveVendor(v); setShowAddVendor(false); setEditVendor(null); }} onClose={() => { setShowAddVendor(false); setEditVendor(null); }} />
      )}
      {viewReportLog && <SavedReportModal log={viewReportLog} onClose={() => setViewReportLog(null)} />}
      {showInvoiceModal && selected && (
        <InvoiceModal
          customer={selected}
          invoice={viewInvoice}
          readOnly={viewInvoice !== null}
          qbConnected={qbSettings.connected}
          existingCount={(selected.invoices || []).length}
          onSave={handleSaveInvoice}
          onClose={() => { setShowInvoiceModal(false); setViewInvoice(null); }}
        />
      )}
    </div>
  );
}
