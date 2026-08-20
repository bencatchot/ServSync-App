import { Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { ActionFeedback, type ActionFeedbackMessage, type ActionFeedbackTone } from '../feedback/ActionFeedback';

const secondaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-[#E1E3E7] bg-white px-4 py-2 text-sm font-semibold text-[#223D67] shadow-sm transition hover:border-[#1B85FB] hover:bg-[#F7F9FC] hover:text-[#0078FF]';

export function PhotoUploadPanel({
  title,
  helper,
  imageUrl,
  fallback,
  uploading,
  buttonLabel,
  footer,
  onUpload,
}: {
  title: string;
  helper: string;
  imageUrl: string;
  fallback: ReactNode;
  uploading: boolean;
  buttonLabel: string;
  footer?: string;
  onUpload: (file: File | null) => void;
}) {
  return (
    <div className="mb-4 rounded-xl border border-[#E1E3E7] bg-[#F7F9FC] p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#E1E3E7] bg-white">
            {imageUrl ? <img src={imageUrl} alt={title} className="h-full w-full object-cover" /> : fallback}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#02132D]">{title}</p>
            <p className="mt-0.5 max-w-xl text-xs leading-5 text-[#223D67]">{helper}</p>
          </div>
        </div>
        <label className={`${secondaryButtonClass} cursor-pointer`}>
          <Upload size={15} />
          {uploading ? 'Uploading...' : buttonLabel}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={event => {
              const file = event.target.files?.[0] || null;
              event.currentTarget.value = '';
              onUpload(file);
            }}
          />
        </label>
      </div>
      {footer && <p className="mt-2 text-xs font-medium text-amber-700">{footer}</p>}
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Only upload photos you have the right to use. Home photos may contain sensitive information, so be careful before sending or sharing copies outside your account.
      </p>
    </div>
  );
}

export function OverviewCard({ icon, label, value, helper, onClick }: {
  icon: ReactNode;
  label: string;
  value: string;
  helper: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-[#E1E3E7] bg-white p-3.5 text-left shadow-sm transition hover:border-[#1B85FB] hover:shadow-md">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0078FF]/10 text-[#0078FF]">{icon}</div>
      <p className="mt-3 text-xl font-bold text-[#02132D]">{value}</p>
      <p className="mt-0.5 text-sm font-semibold text-[#223D67]">{label}</p>
      <p className="mt-0.5 text-xs leading-4 text-[#223D67]/70">{helper}</p>
    </button>
  );
}

export function Card({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-[#E1E3E7] bg-white p-4 shadow-sm">
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0078FF]/10 text-[#0078FF]">{icon}</div>
        <h2 className="min-w-0 text-sm font-bold text-[#02132D]">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children, labelClassName = 'text-[#223D67]/75' }: { label: string; children: ReactNode; labelClassName?: string }) {
  return (
    <label className="block">
      <span className={`mb-1 block text-xs font-semibold uppercase tracking-[0.12em] ${labelClassName}`}>{label}</span>
      {children}
    </label>
  );
}

export type NoticeContent = string | ActionFeedbackMessage;

export function Notice({ tone, text }: { tone: ActionFeedbackTone; text: NoticeContent }) {
  return (
    <ActionFeedback
      tone={tone}
      title={typeof text === 'string' ? text : text.title}
      body={typeof text === 'string' ? undefined : text.body}
      testId={typeof text === 'string' ? undefined : text.testId}
      compact
    />
  );
}
