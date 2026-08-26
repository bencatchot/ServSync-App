import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, MessageSquare, ShieldCheck, Smartphone, XCircle } from 'lucide-react';

export type BetaGuideRole = 'contractor' | 'homeowner';

type BetaGuidePanelProps = {
  role: BetaGuideRole;
  onOpenSupport: () => void;
  contextualHelp?: ReactNode;
};

type BetaFeedbackPromptProps = {
  role: BetaGuideRole;
  openCount?: number;
  waitingOnYouCount?: number;
  onOpenGuide: () => void;
  onReportBug: () => void;
  onReportConfusion: () => void;
  onSuggestImprovement: () => void;
  onOpenTrust?: () => void;
  onOpenPrivacy?: () => void;
};

type GuideSection = {
  title: string;
  eyebrow: string;
  description: string;
  items: string[];
  tone: 'available' | 'manual' | 'unavailable';
};

const sharedUnavailable = [
  'QuickBooks or other accounting sync',
  'Automatic email, text, or push reminders',
  'Native iOS or Android apps',
  'Full external calendar sync or advanced dispatch',
  'Broad public marketplace lead generation',
];

const guideSections: Record<BetaGuideRole, GuideSection[]> = {
  contractor: [
    {
      eyebrow: 'Available in beta',
      title: 'Run the core service workflow',
      description: 'These are the workflows we want pilot contractors to use and evaluate.',
      items: [
        'Organize connected and not-connected Customers',
        'Review Requests and prepare Estimates',
        'Create, perform, and document Jobs and reports',
        'Create and send Invoices where the customer path supports it',
        'Use calendar visibility and in-app Support',
      ],
      tone: 'available',
    },
    {
      eyebrow: 'Manual for now',
      title: 'Keep these steps outside automation',
      description: 'ServSync can record the workflow without pretending every handoff is automated.',
      items: [
        'Collect payment outside ServSync, then record the payment status in Financials',
        'Share eligible claim invites by copied link or QR code',
        'Coordinate schedule changes with the customer when automation is not available',
        'Use in-app attention and follow-up instead of external reminder delivery',
      ],
      tone: 'manual',
    },
    {
      eyebrow: 'Not available yet',
      title: 'Do not plan around these capabilities',
      description: 'These remain outside the controlled pilot until separately approved and proven.',
      items: ['Online payment collection', ...sharedUnavailable],
      tone: 'unavailable',
    },
  ],
  homeowner: [
    {
      eyebrow: 'Available in beta',
      title: 'Keep service work connected to your home',
      description: 'These are the workflows we want pilot homeowners to use and evaluate.',
      items: [
        'Organize Properties and connect with a contractor',
        'Create Requests and review Estimates',
        'View Invoices and file eligible records to Home History',
        'Keep private Documents and manual Home Reminders',
        'Review calendar details and use in-app Support',
      ],
      tone: 'available',
    },
    {
      eyebrow: 'Manual for now',
      title: 'A few handoffs still happen outside ServSync',
      description: 'The app keeps the record clear while these steps remain intentionally manual.',
      items: [
        'Pay the contractor outside ServSync',
        'Use Home Reminders as in-app notes without automatic alerts or recurrence',
        'Coordinate appointment changes through the Request or directly with the contractor',
        'Use shared links or QR codes when an invitation is not delivered automatically',
      ],
      tone: 'manual',
    },
    {
      eyebrow: 'Not available yet',
      title: 'Do not expect these during the pilot',
      description: 'These remain outside the controlled pilot until separately approved and proven.',
      items: ['Paying an Invoice inside ServSync', ...sharedUnavailable],
      tone: 'unavailable',
    },
  ],
};

const toneStyles = {
  available: {
    icon: CheckCircle2,
    border: 'border-emerald-200',
    background: 'bg-emerald-50/70',
    iconBackground: 'bg-emerald-100 text-emerald-800',
    eyebrow: 'text-emerald-800',
  },
  manual: {
    icon: Clock3,
    border: 'border-amber-200',
    background: 'bg-amber-50/70',
    iconBackground: 'bg-amber-100 text-amber-800',
    eyebrow: 'text-amber-800',
  },
  unavailable: {
    icon: XCircle,
    border: 'border-slate-200',
    background: 'bg-slate-50',
    iconBackground: 'bg-slate-200 text-slate-700',
    eyebrow: 'text-slate-600',
  },
} as const;

const feedbackButtonClass = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800';

