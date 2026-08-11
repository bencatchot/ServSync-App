import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react';
import {
  MARKETING_PLAN_CONTENT_ROLES,
  MARKETING_PROFILE_CHANNELS,
  MARKETING_RECOMMENDATION_CONTRACT_VERSION,
  buildOwnerDirectedMarketingPlan,
  buildRecommendedMarketingPlan,
  type MarketingBusinessProfile,
  type MarketingPlan,
  type MarketingPlanCreateInput,
  type MarketingPlanContentRole,
  type MarketingPlanItem,
  type MarketingPlanningState,
  type MarketingProfileChannel,
} from './marketingPlanning';
import { MarketingDirectionsWorkspace } from './MarketingDirectionsWorkspace';
import type { MarketingDirection, MarketingDirectionsState } from './marketingDirections';

const inputClass = 'min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100';
const textareaClass = `${inputClass} min-h-24 resize-y`;

type ProfileDraft = Omit<MarketingBusinessProfile, 'audienceSegments' | 'serviceFocus' | 'secondaryGoals' | 'offers' | 'emphasizedTopics' | 'avoidedTopics'> & {
  audienceSegments: string;
  serviceFocus: string;
  secondaryGoals: string;
  offers: string;
  emphasizedTopics: string;
  avoidedTopics: string;
};

const joinList = (values: string[]) => values.join(', ');
const splitList = (value: string) => Array.from(new Set(value.split(',').map(item => item.trim()).filter(Boolean)));

function profileDraft(profile: MarketingBusinessProfile): ProfileDraft {
  return {
    ...profile,
    audienceSegments: joinList(profile.audienceSegments),
    serviceFocus: joinList(profile.serviceFocus),
    secondaryGoals: joinList(profile.secondaryGoals),
    offers: joinList(profile.offers),
    emphasizedTopics: joinList(profile.emphasizedTopics),
    avoidedTopics: joinList(profile.avoidedTopics),
  };
}

function savedProfile(draft: ProfileDraft): MarketingBusinessProfile {
  return {
    ...draft,
    audienceSegments: splitList(draft.audienceSegments),
    serviceFocus: splitList(draft.serviceFocus),
    secondaryGoals: splitList(draft.secondaryGoals),
    offers: splitList(draft.offers),
    emphasizedTopics: splitList(draft.emphasizedTopics),
    avoidedTopics: splitList(draft.avoidedTopics),
  };
}

function defaultPeriod() {
  const start = new Date();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 30);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function ProfileEditor({
  profile,
  saving,
  onSave,
}: {
  profile: MarketingBusinessProfile;
  saving: boolean;
  onSave: (profile: MarketingBusinessProfile) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => profileDraft(profile));
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setDraft(profileDraft(profile)), [profile]);

  const update = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
    setNotice(null);
    setDraft(current => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    try {
      await onSave(savedProfile(draft));
      setNotice('Marketing Profile saved.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'ServSync could not save the Marketing Profile.');
    }
  };

  return (
    <form onSubmit={submit} data-testid="marketing-profile-editor" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-950">Business Marketing Profile</h2>
          <p className="mt-1 text-sm text-slate-500">Strategy for {profile.businessName}. Version {profile.version}.</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${profile.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
          {profile.status === 'ready' ? 'Ready' : 'Incomplete'}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="lg:col-span-2">
          <span className="text-sm font-semibold text-slate-800">Business summary</span>
          <textarea value={draft.businessSummary} onChange={event => update('businessSummary', event.target.value)} className={textareaClass} maxLength={2000} required />
        </label>
        <label>
          <span className="text-sm font-semibold text-slate-800">Audience segments</span>
          <input value={draft.audienceSegments} onChange={event => update('audienceSegments', event.target.value)} className={inputClass} placeholder="Small contractors, homeowners" required />
          <span className="mt-1 block text-xs text-slate-500">Comma-separated. These belong only to this workspace.</span>
        </label>
        <label>
          <span className="text-sm font-semibold text-slate-800">Service or product focus</span>
          <input value={draft.serviceFocus} onChange={event => update('serviceFocus', event.target.value)} className={inputClass} placeholder="Estimates, jobs, invoices" required />
        </label>
        <label>
          <span className="text-sm font-semibold text-slate-800">Primary goal</span>
          <input value={draft.primaryGoal} onChange={event => update('primaryGoal', event.target.value)} className={inputClass} maxLength={300} required />
        </label>
        <label>
          <span className="text-sm font-semibold text-slate-800">Secondary goals</span>
          <input value={draft.secondaryGoals} onChange={event => update('secondaryGoals', event.target.value)} className={inputClass} />
        </label>
        <label>
          <span className="text-sm font-semibold text-slate-800">Geographic focus</span>
          <input value={draft.geographicFocus ?? ''} onChange={event => update('geographicFocus', event.target.value || null)} className={inputClass} maxLength={300} placeholder="Optional" />
        </label>
        <label>
          <span className="text-sm font-semibold text-slate-800">Tone and style</span>
          <input value={draft.toneStyle} onChange={event => update('toneStyle', event.target.value)} className={inputClass} maxLength={300} required />
        </label>
        <label>
          <span className="text-sm font-semibold text-slate-800">Offers or promotions</span>
          <input value={draft.offers} onChange={event => update('offers', event.target.value)} className={inputClass} placeholder="Only intentionally supplied offers" />
        </label>
        <fieldset>
          <legend className="text-sm font-semibold text-slate-800">Allowed channels</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {MARKETING_PROFILE_CHANNELS.map(channel => {
              const selected = draft.preferredChannels.includes(channel);
              return (
                <label key={channel} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => update('preferredChannels', selected
                      ? draft.preferredChannels.filter(value => value !== channel)
                      : [...draft.preferredChannels, channel] as MarketingProfileChannel[])}
                  />
                  {channel}
                </label>
              );
            })}
          </div>
        </fieldset>
        <label className="lg:col-span-2">
          <span className="text-sm font-semibold text-slate-800">Topics to emphasize</span>
          <input value={draft.emphasizedTopics} onChange={event => update('emphasizedTopics', event.target.value)} className={inputClass} required />
        </label>
        <label className="lg:col-span-2">
          <span className="text-sm font-semibold text-slate-800">Topics to avoid</span>
          <input value={draft.avoidedTopics} onChange={event => update('avoidedTopics', event.target.value)} className={inputClass} />
        </label>
        <label className="lg:col-span-2">
          <span className="text-sm font-semibold text-slate-800">Owner notes</span>
          <textarea value={draft.ownerNotes} onChange={event => update('ownerNotes', event.target.value)} className={textareaClass} maxLength={2000} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
        <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
          <Save size={16} aria-hidden="true" /> {saving ? 'Saving...' : 'Save profile'}
        </button>
        {notice && <p role="status" className="text-sm text-slate-600">{notice}</p>}
      </div>
    </form>
  );
}

