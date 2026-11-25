import { SERVSYNC_SIGNUP_ACKNOWLEDGMENTS, type ServSyncPolicyPage } from './servsyncLaunchPolicy';

export function PolicySignupAcknowledgment({ role, accepted, onChange, onOpen }: {
  role: 'homeowner' | 'contractor';
  accepted: boolean;
  onChange: (accepted: boolean) => void;
  onOpen: (page: ServSyncPolicyPage) => void;
}) {
  const links: Array<[ServSyncPolicyPage, string]> = [
    ['terms', 'Terms of Service'], ['acceptable-use', 'Acceptable Use & Content Policy'],
    ['privacy', 'Privacy Policy'],
  ];
  if (role === 'contractor') links.push(['contractor-agreement', 'Contractor Platform Agreement']);
  return <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
    <label className="flex gap-3">
      <input type="checkbox" checked={accepted} onChange={event => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600" />
      <span>{SERVSYNC_SIGNUP_ACKNOWLEDGMENTS[role]}</span>
    </label>
    <div aria-label="Signup policies" className="flex flex-wrap gap-x-3 gap-y-2">
      {links.map(([page, title]) => <button type="button" key={page} onClick={() => onOpen(page)}
        className="font-semibold text-blue-700 underline-offset-2 hover:underline">{title}</button>)}
    </div>
  </div>;
}
