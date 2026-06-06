import { useMemo, useState } from 'react';
import { CalendarDays, User, CheckCircle, ArrowRight, RotateCw, Plus, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Appointment, Customer, Page, TimeWindow, VisitType } from '../types';

interface CalendarProps {
  customers: Customer[];
  appointments: Appointment[];
  onEnsureRecommendations: () => Promise<void>;
  onUpdateAppointment: (appointment: Appointment) => Promise<void>;
  onCreateAppointment: (appointment: Appointment) => Promise<void>;
  onSelectCustomer: (customerId: string, page: Page) => void;
}

const STATUS_STYLE: Record<string, string> = {
  Recommended: 'bg-amber-100 text-amber-700 border-amber-200',
  Confirmed: 'bg-green-100 text-green-700 border-green-200',
  'Customer Requested': 'bg-blue-100 text-blue-700 border-blue-200',
  Cancelled: 'bg-red-100 text-red-700 border-red-200',
  Completed: 'bg-slate-100 text-slate-600 border-slate-200',
};

const TIME_SLOTS: Record<TimeWindow, string[]> = {
  Morning: ['08:00', '09:30', '11:00'],
  Midday: ['12:00', '13:30'],
  Afternoon: ['15:00', '16:30'],
  Custom: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'],
};

function dateOnly(value: string) {
  if (!value) return new Date().toISOString().split('T')[0];
  return value.includes('T') ? value.split('T')[0] : value;
}
function combine(date: string, time: string) { return new Date(`${date}T${time}:00`).toISOString(); }
function addMinutes(iso: string, minutes: number) { const d = new Date(iso); d.setMinutes(d.getMinutes() + minutes); return d.toISOString(); }
function formatDate(value: string) { if (!value) return 'Not set'; return new Date(value.includes('T') ? value : `${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function formatTime(value: string) { if (!value) return 'Time TBD'; return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function sameDate(a: string, b: string) { return dateOnly(a) === dateOnly(b); }
function appointmentDate(appt: Appointment) { return appt.scheduledStart || appt.recommendedDate; }
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) { return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd); }

function blankAppointment(date: string): Appointment {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), title: 'Blocked time', status: 'Confirmed', visitType: 'Blocked', recommendedDate: date,
    scheduledStart: combine(date, '09:00'), scheduledEnd: addMinutes(combine(date, '09:00'), 60), durationMinutes: 60,
    timeWindow: 'Custom', internalNotes: '', customerNotes: '', customerRequestNotes: '', source: 'Manual', customerVisible: false,
    emailNotificationStatus: 'not_configured', smsNotificationStatus: 'not_configured', icsUid: crypto.randomUUID(), syncStatus: 'not_synced', createdAt: now, updatedAt: now,
  };
}

export default function Calendar({ customers, appointments, onEnsureRecommendations, onUpdateAppointment, onCreateAppointment, onSelectCustomer }: CalendarProps) {
  const [cursor, setCursor] = useState(monthStart(new Date()));
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [date, setDate] = useState('');
  const [window, setWindow] = useState<TimeWindow>('Morning');
  const [time, setTime] = useState('08:00');
  const [title, setTitle] = useState('');
  const [visitType, setVisitType] = useState<VisitType>('Inspection');
  const [customerId, setCustomerId] = useState('');
  const [customerNotes, setCustomerNotes] = useState('Routine home maintenance inspection.');
  const [internalNotes, setInternalNotes] = useState('');

  const openEdit = (appointment: Appointment, creating = false) => {
    setEditing(appointment); setIsNew(creating);
    setDate(dateOnly(appointment.scheduledStart || appointment.recommendedDate));
    setWindow(appointment.timeWindow || 'Morning');
    setTime(appointment.scheduledStart ? new Date(appointment.scheduledStart).toTimeString().slice(0, 5) : TIME_SLOTS[appointment.timeWindow || 'Morning'][0]);
    setTitle(appointment.title || 'Appointment'); setVisitType(appointment.visitType); setCustomerId(appointment.customerId || '');
    setCustomerNotes(appointment.customerNotes || 'Routine home maintenance inspection.'); setInternalNotes(appointment.internalNotes || '');
  };

  const proposedStart = date ? combine(date, time) : '';
  const proposedEnd = proposedStart ? addMinutes(proposedStart, editing?.durationMinutes || 60) : '';
  const conflicts = editing && proposedStart ? appointments.filter(appt => appt.id !== editing.id && ['Confirmed', 'Customer Requested'].includes(appt.status) && appt.scheduledStart && appt.scheduledEnd && overlaps(proposedStart, proposedEnd, appt.scheduledStart, appt.scheduledEnd)) : [];
  const dayConfirmedCount = editing && date ? appointments.filter(appt => appt.id !== editing.id && ['Confirmed', 'Customer Requested'].includes(appt.status) && sameDate(appointmentDate(appt), date)).length : 0;

  const save = async (status: Appointment['status']) => {
    if (!editing) return;
    if (conflicts.length > 0 && status === 'Confirmed' && !window.confirm('This time overlaps another appointment. Save anyway?')) return;
    const start = combine(date, time);
    const payload: Appointment = {
      ...editing, customerId: customerId || undefined, title, visitType, status, recommendedDate: date, scheduledStart: start,
      scheduledEnd: addMinutes(start, editing.durationMinutes || 60), timeWindow: window,
      customerVisible: !!customerId && (status === 'Confirmed' || status === 'Customer Requested' || status === 'Cancelled'), customerNotes, internalNotes, updatedAt: new Date().toISOString(),
    };
    if (isNew) await onCreateAppointment(payload); else await onUpdateAppointment(payload);
    setEditing(null); setIsNew(false);
  };

  const calendarDays = useMemo(() => {
    const first = monthStart(cursor);
    const start = new Date(first); start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [cursor]);

  const visible = [...appointments].sort((a, b) => new Date(appointmentDate(a)).getTime() - new Date(appointmentDate(b)).getTime());
  const selectedAppointments = visible.filter(a => sameDate(appointmentDate(a), selectedDate));
  const active = visible.filter(a => a.status !== 'Completed');

  return (
    <div className="h-full overflow-y-auto p-6 bg-slate-50">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div><h1 className="text-xl font-bold text-slate-800">Calendar</h1><p className="text-sm text-slate-500">Month view, recommendations, confirmed visits, and manual blocked time.</p></div>
          <div className="flex gap-2"><button onClick={() => openEdit(blankAppointment(selectedDate), true)} className="flex items-center gap-2 bg-emerald-600 text-white rounded-xl px-4 py-2 text-sm font-semibold"><Plus size={14}/> Manual</button><button onClick={() => { void onEnsureRecommendations(); }} className="flex items-center gap-2 bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-semibold"><RotateCw size={14}/> Refresh</button></div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="p-2 rounded-lg hover:bg-slate-50"><ChevronLeft size={18}/></button>
              <p className="font-bold text-slate-800">{cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="p-2 rounded-lg hover:bg-slate-50"><ChevronRight size={18}/></button>
            </div>
            <div className="grid grid-cols-7 border-b border-slate-100">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="px-2 py-2 text-xs font-bold text-slate-400 text-center">{d}</div>)}</div>
            <div className="grid grid-cols-7">
              {calendarDays.map(day => {
                const dayKey = day.toISOString().split('T')[0];
                const dayItems = visible.filter(a => sameDate(appointmentDate(a), dayKey));
                const muted = day.getMonth() !== cursor.getMonth();
                const selected = dayKey === selectedDate;
                return <button key={dayKey} onClick={() => setSelectedDate(dayKey)} className={`min-h-28 border-r border-b border-slate-100 p-2 text-left align-top ${selected ? 'bg-blue-50' : muted ? 'bg-slate-50/60' : 'bg-white hover:bg-slate-50'}`}>
                  <p className={`text-xs font-bold ${muted ? 'text-slate-300' : 'text-slate-600'}`}>{day.getDate()}</p>
                  <div className="mt-1 space-y-1">{dayItems.slice(0,3).map(appt => <div key={appt.id} className={`truncate rounded px-1.5 py-0.5 text-[10px] font-semibold border ${STATUS_STYLE[appt.status]}`}>{appt.status === 'Recommended' ? 'Rec' : appt.status === 'Confirmed' ? 'Conf' : appt.status}: {appt.title}</div>)}{dayItems.length > 3 && <p className="text-[10px] text-slate-400">+{dayItems.length - 3} more</p>}</div>
                </button>;
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-4"><p className="font-bold text-slate-800">{formatDate(selectedDate)}</p><p className="text-xs text-slate-400">{selectedAppointments.length} appointment/recommendation item(s)</p></div>
            {selectedAppointments.length === 0 && <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-400">No items for this day.</div>}
            {selectedAppointments.map(appt => {
              const customer = customers.find(c => c.id === appt.customerId);
              return <div key={appt.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2"><div><span className={`text-xs font-bold px-2 py-1 rounded-full border ${STATUS_STYLE[appt.status]}`}>{appt.status}</span><p className="font-semibold text-slate-800 mt-2">{customer?.name || appt.title}</p><p className="text-xs text-slate-500">{formatTime(appt.scheduledStart)} · {appt.visitType}</p></div><CalendarDays className="text-slate-300" size={20}/></div>
                {appt.customerRequestNotes && <p className="mt-3 text-xs bg-blue-50 border border-blue-100 text-blue-700 rounded-xl px-3 py-2">Customer note: {appt.customerRequestNotes}</p>}
                <div className="flex gap-2 flex-wrap mt-4"><button onClick={() => openEdit(appt)} className="text-xs font-semibold bg-blue-600 text-white rounded-lg px-3 py-2">{appt.status === 'Recommended' ? 'Confirm / Move' : 'Edit'}</button>{customer && <button onClick={() => onSelectCustomer(customer.id, 'customers')} className="text-xs font-semibold border border-slate-200 text-slate-600 rounded-lg px-3 py-2 flex items-center gap-1"><User size={12}/> Customer</button>}{customer && <button onClick={() => onSelectCustomer(customer.id, 'inspection')} className="text-xs font-semibold border border-emerald-200 text-emerald-700 rounded-lg px-3 py-2 flex items-center gap-1">Inspect <ArrowRight size={12}/></button>}</div>
              </div>;
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4"><p className="text-sm font-bold text-slate-800 mb-3">Upcoming / Needs Attention</p><div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{active.slice(0,8).map(appt => <div key={appt.id} className="border border-slate-100 rounded-xl p-3"><span className={`text-xs font-bold px-2 py-1 rounded-full border ${STATUS_STYLE[appt.status]}`}>{appt.status}</span><p className="text-sm font-semibold text-slate-800 mt-2">{customers.find(c => c.id === appt.customerId)?.name || appt.title}</p><p className="text-xs text-slate-400">{formatDate(appointmentDate(appt))} · {formatTime(appt.scheduledStart)}</p></div>)}</div></div>

        {editing && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">{isNew ? 'Manual Calendar Item' : 'Schedule Appointment'}</h2><button onClick={() => { setEditing(null); setIsNew(false); }} className="text-slate-400">×</button></div>
            <div><label className="text-xs font-semibold text-slate-500">Title</label><input value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" /></div>
            <div><label className="text-xs font-semibold text-slate-500">Customer (optional)</label><select value={customerId} onChange={e => setCustomerId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"><option value="">No customer / blocked time</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-2"><div><label className="text-xs font-semibold text-slate-500">Type</label><select value={visitType} onChange={e => setVisitType(e.target.value as VisitType)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"><option>Inspection</option><option>Follow-up</option><option>Urgent</option><option>Seasonal</option><option>Blocked</option><option>Other</option></select></div><div><label className="text-xs font-semibold text-slate-500">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" /></div></div>
            <div className="grid grid-cols-2 gap-2"><div><label className="text-xs font-semibold text-slate-500">Window</label><select value={window} onChange={e => { const w = e.target.value as TimeWindow; setWindow(w); setTime(TIME_SLOTS[w][0]); }} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"><option>Morning</option><option>Midday</option><option>Afternoon</option><option>Custom</option></select></div><div><label className="text-xs font-semibold text-slate-500">Start</label><select value={time} onChange={e => setTime(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">{TIME_SLOTS[window].map(t => <option key={t} value={t}>{t}</option>)}</select></div></div>
            {dayConfirmedCount >= 2 && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-3 py-2 flex gap-2"><AlertTriangle size={14}/> This date already has {dayConfirmedCount} confirmed/requested appointment(s). Consider another day.</p>}
            {conflicts.length > 0 && <p className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2">Time conflict with: {conflicts.map(c => c.title).join(', ')}</p>}
            <div><label className="text-xs font-semibold text-slate-500">Customer-visible note</label><textarea value={customerNotes} onChange={e => setCustomerNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" /></div>
            <div><label className="text-xs font-semibold text-slate-500">Internal note</label><textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" /></div>
            <div className="flex gap-2"><button onClick={() => { void save('Recommended'); }} className="flex-1 border border-slate-200 rounded-xl py-2 text-sm font-semibold">Move/Save Rec</button><button onClick={() => { void save('Confirmed'); }} className="flex-1 bg-green-600 text-white rounded-xl py-2 text-sm font-semibold flex items-center justify-center gap-1"><CheckCircle size={14}/> Confirm</button></div>
          </div></div>
        )}
      </div>
    </div>
  );
}
