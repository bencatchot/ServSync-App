import { POLICY_ARCHIVE_URL, POLICY_BUNDLE, type PublicSignupRole } from './policies';

export function LegalConsent({ role, accepted, onChange }: {
  role: PublicSignupRole;
  accepted: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-2 text-sm text-slate-600">
      <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <input type="checkbox" checked={accepted} onChange={event => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600" />
        <span>{POLICY_BUNDLE.assent[role]}</span>
      </label>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <a href="#/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms of Service</a>
        <a href="#/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a>
        <a href="#/acceptable-use" target="_blank" rel="noopener noreferrer" className="underline">Acceptable Use Policy</a>
        {role === 'contractor' && <a href="#/contractor-agreement" target="_blank" rel="noopener noreferrer" className="underline">Contractor Platform Agreement</a>}
        <a href={POLICY_ARCHIVE_URL} target="_blank" rel="noopener noreferrer" className="underline">Version {POLICY_BUNDLE.bundleId}</a>
      </div>
      <p className="text-xs">This does not subscribe you to marketing. Policy links open in a new tab so you can keep your signup details here.</p>
    </div>
  );
}
