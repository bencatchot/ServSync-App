import { useState } from 'react';
import { X, Send, Image, FileText, Download, CheckCircle } from 'lucide-react';
import { Customer, Finding, QBSettings, Invoice, Photo, ReportLog, ReportSnapshot } from '../types';
import InvoiceModal from './InvoiceModal';
import { exportReportPdf } from '../utils/pdfExport';
import { buildProfessionalReportSummary } from '../utils/reportSummary';
import { supabase } from '../supabaseClient';

interface RoomReportProps {
  customers: Customer[];
  selectedCustomerId: string | null;
  qbSettings: QBSettings;
  onUpdateCustomer: (c: Customer) => void;
  onAddReportLog: (customerId: string, log: Omit<ReportLog, 'customerId'>) => Promise<void>;
  onClearCurrentInspection: (customerId: string) => Promise<void>;
  isInspectionClosed: boolean;
  onSetInspectionClosed: (customerId: string, closed: boolean) => void;
}

const STATUS_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  'Urgent': { border: '#dc2626', bg: '#fee2e2', text: '#dc2626' },
  'Needs Repair': { border: '#d97706', bg: '#fef3c7', text: '#d97706' },
  'Monitor': { border: '#2563eb', bg: '#dbeafe', text: '#2563eb' },
  'Fixed On Site': { border: '#0f766e', bg: '#ccfbf1', text: '#0f766e' },
  'Pass': { border: '#16a34a', bg: '#dcfce7', text: '#16a34a' },
};


function isItemPhoto(photo: Photo) {
  return photo.caption.startsWith('__item__');
}

function itemPhotoCaption(itemName: string) {
  return `__item__${itemName}`;
}

function photosForItem(roomPhotos: Photo[], finding: Finding) {
  return roomPhotos.filter(photo =>
    isItemPhoto(photo) &&
    (photo.caption === itemPhotoCaption(finding.itemKey) || photo.caption === itemPhotoCaption(finding.title))
  );
}


function createReportSnapshot(customer: Customer, createdAt: string): ReportSnapshot {
  return {
    customerName: customer.name,
    address: customer.address,
    owner: customer.owner,
    plan: customer.plan,
    createdAt,
    rooms: customer.rooms
      .map(room => {
        const roomPhotos = customer.photos[room] || [];
        const findings = customer.findings[room] || [];
        const toSnapshotFinding = (finding: Finding) => ({
          id: finding.id,
          title: finding.title,
          status: finding.status,
          description: finding.description,
          action: finding.action,
          due: finding.due,
          photoUrls: photosForItem(roomPhotos, finding).map(photo => photo.url),
        });

        return {
          name: room,
          findings: findings.filter(finding => finding.status !== 'Pass').map(toSnapshotFinding),
          passed: findings.filter(finding => finding.status === 'Pass').map(toSnapshotFinding),
          roomPhotoUrls: roomPhotos.filter(photo => !isItemPhoto(photo)).map(photo => photo.url),
        };
      })
      .filter(room => room.findings.length > 0 || room.passed.length > 0 || room.roomPhotoUrls.length > 0),
  };
}

function getRoomIcon(room: string) {
  const icons: Record<string, string> = {
    'Exterior': '🏡', 'Living Room': '🛋️', 'Kitchen': '🍳', 'Master Bedroom': '🛏️',
    'Master Bathroom': '🚿', 'Garage': '🚗', 'Bedroom 2': '🛏️', 'Bedroom 3': '🛏️',
    'Bathroom 2': '🚿', 'Laundry Room': '👕', 'Dining Room': '🍽️', 'Office': '💼',
    'Basement': '🔦', 'Attic': '📦', 'Sunroom': '☀️', 'Pool House': '🏊',
  };
  return icons[room] || '🏠';
}


function safeFileSegment(value: string) {
  return value.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 80) || 'report';
}