export function BetaFeedbackPrompt({
  role,
  openCount,
  waitingOnYouCount,
  onOpenGuide,
  onReportBug,
  onReportConfusion,
  onSuggestImprovement,
  onOpenTrust,
  onOpenPrivacy,
}: BetaFeedbackPromptProps) {
  const contractor = role === 'contractor';
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`${role}-beta-feedback-prompt`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-blue-700" />
            <h2 className="text-sm font-bold text-slate-950">Support and beta feedback</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-5 text-slate-500">
            Tell us what broke, what confused you, or what would make {contractor ? 'your contractor workflow' : 'this'} easier. Please avoid including {contractor ? 'private customer' : 'sensitive home'} details unless support needs them.
          </p>
          {openCount !== undefined && waitingOnYouCount !== undefined && (
            <p className="mt-2 text-xs font-semibold text-slate-600">Open support: {openCount} · Waiting on you: {waitingOnYouCount}</p>
          )}
        </div>
        <button type="button" onClick={onOpenGuide} className={`${feedbackButtonClass} shrink-0 border-blue-200 text-blue-800`}>
          View Beta Guide
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onReportBug} className={feedbackButtonClass}>Report bug</button>
        <button type="button" onClick={onReportConfusion} className={feedbackButtonClass}>Confusing?</button>
        <button type="button" onClick={onSuggestImprovement} className={feedbackButtonClass}>Suggest improvement</button>
        {onOpenTrust && <button type="button" onClick={onOpenTrust} className={feedbackButtonClass}>Trust &amp; safety</button>}
        {onOpenPrivacy && <button type="button" onClick={onOpenPrivacy} className={feedbackButtonClass}>Privacy &amp; data</button>}
      </div>
    </section>
  );
}

export function BetaGuidePanel({ role, onOpenSupport, contextualHelp }: BetaGuidePanelProps) {
  const roleLabel = role === 'contractor' ? 'contractor' : 'homeowner';
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    panelRef.current?.closest('main')?.scrollTo({ top: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const openSupport = () => {
    const scrollContainer = panelRef.current?.closest('main');
    onOpenSupport();
    window.requestAnimationFrame(() => {
      scrollContainer?.scrollTo({ top: 0, behavior: 'auto' });
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  return (
    <div ref={panelRef} className="space-y-5" data-testid={`${role}-beta-guide`}>
      <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Controlled private beta</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Useful now, still improving with real feedback</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              ServSync is testing the everyday homeowner-contractor workflow with a small group. The core path is ready to use, while some steps remain manual and several larger capabilities are intentionally not live yet.
            </p>
          </div>
          <div className="border-t border-blue-100 bg-blue-50 p-5 lg:border-l lg:border-t-0">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm"><ShieldCheck size={20} /></span>
              <div>
                <p className="font-bold text-slate-950">Best fit for this pilot</p>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  {role === 'contractor'
                    ? 'Solo contractors and very small teams using a straightforward request-to-invoice workflow.'
                    : 'Homeowners testing one real or realistic workflow with a trusted beta contractor.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        {guideSections[role].map(section => {
          const style = toneStyles[section.tone];
          const Icon = style.icon;
          return (
            <section key={section.tone} className={`rounded-2xl border ${style.border} ${style.background} p-4 sm:p-5`} data-testid={`beta-guide-${section.tone}`}>
              <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.iconBackground}`}><Icon size={18} /></span>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-[0.14em] ${style.eyebrow}`}>{section.eyebrow}</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-950">{section.title}</h2>
                </div>
              </div>
              <p className="mt-3 text-sm leading-5 text-slate-600">{section.description}</p>
              <ul className="mt-4 space-y-2">
                {section.items.map(item => (
                  <li key={item} className="flex gap-2 text-sm leading-5 text-slate-700">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto] lg:items-center sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><MessageSquare size={19} /></span>
          <div>
            <h2 className="text-lg font-bold text-slate-950">Need help or found something confusing?</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Use Support and tell us your role, the screen you were on, what you expected, and what happened. Avoid private customer or home details unless support truly needs them. This is hands-on beta support, not 24/7 emergency service.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
          {contextualHelp}
          <button
            type="button"
            onClick={openSupport}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            Open Support
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Beta access notes">
        <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <Smartphone className="mt-0.5 shrink-0 text-blue-700" size={19} />
          <div>
            <p className="text-sm font-bold text-slate-950">Use the mobile website</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">ServSync is responsive in a phone browser. A native mobile app is not available yet.</p>
          </div>
        </div>
        <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <CalendarDays className="mt-0.5 shrink-0 text-blue-700" size={19} />
          <div>
            <p className="text-sm font-bold text-slate-950">Calendar visibility, not full sync</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Review ServSync appointments and events here. Google, Outlook, route optimization, and advanced dispatch are not connected.</p>
          </div>
        </div>
      </section>

      <p className="text-center text-xs leading-5 text-slate-500">This guide describes the current {roleLabel} pilot boundary. Available features can still depend on role, customer connection, record state, and existing permissions.</p>
    </div>
  );
}