function PlanItemEditor({
  item,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  item: MarketingPlanItem;
  index: number;
  disabled: boolean;
  onChange: (item: MarketingPlanItem) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset data-testid={`marketing-plan-item-${index + 1}`} className="border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between gap-3">
        <legend className="text-sm font-bold text-slate-950">Plan item {index + 1}</legend>
        {!disabled && (
          <button type="button" onClick={onRemove} aria-label={`Remove plan item ${index + 1}`} className="flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-700">
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <label>
          <span className="text-xs font-semibold text-slate-700">Audience</span>
          <input disabled={disabled} value={item.audience} onChange={event => onChange({ ...item, audience: event.target.value })} className={inputClass} />
        </label>
        <label>
          <span className="text-xs font-semibold text-slate-700">Topic</span>
          <input disabled={disabled} value={item.topic} onChange={event => onChange({ ...item, topic: event.target.value })} className={inputClass} />
        </label>
        <label className="lg:col-span-2">
          <span className="text-xs font-semibold text-slate-700">Direction</span>
          <textarea disabled={disabled} value={item.direction} onChange={event => onChange({ ...item, direction: event.target.value })} className={textareaClass} maxLength={1000} />
        </label>
        <label className="lg:col-span-2">
          <span className="text-xs font-semibold text-slate-700">Why this belongs in the plan</span>
          <textarea disabled={disabled} value={item.rationale} onChange={event => onChange({ ...item, rationale: event.target.value })} className={textareaClass} maxLength={1000} />
        </label>
        <label className="lg:col-span-2">
          <span className="text-xs font-semibold text-slate-700">Proposed content role</span>
          <select
            disabled={disabled}
            value={item.contentRoles[0]}
            onChange={event => onChange({ ...item, contentRoles: [event.target.value as MarketingPlanContentRole] })}
            className={inputClass}
          >
            {MARKETING_PLAN_CONTENT_ROLES.map(role => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      </div>
    </fieldset>
  );
}

function PlanEditor({
  state,
  saving,
  onCreate,
  onUpdate,
  onAccept,
}: {
  state: MarketingPlanningState;
  saving: boolean;
  onCreate: (input: MarketingPlanCreateInput) => Promise<void>;
  onUpdate: (plan: MarketingPlan) => Promise<void>;
  onAccept: (plan: MarketingPlan) => Promise<void>;
}) {
  const period = useMemo(defaultPeriod, []);
  const [mode, setMode] = useState<'recommended' | 'owner_directed'>('recommended');
  const [ownerDirection, setOwnerDirection] = useState('');
  const [ownerAudience, setOwnerAudience] = useState(state.profile.audienceSegments[0] ?? '');
  const [ownerTopic, setOwnerTopic] = useState(state.profile.emphasizedTopics[0] ?? '');
  const [plan, setPlan] = useState<MarketingPlan | null>(state.plan);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setPlan(state.plan), [state.plan]);

  const create = async () => {
    setNotice(null);
    try {
      const items = mode === 'recommended'
        ? buildRecommendedMarketingPlan(state.profile, state.recentContent)
        : buildOwnerDirectedMarketingPlan(state.profile, ownerDirection, ownerAudience, ownerTopic);
      await onCreate({
        clientRequestId: crypto.randomUUID(),
        profileVersion: state.profile.version,
        mode,
        title: `${state.profile.businessName} marketing plan`,
        planningStart: period.start,
        planningEnd: period.end,
        ownerDirection: mode === 'owner_directed' ? ownerDirection.trim() : null,
        recommendationContractVersion: mode === 'recommended' ? MARKETING_RECOMMENDATION_CONTRACT_VERSION : null,
        items,
      });
      setNotice(mode === 'recommended' ? 'Recommended draft plan prepared.' : 'Owner-directed draft plan prepared.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'ServSync could not prepare the plan.');
    }
  };

  const save = async () => {
    if (!plan) return;
    setNotice(null);
    try {
      await onUpdate(plan);
      setNotice('Draft plan saved.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'ServSync could not save the plan.');
    }
  };

  const accept = async () => {
    if (!plan) return;
    setNotice(null);
    try {
      await onAccept(plan);
      setNotice('Marketing Plan accepted. This does not create, schedule, or publish content.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'ServSync could not accept the plan.');
    }
  };

  if (!plan) {
    return (
      <section data-testid="marketing-plan-builder" className="space-y-5">
        <div className="border-b border-slate-200 pb-4">
          <h2 className="text-base font-bold text-slate-950">Marketing Plan</h2>
          <p className="mt-1 text-sm text-slate-500">Choose a profile-based recommendation or preserve a specific owner priority.</p>
        </div>
        <div role="group" aria-label="Planning mode" className="inline-flex rounded-md border border-slate-300 bg-white p-1">
          {(['recommended', 'owner_directed'] as const).map(value => (
            <button key={value} type="button" onClick={() => setMode(value)} className={`min-h-10 rounded px-3 text-sm font-bold ${mode === value ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>
              {value === 'recommended' ? 'Recommend a plan' : 'Owner-directed'}
            </button>
          ))}
        </div>
        {mode === 'owner_directed' && (
          <div className="grid gap-3 lg:grid-cols-2">
            <label>
              <span className="text-sm font-semibold text-slate-800">Audience</span>
              <select value={ownerAudience} onChange={event => setOwnerAudience(event.target.value)} className={inputClass}>
                {state.profile.audienceSegments.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span className="text-sm font-semibold text-slate-800">Topic</span>
              <select value={ownerTopic} onChange={event => setOwnerTopic(event.target.value)} className={inputClass}>
                {state.profile.emphasizedTopics.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="lg:col-span-2">
              <span className="text-sm font-semibold text-slate-800">What do you want to market?</span>
              <textarea value={ownerDirection} onChange={event => setOwnerDirection(event.target.value)} className={textareaClass} maxLength={1000} />
            </label>
          </div>
        )}
        <p className="text-sm text-slate-500">Recent context: {state.recentContent.itemCount} content item{state.recentContent.itemCount === 1 ? '' : 's'} considered. Recommendations remain specific to this profile.</p>
        <button type="button" onClick={() => void create()} disabled={saving || state.profile.status !== 'ready'} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
          <Sparkles size={16} aria-hidden="true" /> {saving ? 'Preparing...' : mode === 'recommended' ? 'Recommend plan' : 'Prepare owner plan'}
        </button>
        {notice && <p role="status" className="text-sm text-slate-600">{notice}</p>}
      </section>
    );
  }

  const editable = plan.status === 'draft';
  return (
    <section data-testid="marketing-plan-editor" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-950">{plan.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {plan.mode === 'recommended'
              ? `Recommended with planner v${plan.recommendationContractVersion ?? 1}`
              : 'Owner-directed'} from profile version {plan.profileVersion}. Revision {plan.revisionNumber}.
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${editable ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
          {editable ? 'Draft plan' : 'Accepted plan'}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="text-xs font-semibold text-slate-700">Planning starts</span>
          <input type="date" disabled={!editable} value={plan.planningStart} onChange={event => setPlan({ ...plan, planningStart: event.target.value })} className={inputClass} />
        </label>
        <label>
          <span className="text-xs font-semibold text-slate-700">Planning ends</span>
          <input type="date" disabled={!editable} value={plan.planningEnd} onChange={event => setPlan({ ...plan, planningEnd: event.target.value })} className={inputClass} />
        </label>
      </div>
      {plan.ownerDirection && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700"><strong>Owner direction:</strong> {plan.ownerDirection}</p>}
      {plan.items.map((item, index) => (
        <PlanItemEditor
          key={index}
          item={item}
          index={index}
          disabled={!editable}
          onChange={next => setPlan({ ...plan, items: plan.items.map((current, itemIndex) => itemIndex === index ? next : current) })}
          onRemove={() => setPlan({ ...plan, items: plan.items.filter((_, itemIndex) => itemIndex !== index) })}
        />
      ))}
      {editable && plan.items.length < 7 && (
        <button
          type="button"
          onClick={() => setPlan({
            ...plan,
            items: [...plan.items, {
              audience: state.profile.audienceSegments[0] ?? '',
              topic: state.profile.emphasizedTopics[0] ?? '',
              direction: '',
              rationale: 'Owner-added plan item.',
              contentRoles: ['educational_post'],
            }],
          })}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          <Plus size={16} aria-hidden="true" /> Add plan item
        </button>
      )}
      <p className="text-xs leading-5 text-slate-500">This plan considered {plan.recentContentContext.itemCount} recent content item{plan.recentContentContext.itemCount === 1 ? '' : 's'}. Accepting a plan does not create content or publish anything.</p>
      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        {editable && (
          <>
            <button type="button" onClick={() => void save()} disabled={saving || plan.items.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <Save size={16} aria-hidden="true" /> Save draft
            </button>
            <button type="button" onClick={() => void accept()} disabled={saving || plan.items.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
              <Check size={16} aria-hidden="true" /> Accept plan
            </button>
          </>
        )}
        <button type="button" onClick={() => setPlan(null)} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-bold text-blue-700 hover:bg-blue-50">
          <RefreshCw size={16} aria-hidden="true" /> Another plan
        </button>
      </div>
      {notice && <p role="status" className="text-sm text-slate-600">{notice}</p>}
    </section>
  );
}

export function MarketingPlanningWorkspace({
  state,
  loading,
  error,
  saving,
  onReload,
  onSaveProfile,
  onCreatePlan,
  onUpdatePlan,
  onAcceptPlan,
  directions,
}: {
  state: MarketingPlanningState | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  onReload: () => Promise<void>;
  onSaveProfile: (profile: MarketingBusinessProfile) => Promise<void>;
  onCreatePlan: Parameters<typeof PlanEditor>[0]['onCreate'];
  onUpdatePlan: (plan: MarketingPlan) => Promise<void>;
  onAcceptPlan: (plan: MarketingPlan) => Promise<void>;
  directions: {
    state: MarketingDirectionsState | null;
    loading: boolean;
    error: string | null;
    saving: boolean;
    onReload: () => Promise<void>;
    onUpdate: (direction: MarketingDirection) => Promise<void>;
    onApprove: (direction: MarketingDirection) => Promise<void>;
  };
}) {
  const [view, setView] = useState<'profile' | 'plan' | 'directions'>('profile');

  if (loading) return <div data-testid="marketing-planning-loading" className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading Marketing Profile...</div>;
  if (error || !state) {
    return (
      <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        <p>{error ?? 'Marketing planning is unavailable.'}</p>
        <button type="button" onClick={() => void onReload()} className="mt-3 min-h-10 font-bold text-rose-900">Try again</button>
      </div>
    );
  }

  return (
    <div data-testid="marketing-planning-workspace" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div role="tablist" aria-label="Marketing planning" className="mb-5 inline-flex rounded-md border border-slate-300 p-1">
        {(['profile', 'plan', 'directions'] as const).map(value => (
          <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)} className={`min-h-10 rounded px-4 text-sm font-bold ${view === value ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
            {value === 'profile' ? 'Profile' : value === 'plan' ? 'Plan' : 'Directions'}
          </button>
        ))}
      </div>
      {view === 'profile'
        ? <ProfileEditor profile={state.profile} saving={saving} onSave={onSaveProfile} />
        : view === 'plan'
          ? (
          <PlanEditor
            state={state}
            saving={saving}
            onCreate={onCreatePlan}
            onUpdate={onUpdatePlan}
            onAccept={onAcceptPlan}
          />
          )
          : <MarketingDirectionsWorkspace {...directions} />}
    </div>
  );
}
