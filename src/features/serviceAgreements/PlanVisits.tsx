import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Inspection, ServiceAgreement } from '../../types';
import { assertPlanActor, usePlanVisits } from './usePlanVisits';
import { eligibleVisitJobs, localToday, visitAttention, visitCompleted, visitProgress, visitStatus, type PlanVisit } from './visits';

const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50';
const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';
type Props = {
  client: SupabaseClient;
  actorId: string;
  contractorId: string;
  jobs: Inspection[];
  onOpenJob: (job: Inspection) => void;
  onStartDraft: (plan: ServiceAgreement) => void;
  disabledReason?: string;
  planLabel: (plan: ServiceAgreement) => string;
};

function VisitEditor({ client, actorId, visit, jobs, active, onOpenJob, onSaved }: {
  client: SupabaseClient; actorId: string; visit: PlanVisit; jobs: Inspection[]; active: boolean;
  onOpenJob: Props['onOpenJob']; onSaved: () => void;
}) {
  const [due, setDue] = useState(visit.due_on ?? '');
  const [jobId, setJobId] = useState(visit.job_id ?? '');
  const [shared, setShared] = useState(visit.shared_with_homeowner);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirmCorrection, setConfirmCorrection] = useState(false);
  const originalVersion = useRef(visit.version);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!dirty) {
      setDue(visit.due_on ?? ''); setJobId(visit.job_id ?? ''); setShared(visit.shared_with_homeowner);
      originalVersion.current = visit.version; setConfirmCorrection(false);
    }
  }, [visit, dirty]);
  const job = jobs.find(item => item.id === visit.job_id);
  const attention = visitAttention(visit, localToday());
  return <form className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label={`Visit ${visit.ordinal}`} onSubmit={async event => {
    event.preventDefault();
    if (pending.current || !active) return;
    pending.current = true; setBusy(true); setError('');
    try {
      await assertPlanActor(client, actorId);
      const { error: failure } = await client.rpc('servsync_update_plan_visit', {
        p_visit_id: visit.id, p_expected_version: originalVersion.current, p_due_on: due || null, p_job_id: jobId || null, p_shared: shared, p_confirm_correction: confirmCorrection,
      });
      if (failure) throw failure;
      if (alive.current) { setDirty(false); onSaved(); }
    } catch (failure) {
      if (alive.current) setError(failure && typeof failure === 'object' && 'message' in failure ? String(failure.message) : 'Visit could not be saved. Reload to check before trying again.');
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  }}>
    <div><h4 className="font-semibold">Visit {visit.ordinal}</h4><p className="text-sm">{visitStatus(visit)}{attention ? ` · ${attention}` : ''}</p></div>
    <fieldset disabled={busy || !active} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Due date<input aria-label={`Visit ${visit.ordinal} due date`} type="date" className={input} value={due} onChange={event => { setDirty(true); setDue(event.target.value); }} /></label>
      <label className="text-sm font-medium">Linked Job<select aria-label={`Visit ${visit.ordinal} linked Job`} className={input} disabled={visitCompleted(visit) && !confirmCorrection} value={jobId} onChange={event => { setDirty(true); setJobId(event.target.value); }}>
        <option value="">Choose a Job for this property</option>
        {jobs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={shared} onChange={event => { setDirty(true); setShared(event.target.checked); }} className="mt-1" />Share this visit’s due date and progress with the connected homeowner. This does not share the Job report or change property permissions.</label>
      {visitCompleted(visit) && <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={confirmCorrection} onChange={event => { setDirty(true); setConfirmCorrection(event.target.checked); }} />Correct this completed visit’s Job link. Progress will follow the replacement Job; the original Job, report and link-change history are preserved.</label>}
    </fieldset>
    <p className="text-xs text-slate-600">A due date is a target, not an appointment. Use the linked Job and Calendar to manage work and appointments. Cancellation does not complete a visit; reopening supported work updates progress.</p>
    {dirty && visit.version !== originalVersion.current && <p role="alert">This visit changed elsewhere. Your edits are kept, but cannot overwrite the newer version. Discard edits to load it.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {active && <button type="submit" className={button} disabled={busy}>{busy ? 'Saving…' : 'Save visit'}</button>}
      {dirty && <button type="button" className={button} disabled={busy} onClick={() => { setDirty(false); setError(''); }}>Discard edits</button>}
      {!active && visit.shared_with_homeowner && <button type="button" className={button} disabled={busy} onClick={async () => {
        if (pending.current) return;
        pending.current = true; setBusy(true);
        try { await assertPlanActor(client, actorId); const result = await client.rpc('servsync_update_plan_visit', { p_visit_id: visit.id, p_expected_version: visit.version, p_due_on: visit.due_on, p_job_id: visit.job_id, p_shared: false }); if (result.error) throw result.error; if (alive.current) onSaved(); }
        catch { if (alive.current) setError('Sharing could not be changed. Reload and try again.'); }
        finally { pending.current = false; if (alive.current) setBusy(false); }
      }}>Stop sharing progress</button>}
      {job && <button type="button" className={button} onClick={() => onOpenJob(job)}>Open Job{visit.report_ready ? ' / report' : ' / schedule'}</button>}
    </div>
  </form>;
}

function AcceptedPlan({ plan, visits, client, actorId, jobs, onOpenJob, onStartDraft, disabledReason, planLabel, reload }: Props & {
  plan: ServiceAgreement; visits: PlanVisit[]; reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const active = plan.status === 'active' && !disabledReason;
  const eligible = eligibleVisitJobs(plan, jobs);
  const setup = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    const key = `servsync.plan-visit-action:${actorId}:${plan.id}`;
    try {
      await assertPlanActor(client, actorId);
      const actionId = sessionStorage.getItem(key) ?? crypto.randomUUID();
      sessionStorage.setItem(key, actionId);
      const { error: failure } = await client.rpc('servsync_setup_plan_visits', { p_agreement_id: plan.id, p_action_id: actionId });
      if (failure) throw failure;
      if (alive.current) { sessionStorage.removeItem(key); reload(); }
    } catch (failure) {
      if (alive.current) setError(failure && typeof failure === 'object' && 'message' in failure ? String(failure.message) : 'Visit setup could not be confirmed. Retry to check the same action.');
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  return <article className="space-y-3 rounded-xl border border-slate-300 bg-white p-4">
    <div><h3 className="text-lg font-bold">{plan.title}</h3><p className="text-sm">{plan.status} · {visitProgress(plan, visits)}</p></div>
    <p className="text-sm font-medium text-slate-600">{planLabel(plan)}</p>
    <p className="text-xs text-slate-600">Accepted price, terms and visit allowance stay unchanged. Dates and Job links are managed below; nothing is scheduled or sent automatically.</p>
    {disabledReason && <p role="status">{disabledReason}</p>}
    {plan.included_visit_count === 0 && <p className="text-sm">This accepted plan includes no visits.</p>}
    {active && (plan.included_visit_count === null || (!visits.length && plan.included_visit_count > 0)) && <button className={button} disabled={busy} onClick={() => void setup()}>{busy ? 'Setting up…' : plan.included_visit_count === null ? 'Add a tracked visit' : 'Set up visits'}</button>}
    {plan.included_visit_count === null && <p className="text-xs text-slate-600">Adding a tracked visit does not define or increase the accepted allowance.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {visits.map(visit => <VisitEditor key={visit.id} client={client} actorId={actorId} visit={visit} jobs={eligible.filter(job => job.id === visit.job_id || !visits.some(other => other.job_id === job.id))} active={active} onOpenJob={onOpenJob} onSaved={reload} />)}
    {active && visits.length > 0 && <div className="space-y-2"><button className={button} onClick={() => onStartDraft(plan)}>Start New Draft for this property</button><p className="text-xs text-slate-600">Create the Job through the existing Draft workflow, then return here to link it to a visit. Each Job can count toward only one visit.</p></div>}
  </article>;
}

export function ServicePlanVisits(props: Props) {
  const { items, loading, error, reload } = usePlanVisits(props.client, props.actorId, props.contractorId);
  return <section className="space-y-4" aria-label="Accepted plan visits">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Accepted plan visits</h2><button className={button} onClick={() => void reload()}>Reload visits</button></div>
    {loading && <p role="status">Loading visits…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !items.length && <p>No accepted plans yet.</p>}
    {items.map(({ plan, visits }) => <AcceptedPlan key={plan.id} {...props} plan={plan} visits={visits} reload={() => { window.dispatchEvent(new Event('servsync:plan-visits-changed')); }} />)}
  </section>;
}

export function HomeownerPlanVisits({ client, actorId, plan }: { client: SupabaseClient; actorId: string; plan: ServiceAgreement }) {
  const { items, loading, error, reload } = usePlanVisits(client, actorId, undefined, plan);
  const visits = items[0]?.visits ?? [];
  return <section className="space-y-2 rounded-xl border border-slate-200 p-3" aria-label="Shared plan progress">
    <h3 className="font-semibold">Shared visit progress</h3>
    {loading ? <p>Loading shared visits…</p> : error ? <p role="alert">{error}</p> : <>
      <p className="text-sm">{visitProgress(plan, visits, true)}</p>
      {!visits.length && <p className="text-sm">Your contractor has not shared visit progress here.</p>}
      {visits.map(visit => <p className="text-sm" key={visit.id}>Visit {visit.ordinal} · {visitStatus(visit)} · {visit.due_on ? `Due ${visit.due_on}` : 'Due date not set'}</p>)}
    </>}
    <button className={button} onClick={() => void reload()}>Reload progress</button>
  </section>;
}

export function ServicePlanVisitAttention({ client, actorId, contractorId, onOpenPlans, planLabel }: {
  client: SupabaseClient; actorId: string; contractorId: string; onOpenPlans: () => void; planLabel: Props['planLabel'];
}) {
  const { items, error, loading } = usePlanVisits(client, actorId, contractorId);
  const attention = items.filter(({ plan }) => plan.status === 'active').flatMap(({ plan, visits }) => visits
    .filter(visit => visitAttention(visit, localToday())).map(visit => ({ plan, visit })));
  if (!attention.length && !error) return null;
  return <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="Plan visits needing attention">
    <h3 className="font-bold">Service Plan visits</h3>
    {error ? <p className="text-sm">Visit attention could not be checked. Open Service Plans to retry.</p> : !loading && attention.map(({ plan, visit }) => <p className="text-sm" key={visit.id}>{plan.title} · {planLabel(plan)} · Visit {visit.ordinal} · {visitAttention(visit, localToday())} · Due {visit.due_on}</p>)}
    <button className={button} onClick={onOpenPlans}>Review plan visits</button>
  </section>;
}
