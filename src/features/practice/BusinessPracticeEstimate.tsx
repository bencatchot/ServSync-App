import { useEffect, useRef, useState } from 'react';
import type { ContractorPriceBookItem, EstimateTemplate } from '../../types';
import type { SharedDraftComposerDraft } from '../drafts/draftComposerTypes';
import { ContractorDraftComposer } from '../drafts/ContractorDraftComposer';
import { blankPracticeDraft } from './exampleDraft';
import { sanitizeSnapshot, validatePracticePreview, type PracticeSnapshot } from './contracts';
import { emptyBusinessPractice, practiceRealDraft, readBusinessPractice, writeBusinessPractice, type BusinessPracticeSession, type PracticeHandoffRef } from './businessPractice';

export type BusinessPracticeProps = {
  identity: string;
  businessName: string;
  loadSetup: () => Promise<PracticeSnapshot>;
  canStage: boolean;
  stageDraft: (draft: SharedDraftComposerDraft, handoff: PracticeHandoffRef) => void;
};
const button = 'min-h-11 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50';

export function BusinessPracticeEstimate({ identity, businessName, loadSetup, canStage, stageDraft }: BusinessPracticeProps) {
  const key = `servsync.businessPractice.v1:${identity}`;
  const [initial] = useState(() => { try { return { value: readBusinessPractice(key), error: '' }; } catch { return { value: emptyBusinessPractice(), error: 'Stored Practice work could not be read. It has not been overwritten; this session is read-only.' }; } });
  const [session, setSession] = useState(initial.value);
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const confirmationReady = useRef(false);
  const live = useRef(true);
  const [candidate, setCandidate] = useState<PracticeSnapshot | null>(null);
  const [review, setReview] = useState(false);
  const [destination, setDestination] = useState('');
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const record = session.records.find(r => r.id === session.activeId);
  const setup = session.setups.find(s => s.version === record?.setupVersion);
  const latest = session.setups[session.setups.length - 1];
  function remember(next: BusinessPracticeSession) {
    if (initial.error) return false;
    setSession(next);
    try { setSession(writeBusinessPractice(key, next)); setError(''); return true; } catch { setError('Changes remain open but could not be saved in this browser tab. Keep this page open; transfer requires working tab storage.'); return false; }
  }
  async function refresh() {
    if (lock.current || initial.error) return;
    lock.current = true; setBusy(true); setError(''); setReview(false);
    try { const next = sanitizeSnapshot(await loadSetup()); if (live.current) setCandidate(next); }
    catch (e) { if (live.current) setError(e instanceof Error ? e.message : 'Setup could not be read.'); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  function acceptSetup() {
    if (!candidate || session.setups.length >= 10) return;
    const version = (latest?.version || 0) + 1;
    remember({ ...session, setups: [...session.setups, { version, capturedAt: new Date().toISOString(), snapshot: candidate }] });
    setCandidate(null); setNotice(`Setup v${version} is ready for new practice estimates. Existing drafts and their prices are unchanged.`);
  }
  function start() {
    if (!latest || session.records.length >= 20) return;
    const id = crypto.randomUUID();
    remember({ ...session, records: [...session.records, { id, setupVersion: latest.version, draft: blankPracticeDraft(latest.snapshot.business.laborRate), handedOff: false }], activeId: id });
    setReview(false); setNotice('');
  }
  function reviewTransfer() {
    if (!record) return;
    try {
      validatePracticePreview(record.draft);
      const current = readBusinessPractice(key);
      const saved = current.records.find(r => r.id === record.id);
      if (saved?.handedOff) {
        setSession(current);
        if (saved.handoff?.phase !== 'prepared') {
          setError(saved.handoff?.phase === 'saved' ? 'This copy was saved in Work. Open saved Drafts there; no second Draft will be created from this Practice record.' : 'A save may have completed. Check Drafts in Work; this handoff cannot be replayed safely.');
          return;
        }
      }
      confirmationReady.current = true;
      setDestination(''); setReview(true); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Check the practice inputs.'); }
  }
  function confirm() {
    if (lock.current || !confirmationReady.current || !record || !review || destination !== identity || !canStage || initial.error) return;
    lock.current = true;
    confirmationReady.current = false;
    try {
      const current = readBusinessPractice(key);
      const saved = current.records.find(r => r.id === record.id);
      if (saved?.handedOff && saved.handoff?.phase !== 'prepared') throw new Error('Check Drafts in Work. This handoff cannot safely be replayed.');
      const draft = saved?.handoff?.draft || practiceRealDraft(record.draft);
      const next = { ...session, records: session.records.map(r => r.id === record.id ? { ...r, handedOff: true, handoff: { phase: 'prepared' as const, draft } } : r) };
      // Persist the original clean copy before navigation. Reopening this copy is
      // safe only until the canonical editor fences its first Save request.
      setSession(writeBusinessPractice(key, next)); setReview(false);
      stageDraft(draft, { storageKey: key, recordId: record.id });
      setNotice('Opened the unsaved real Draft. Choose a real customer and Save Draft in Work. Nothing was sent.');
    } catch (e) { setError(e instanceof Error ? e.message : 'The new Draft could not be opened. You can review the same unsaved copy again.'); }
    finally { lock.current = false; }
  }
  const prices = setup?.snapshot.prices.map(p => ({ ...p, contractor_id: '', internal_notes: '', trade: '', category: '', subcategory: null, taxable: false, sku: null, source: null, active: true, archived_at: null, created_at: '', updated_at: '' })) as ContractorPriceBookItem[] | undefined;
  const templates = setup?.snapshot.templates.map(t => ({ ...t, contractor_id: '', trade: '', notes: '', terms: '', created_at: '', updated_at: '' })) as EstimateTemplate[] | undefined;
  return <section aria-label="Business practice estimates" className="space-y-4 rounded-2xl border border-blue-200 bg-white p-4 md:p-6">
    <h2 className="text-xl font-bold">Practice with my pricing and templates</h2>
    <p className="text-sm text-slate-600">Fictional customer and property. Only your business name, labor rate, selling prices and estimate templates are copied. Costs, private notes and real customer records are excluded. Practice is saved only in this browser tab, not across devices.</p>
    <button type="button" className={button} disabled={busy || Boolean(initial.error) || session.setups.length >= 10} onClick={() => void refresh()}>{busy ? 'Reading setup…' : latest ? 'Review refreshed business setup' : 'Read my business setup'}</button>
    {session.setups.length >= 10 && <p>This tab has reached its ten-snapshot limit. Existing work remains available.</p>}
    {candidate && <section aria-label="Review setup snapshot" className="space-y-3 rounded-xl bg-amber-50 p-4"><h3 className="font-bold">Review snapshot v{(latest?.version || 0) + 1}</h3><p>{candidate.business.name}: {candidate.prices.length} active prices and {candidate.templates.length} templates. This read is a point-in-time copy, not live synchronization. Existing estimates keep their original snapshot and entered prices.</p><p>New practice estimates will use this setup. No existing price, template or customer record will change.</p><button type="button" className={button} onClick={acceptSetup}>Use this setup for new practice</button><button type="button" className={button} onClick={() => setCandidate(null)}>Cancel refresh</button></section>}
    {error && <p role="alert" className="text-red-700">{error}</p>}{notice && <p role="status" className="text-blue-800">{notice}</p>}
    {latest && <div className="space-y-2"><p>Latest setup: v{latest.version}, copied {new Date(latest.capturedAt).toLocaleString()}. Prices may have changed since this copy.</p><button type="button" className={button} disabled={Boolean(initial.error) || session.records.length >= 20} onClick={start}>Start new practice estimate</button><label className="block text-sm">Resume practice estimate<select className="ml-2 min-h-11 max-w-full rounded border p-2" value={session.activeId || ''} onChange={e => { remember({ ...session, activeId: e.target.value || null }); setReview(false); }}><option value="">Choose saved practice</option>{session.records.map(r => <option key={r.id} value={r.id}>{r.draft.title || 'Untitled practice'} · setup v{r.setupVersion}{r.handedOff ? ' · handed off' : ''}</option>)}</select></label></div>}
    {record && setup && <div className="space-y-4">
      <p className="rounded-xl bg-amber-100 p-3 font-semibold">PRACTICE — NOT A LIVE DOCUMENT. This draft uses setup v{setup.version} ({new Date(setup.capturedAt).toLocaleString()}). {latest?.version !== setup.version && `Newer setup v${latest?.version} is available for new practice estimates; this draft keeps its original prices and templates.`}</p>
      <ContractorDraftComposer key={record.id} draft={record.draft} estimatePracticeOnly practiceMode customerOptions={[]} canSave={!initial.error} saving={false} interactionDisabled={Boolean(initial.error)} priceBookItems={prices} priceBookLoadState="ready" canViewPriceBook savedWorkTemplates={templates} previewBusinessName={setup.snapshot.business.name} onChange={draft => { remember({ ...session, records: session.records.map(r => r.id === record.id ? { ...r, draft } : r) }); setReview(false); }} onSave={() => { try { validatePracticePreview(record.draft); if (remember(session)) setNotice('Practice saved in this tab.'); } catch (e) { setError(e instanceof Error ? e.message : 'Check the practice inputs.'); } }} onBack={() => { remember({ ...session, activeId: null }); setReview(false); }} onRemovePersistedLine={() => undefined} />
      <button type="button" className={button} disabled={!canStage || Boolean(initial.error)} onClick={reviewTransfer}>{record.handedOff ? 'Review previous handoff' : 'Review transfer to a new real Draft'}</button>
      {!canStage && <p>To open real work, finish or close any current Draft/editor in Work and use an account with existing Draft access.</p>}
      {review && <section aria-label="Confirm practice transfer" className="space-y-3 rounded-xl border border-amber-300 p-4"><h3 className="font-bold">{record.handedOff ? "Reopen the original unsaved copy?" : "Open one new, unsaved real Draft?"}</h3>{record.handedOff && <p>Changes made in Work before saving are not stored in Practice. This reopens the original transferred copy, with its original prices, not any later Practice edits.</p>}<p>This copies scope and explicit prices into a NEW Draft editor. Your Practice estimate stays unchanged. It does not save, create an Estimate, send or charge anything. No fictional customer, property, private notes or source links are copied. Choose a real customer and explicitly Save Draft in Work. Review current pricing, tax and terms before sending.</p><label className="block">Destination<select aria-label="Destination" className="mt-1 block min-h-11 w-full rounded border p-2" value={destination} onChange={e => setDestination(e.target.value)}><option value="">Choose destination</option><option value={identity}>New unsaved Estimate Draft — {businessName}</option></select></label><button type="button" className={button} disabled={destination !== identity || !canStage} onClick={confirm}>Confirm and open new Draft</button><button type="button" className={button} onClick={() => setReview(false)}>Cancel transfer</button></section>}
      <p className="text-xs text-slate-500">Before the first real save, you can review and reopen the original unsaved copy in this tab. Once a save starts, the handoff is locked against replay; check Work if its outcome is uncertain. Persistent/cross-device transfer receipts are not available. Finish the real Draft in Work before opening another.</p>
    </div>}
  </section>;
}
