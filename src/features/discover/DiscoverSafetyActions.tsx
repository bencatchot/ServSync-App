import { useId, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import {
  DISCOVER_REPORT_REASONS,
  type DiscoverSafetyReportReason,
} from "./discoverSafety";
import {
  DiscoverSafetyDialog,
  discoverSafetyButton,
  discoverSafetyInput,
  discoverSafetyPrimary,
} from "./DiscoverSafetyDialog";

export type { DiscoverSafetyReportReason } from "./discoverSafety";

export type DiscoverSafetyActionsProps = {
  postId: string;
  contractorId: string;
  title: string;
  onReport: (postId: string, reason: DiscoverSafetyReportReason) => Promise<string>;
  onBlock: (contractorId: string) => Promise<void>;
};

type Target = Pick<DiscoverSafetyActionsProps, "postId" | "contractorId" | "title">;
type DialogState =
  | { kind: "report" | "block"; target: Target }
  | { kind: "receipt"; reference: string };

export function DiscoverSafetyActions({
  postId,
  contractorId,
  title,
  onReport,
  onBlock,
}: DiscoverSafetyActionsProps) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [reason, setReason] = useState<DiscoverSafetyReportReason | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const reasonId = useId();

  function open(event: MouseEvent<HTMLButtonElement>, kind: "report" | "block") {
    event.stopPropagation();
    setReason("");
    setError("");
    setNotice("");
    setDialog({ kind, target: { postId, contractorId, title } });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (pending.current || !dialog || dialog.kind === "receipt") return;
    if (dialog.kind === "report" && (!reason || !Object.prototype.hasOwnProperty.call(DISCOVER_REPORT_REASONS, reason))) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (dialog.kind === "report" && reason) {
        const reference = (await onReport(dialog.target.postId, reason)).trim();
        if (!reference) throw new Error("No report reference");
        setDialog({ kind: "receipt", reference });
      } else {
        await onBlock(dialog.target.contractorId);
        setDialog(null);
        setNotice("Account blocked.");
      }
    } catch {
      setError(dialog.kind === "report"
        ? "Your report could not be confirmed. Try again."
        : "We couldn’t confirm the block. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={discoverSafetyButton} onClick={(event) => open(event, "report")}>
          Report post
        </button>
        <button type="button" className={discoverSafetyButton} onClick={(event) => open(event, "block")}>
          Block account
        </button>
      </div>
      {notice && <p role="status" className="mt-2 text-sm text-slate-700">{notice}</p>}
      {dialog?.kind === "receipt" && (
        <DiscoverSafetyDialog key="receipt" title="Report received" onDismiss={() => setDialog(null)}>
          <p className="text-sm">The ServSync team will review your report. Reporting does not automatically block the account.</p>
          <p className="break-words rounded-lg bg-slate-100 p-3 text-sm">
            <strong>Report reference:</strong> {dialog.reference}
          </p>
          <button type="button" className={discoverSafetyPrimary} onClick={() => setDialog(null)}>Done</button>
        </DiscoverSafetyDialog>
      )}
      {(dialog?.kind === "report" || dialog?.kind === "block") && (
        <DiscoverSafetyDialog
          key={dialog.kind}
          title={dialog.kind === "report" ? "Report this Discover post" : "Block this account?"}
          busy={busy}
          onDismiss={() => setDialog(null)}
          onSubmit={(event) => { void submit(event); }}
        >
          {dialog.kind === "report" ? (
            <>
              <p className="break-words text-sm">Post: <strong>{dialog.target.title}</strong></p>
              <label htmlFor={reasonId} className="block text-sm font-semibold">Reason for reporting</label>
              <select
                id={reasonId}
                value={reason}
                disabled={busy}
                required
                className={discoverSafetyInput}
                onChange={(event) => setReason(event.target.value as DiscoverSafetyReportReason | "")}
              >
                <option value="">Select a reason</option>
                {Object.entries(DISCOVER_REPORT_REASONS).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </>
          ) : (
            <p className="text-sm">
              This account’s posts won’t appear in your Discover feed. Blocking also prevents new connection or service requests between you. Both sides can still manage existing appointments and close requests, but new job messages, request replies, attachments, and shared appointment notes stop. Past messages and job records stay in place. No report is sent.
            </p>
          )}
          {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={discoverSafetyButton} onClick={() => setDialog(null)}>Cancel</button>
            <button type="submit" className={discoverSafetyPrimary} disabled={busy || (dialog.kind === "report" && !reason)}>
              {busy ? "Working…" : dialog.kind === "report" ? "Send report" : "Confirm block"}
            </button>
          </div>
        </DiscoverSafetyDialog>
      )}
    </>
  );
}