async function uploadReportPdf(customer: Customer, reportId: string, blob: Blob, fileName: string) {
  const objectPath = `${customer.id}/${reportId}/${fileName}`;
  const uploadRes = await supabase.storage.from('reports').upload(objectPath, blob, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (uploadRes.error) throw uploadRes.error;
  const { data } = supabase.storage.from('reports').getPublicUrl(objectPath);
  return { pdfPath: objectPath, pdfUrl: data.publicUrl };
}

function SendReportModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [email, setEmail] = useState(customer.email);
  const [note, setNote] = useState('');
  const allFindings = Object.values(customer.findings).flat();
  const urgentCount = allFindings.filter(f => f.status === 'Urgent').length;
  const issueCount = allFindings.filter(f => f.status !== 'Pass' && f.status !== 'Fixed On Site').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Send Report</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 text-sm space-y-1">
            <p className="font-semibold text-slate-700">{customer.name}</p>
            <p className="text-slate-500">{customer.address}</p>
            <p className="text-slate-500">{issueCount} findings · {urgentCount} urgent</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Personal Note</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none"
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a personal note to accompany the report..."
            />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            Note: Sending real email requires backend configuration.
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Send size={14} /> Send Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RoomReport({ customers, selectedCustomerId, qbSettings, onUpdateCustomer, onAddReportLog, onClearCurrentInspection, isInspectionClosed, onSetInspectionClosed }: RoomReportProps) {
  const [showSendModal, setShowSendModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [finalizingReport, setFinalizingReport] = useState(false);
  const customer = customers.find(c => c.id === selectedCustomerId) || customers[0];
  const inspectionClosed = isInspectionClosed;

  const updateInspectionClosed = (closed: boolean) => {
    if (!customer) return;
    onSetInspectionClosed(customer.id, closed);
  };

  const handleSaveInvoice = (invoice: Invoice) => {
    if (!customer) return;
    const existing = (customer.invoices || []).find(i => i.id === invoice.id);
    const invoices = existing
      ? (customer.invoices || []).map(i => i.id === invoice.id ? invoice : i)
      : [...(customer.invoices || []), invoice];
    onUpdateCustomer({ ...customer, invoices });
  };

  const reportStats = () => {
    const allFindings = Object.values(customer.findings).flat();
    const issueCount = allFindings.filter(f => f.status !== 'Pass' && f.status !== 'Fixed On Site').length;
    const urgentCount = allFindings.filter(f => f.status === 'Urgent').length;
    const passCount = allFindings.filter(f => f.status === 'Pass').length;
    const roomsWithData = customer.rooms.filter(room =>
      (customer.findings[room] || []).length > 0 || (customer.photos[room] || []).length > 0
    );
    const photoCount = Object.values(customer.photos).flat().length;
    return { issueCount, urgentCount, passCount, roomsWithData, photoCount };
  };

  const handleExportPdf = async () => {
    if (!customer) return;
    setExportingPdf(true);
    try {
      const fileName = `${safeFileSegment(customer.name)}-Preview-${new Date().toISOString().split('T')[0]}.pdf`;
      await exportReportPdf(customer, fileName);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF export failed. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleFinalizeReport = async () => {
    if (!customer || finalizingReport) return;
    const stats = reportStats();
    if (stats.roomsWithData.length === 0) {
      alert('There are no findings or photos to close yet. Run the inspection first.');
      return;
    }

    if (!inspectionClosed) {
      alert('Close the inspection for review first. After reviewing the preview, you can finalize and file it.');
      return;
    }

    const confirmed = window.confirm(
      'Finalize and file this inspection? This will save the original PDF internally, download a copy, and clear the current inspection for the next visit. It will NOT be visible in the customer portal until you publish it from Report History.'
    );
    if (!confirmed) return;

    setFinalizingReport(true);
    try {
      const reportId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const fileName = `${safeFileSegment(customer.name)}-${createdAt.split('T')[0]}-${reportId.slice(0, 8)}.pdf`;
      const exported = await exportReportPdf(customer, fileName);
      const storedPdf = await uploadReportPdf(customer, reportId, exported.blob, fileName);

      await onAddReportLog(customer.id, {
        id: reportId,
        createdAt,
        title: `Inspection Report — ${new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        issueCount: stats.issueCount,
        urgentCount: stats.urgentCount,
        passCount: stats.passCount,
        roomCount: stats.roomsWithData.length,
        photoCount: stats.photoCount,
        notes: 'Final report filed internally. Not yet published to the customer portal.',
        snapshot: createReportSnapshot(customer, createdAt),
        pdfUrl: storedPdf.pdfUrl,
        pdfPath: storedPdf.pdfPath,
        fileName,
      });

      await onClearCurrentInspection(customer.id);
      updateInspectionClosed(false);
      alert('Report finalized and saved internally. It is not visible in the customer portal until you publish it from Report History.');
    } catch (err) {
      console.error('Report finalization failed:', err);
      alert('The report was not finalized. Please try again. I did not clear the current inspection.');
    } finally {
      setFinalizingReport(false);
    }
  };

  if (!customer) return <div className="p-6 text-slate-400">No customer selected.</div>;

  const allFindings = Object.values(customer.findings).flat();
  const urgentCount = allFindings.filter(f => f.status === 'Urgent').length;
  const issueCount = allFindings.filter(f => f.status !== 'Pass' && f.status !== 'Fixed On Site').length;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const professionalSummary = buildProfessionalReportSummary(customer);

  const roomsWithData = customer.rooms.filter(room => {
    const hasFindings = (customer.findings[room] || []).length > 0;
    const hasPhotos = (customer.photos[room] || []).length > 0;
    return hasFindings || hasPhotos;
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main report */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="max-w-3xl space-y-5">
          {/* Header card */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-lg">ServSync</p>
                <p className="text-blue-200 text-sm">Building Trust with Quality Work · servsync.app</p>
              </div>
              <div className="text-right">
                {urgentCount > 0 ? (
                  <span className="inline-block px-3 py-1 rounded-full text-sm font-bold bg-red-500 text-white">
                    {urgentCount} Urgent
                  </span>
                ) : (
                  <span className="inline-block px-3 py-1 rounded-full text-sm font-bold bg-green-400 text-green-900">
                    All Clear
                  </span>
                )}
              </div>
            </div>
            <div className="px-6 py-4">
              <h2 className="font-bold text-slate-800 text-xl">{customer.name}</h2>
              <p className="text-slate-500 text-sm">{customer.address}</p>
              <p className="text-slate-400 text-xs mt-1">Prepared: {today}</p>
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[
                  ['Owner', customer.owner],
                  ['Plan', customer.plan],
                  ['Findings', `${issueCount} items`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-slate-50 rounded-xl px-4 py-3">
                    <p className="text-xs text-slate-400 font-medium">{label}</p>
                    <p className="text-sm text-slate-800 font-semibold mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border p-4 ${inspectionClosed ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-sm font-bold ${inspectionClosed ? 'text-emerald-800' : 'text-amber-800'}`}>
                  {inspectionClosed ? 'Inspection closed for review' : 'Inspection still open'}
                </p>
                <p className={`text-xs mt-1 leading-relaxed ${inspectionClosed ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {inspectionClosed
                    ? 'You can preview the PDF, reopen to make edits, or finalize and file this inspection internally. It will not appear in the customer portal until you publish it from Report History.'
                    : 'Close the inspection when you are done entering findings. Closing does not send anything to the customer; it just moves this inspection into review mode.'}
                </p>
              </div>
              {inspectionClosed ? (
                <button
                  onClick={() => updateInspectionClosed(false)}
                  className="text-xs font-semibold border border-emerald-200 text-emerald-700 bg-white px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors flex-shrink-0"
                >
                  Reopen Inspection
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (roomsWithData.length === 0) {
                      alert('There are no findings or photos to close yet. Run the inspection first.');
                      return;
                    }
                    updateInspectionClosed(true);
                  }}
                  className="text-xs font-semibold bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors flex-shrink-0"
                >
                  Close Inspection for Review
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">Professional Summary</h3>
                <p className="text-xs text-slate-400 mt-0.5">Summary of findings, on-site work, follow-ups, and preventative value.</p>
              </div>
              {professionalSummary.urgent.length > 0 && (
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-600">Urgent Items Included</span>
              )}
            </div>
            <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
              <p>{professionalSummary.intro}</p>
              {professionalSummary.urgent.length > 0 ? (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3 text-red-800">
                  <p className="text-xs font-bold uppercase tracking-wide text-red-700 mb-1">Urgent Priority Items</p>
                  <p className="font-medium">{professionalSummary.urgentText}</p>
                  <ul className="mt-2 space-y-1 list-disc list-inside text-sm">
                    {professionalSummary.urgent.slice(0, 5).map(item => (
                      <li key={item.id}><span className="font-semibold">{item.room}:</span> {item.title}{item.description ? ` — ${item.description}` : ''}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p>{professionalSummary.urgentText}</p>
              )}
              <p>{professionalSummary.fixedText}</p>
              <p>{professionalSummary.followUpText}</p>
              <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-green-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-1">Potential Cost Savings / Preventative Value</p>
                <p>{professionalSummary.savingsText}</p>
                <ul className="mt-2 space-y-1 list-disc list-inside text-sm">
                  {professionalSummary.savingsDetails.map(detail => <li key={detail}>{detail}</li>)}
                </ul>
              </div>
            </div>
          </div>

          {/* Room sections */}
          {roomsWithData.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <p className="text-slate-400 text-sm">No findings or photos yet. Run an inspection first.</p>
            </div>
          )}

          {roomsWithData.map(room => {
            const roomFindings = (customer.findings[room] || []).filter(f => f.status !== 'Pass');
            const roomPhotos = customer.photos[room] || [];
            const roomLevelPhotos = roomPhotos.filter(photo => !isItemPhoto(photo));
            const allRoomFindings = customer.findings[room] || [];
            const checkedCount = allRoomFindings.length;
            const passFindings = allRoomFindings.filter(f => f.status === 'Pass');
            const passCount = allRoomFindings.filter(f => f.status === 'Pass').length;
            const hasUrgent = roomFindings.some((f: Finding) => f.status === 'Urgent');
            const openIssueCount = roomFindings.filter((f: Finding) => f.status !== 'Fixed On Site').length;
            const fixedCount = roomFindings.filter((f: Finding) => f.status === 'Fixed On Site').length;

            return (
              <div key={room} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{getRoomIcon(room)}</span>
                    <div>
                      <h3 className="font-semibold text-slate-800">{room}</h3>
                      <p className="text-xs text-slate-400">
                        {checkedCount} checked · {passCount} pass · {fixedCount} fixed · {openIssueCount} open
                      </p>
                    </div>
                  </div>
                  {hasUrgent ? (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>Urgent</span>
                  ) : openIssueCount > 0 ? (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>Has Issues</span>
                  ) : (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>Clear</span>
                  )}
                </div>

                <div className="p-5 space-y-4">
                  {/* Photos */}
                  {roomLevelPhotos.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Image size={13} className="text-slate-400" />
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Room Photos ({roomLevelPhotos.length})</p>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {roomLevelPhotos.map(photo => (
                          <div key={photo.id}>
                            <img src={photo.url} alt={photo.caption} className="w-full h-20 object-cover rounded-lg" />
                            <p className="text-xs text-slate-400 truncate mt-1">{photo.caption}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Findings */}
                  {roomFindings.map((f: Finding) => {
                    const col = STATUS_COLORS[f.status] || STATUS_COLORS['Monitor'];
                    return (
                      <div key={f.id} className="border-l-4 rounded-r-xl overflow-hidden" style={{ borderLeftColor: col.border }}>
                        <div className="pl-4 pr-4 py-3 bg-slate-50">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-semibold text-slate-800 text-sm">{f.title}</p>
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: col.bg, color: col.text }}
                            >
                              {f.status}
                            </span>
                          </div>
                          {f.description && (
                            <div className="bg-slate-100 rounded-lg px-3 py-2 mb-2">
                              <p className="text-xs text-slate-500 font-medium mb-0.5">Observed</p>
                              <p className="text-sm text-slate-700">{f.description}</p>
                            </div>
                          )}
                          {f.action && (
                            <p className="text-sm text-blue-600 font-medium">{f.status === 'Fixed On Site' ? '✓ ' : '→ '}{f.action}</p>
                          )}
                          {f.due && (
                            <p className="text-xs text-slate-400 mt-1">Follow-up: {f.due}</p>
                          )}
                          {photosForItem(roomPhotos, f).length > 0 && (
                            <div className="grid grid-cols-4 gap-2 mt-3">
                              {photosForItem(roomPhotos, f).map(photo => (
                                <img key={photo.id} src={photo.url} alt={f.title} className="w-full h-20 object-cover rounded-lg" />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {passFindings.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Passed Items</p>
                      {passFindings.map((f: Finding) => {
                        const col = STATUS_COLORS[f.status] || STATUS_COLORS['Monitor'];
                        const itemPhotos = photosForItem(roomPhotos, f);
                        return (
                          <div key={f.id} className="border-l-4 rounded-r-xl overflow-hidden mb-3" style={{ borderLeftColor: col.border }}>
                            <div className="pl-4 pr-4 py-3 bg-slate-50">
                              <div className="flex items-center justify-between mb-2">
                                <p className="font-semibold text-slate-800 text-sm">{f.title}</p>
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: col.bg, color: col.text }}>{f.status}</span>
                              </div>
                              {f.description && (
                                <div className="bg-slate-100 rounded-lg px-3 py-2 mb-2">
                                  <p className="text-xs text-slate-500 font-medium mb-0.5">Observed</p>
                                  <p className="text-sm text-slate-700">{f.description}</p>
                                </div>
                              )}
                              {f.action && <p className="text-sm text-blue-600 font-medium">→ {f.action}</p>}
                              {f.due && <p className="text-xs text-slate-400 mt-1">Follow-up: {f.due}</p>}
                              {itemPhotos.length > 0 && (
                                <div className="grid grid-cols-4 gap-2 mt-3">
                                  {itemPhotos.map(photo => (
                                    <img key={photo.id} src={photo.url} alt={f.title} className="w-full h-20 object-cover rounded-lg" />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 border-l border-slate-200 bg-white overflow-y-auto p-4 space-y-4">
        <div>
          <h3 className="font-semibold text-slate-800 text-sm mb-3">Room Summary</h3>
          <div className="space-y-2">
            {customer.rooms.map(room => {
              const roomIssues = (customer.findings[room] || []).filter(f => f.status !== 'Pass' && f.status !== 'Fixed On Site');
              const roomFixed = (customer.findings[room] || []).filter(f => f.status === 'Fixed On Site').length;
              const photoCount = (customer.photos[room] || []).filter(photo => !isItemPhoto(photo)).length;
              const urgentInRoom = roomIssues.filter(f => f.status === 'Urgent').length;
              return (
                <div key={room} className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-50">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{room}</p>
                    {photoCount > 0 && (
                      <p className="text-xs text-slate-400">{photoCount} photo{photoCount !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                  {roomIssues.length > 0 ? (
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: urgentInRoom > 0 ? '#fee2e2' : '#fef3c7',
                        color: urgentInRoom > 0 ? '#dc2626' : '#d97706',
                      }}
                    >
                      {roomIssues.length}
                    </span>
                  ) : roomFixed > 0 ? (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#ccfbf1', color: '#0f766e' }}>{roomFixed} fixed</span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-100">
          <button
            onClick={() => setShowSendModal(true)}
            className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <Send size={14} /> Send to Customer
          </button>

          <button
            onClick={() => { void handleFinalizeReport(); }}
            disabled={finalizingReport || roomsWithData.length === 0 || !inspectionClosed}
            className="w-full bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CheckCircle size={14} />
            {finalizingReport ? 'Finalizing Report...' : 'Finalize & File Inspection'}
          </button>

          <p className="text-[11px] leading-relaxed text-slate-400 px-1">
            Finalize saves this report internally and clears the inspection. Publish later from Customer → Report History when ready.
          </p>

          <button
            onClick={() => { void handleExportPdf(); }}
            disabled={exportingPdf || !inspectionClosed}
            className="w-full border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            {exportingPdf ? 'Generating Preview...' : inspectionClosed ? 'Download Preview PDF' : 'Close to Preview PDF'}
          </button>

          <button
            onClick={() => setShowInvoiceModal(true)}
            className="w-full flex items-center justify-center gap-2 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
            style={{ backgroundColor: '#16a34a' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#15803d')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#16a34a')}
          >
            <FileText size={14} /> Create Invoice
          </button>

          <button className="w-full border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors">
            Schedule Next Visit
          </button>
        </div>
      </div>

      {showSendModal && <SendReportModal customer={customer} onClose={() => setShowSendModal(false)} />}
      {showInvoiceModal && customer && (
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
