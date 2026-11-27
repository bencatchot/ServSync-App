import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  DISCOVER_REPORT_REASONS,
  DISCOVER_SAFETY_DETAIL_LIMIT,
  type DiscoverSafetyReportReason,
  discoverReviewImageUrl,
} from "./discoverSafety";
import {
  DiscoverSafetyDialog,
  discoverSafetyButton,
  discoverSafetyInput,
  discoverSafetyPrimary,
} from "./DiscoverSafetyDialog";

export type DiscoverSafetyDecision = "approve" | "reject" | "dismiss" | "remove";
export type DiscoverSafetyQueueItem = {
  id: string;
  kind: "post" | "report";
  post_id: string | null;
  title?: string | null;
  description?: string | null;
  photos?: string[] | null;
  reason?: string | null;
  status: string;
  created_at?: string | null;
};

export type DiscoverSafetyAdminQueueProps = {
  loadQueue: () => Promise<DiscoverSafetyQueueItem[]>;
  onDecide: (id: string, kind: DiscoverSafetyQueueItem["kind"], decision: DiscoverSafetyDecision, reason: string) => Promise<void>;
  /** Exact SERVSYNC-controlled HTTPS origin serving review media, not user input. */
  imageOrigin?: string;
};

const queueStateLabels: Record<string, string> = {
  pending: "Pending review",
  pending_review: "Pending review",
  open: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
  dismissed: "Dismissed",
  removed: "Removed",
  resolved: "Resolved",
};

const decisionLabels: Record<DiscoverSafetyDecision, string> = {
  approve: "Approve and publish",
  reject: "Reject post",
  dismiss: "Dismiss report",
  remove: "Remove post",
};

function labelReason(value: string | null | undefined) {
  if (!value || !Object.prototype.hasOwnProperty.call(DISCOVER_REPORT_REASONS, value)) return null;
  return DISCOVER_REPORT_REASONS[value as DiscoverSafetyReportReason];
}

function createdLabel(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function availableDecisions(item: DiscoverSafetyQueueItem): DiscoverSafetyDecision[] {
  if (item.kind === "post" && ["pending", "pending_review"].includes(item.status)) return ["approve", "reject"];
  if (item.kind === "report" && ["pending", "open", "pending_review"].includes(item.status)) {
    return item.post_id ? ["dismiss", "remove"] : ["dismiss"];
  }
  return [];
}

export function DiscoverSafetyAdminQueue({
  loadQueue,
  onDecide,
  imageOrigin,
}: DiscoverSafetyAdminQueueProps) {
  const [refresh, setRefresh] = useState(0);
  const [items, setItems] = useState<DiscoverSafetyQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<DiscoverSafetyQueueItem | null>(null);
  const [decision, setDecision] = useState<DiscoverSafetyDecision | "">("");
  const [reason, setReason] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadedPhotos, setLoadedPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const loadRef = useRef(loadQueue);
  const reasonId = useId();
  const decisionId = useId();

  useEffect(() => { loadRef.current = loadQueue; }, [loadQueue]);
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const next = await loadRef.current();
        if (current) {
          setItems(next);
          setLoadError(false);
        }
      } catch {
        if (current) {
          setItems([]);
          setLoadError(true);
        }
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
  }, [refresh]);

  function reload() {
    setLoading(true);
    setLoadError(false);
    setRefresh((value) => value + 1);
  }

  function select(item: DiscoverSafetyQueueItem) {
    setDecision("");
    setReason("");
    setConfirmRemove(false);
    setSaveError(false);
    setLoadedPhotos([]);
    setPhotoError(false);
    setSelected(item);
  }

  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !selected || !decision || !reason.trim()
      || reason.trim().length > DISCOVER_SAFETY_DETAIL_LIMIT
      || !availableDecisions(selected).includes(decision)
      || (decision === "approve" && !canReviewAllPhotos)
      || (decision === "remove" && !confirmRemove)) return;
    pending.current = true;
    setBusy(true);
    setSaveError(false);
    setNotice("");
    try {
      await onDecide(selected.id, selected.kind, decision, reason.trim());
      setSelected(null);
      setNotice("Review decision recorded.");
      reload();
    } catch {
      setSaveError(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const photos = selected?.photos ?? [];
  const visiblePhotos = photos
    .slice(0, 12)
    .map((src) => discoverReviewImageUrl(src, imageOrigin))
    .filter((value): value is string => value !== null);
  const hiddenPhotoCount = photos.length - visiblePhotos.length;
  const canReviewAllPhotos = !hiddenPhotoCount && !photoError && visiblePhotos.every((src, index) => loadedPhotos.includes(`${index}:${src}`));

  return (
    <section aria-label="Discover safety review" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Discover safety review</h2>
          <p className="mt-1 text-sm text-slate-600">Review new posts before they go public and respond to reports from users.</p>
        </div>
        <button type="button" className={discoverSafetyButton} onClick={reload} disabled={loading || busy}>
          Refresh queue
        </button>
      </header>
      {notice && <p role="status" className="text-sm text-slate-700">{notice}</p>}
      {loading && <p role="status" className="text-sm text-slate-600">Loading review queue…</p>}
      {loadError && <p role="alert" className="text-sm text-red-800">The review queue could not be loaded. Try refreshing it.</p>}
      {!loading && !loadError && !items.length && <p className="text-sm text-slate-600">The review queue is empty.</p>}
      {!loading && !loadError && items.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase text-slate-600">{item.kind === "post" ? "Post submission" : "User report"}</p>
                <p className="break-words font-semibold">{item.title?.trim() || "Discover post"}</p>
                <p className="text-sm text-slate-600">
                  {queueStateLabels[item.status] ?? "Review status unavailable"}
                  {createdLabel(item.created_at) && ` · ${createdLabel(item.created_at)}`}
                </p>
              </div>
              <button type="button" className={discoverSafetyButton} onClick={() => select(item)}>
                {availableDecisions(item).length ? (item.kind === "post" ? "Review post" : "Review report") : "View details"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <DiscoverSafetyDialog
          title={selected.kind === "post" ? "Review Discover post" : "Review Discover report"}
          busy={busy}
          onDismiss={() => setSelected(null)}
          onSubmit={availableDecisions(selected).length ? (event) => { void decide(event); } : undefined}
        >
          <div className="space-y-2">
            <h3 className="break-words font-bold">{selected.title?.trim() || "Discover post"}</h3>
            {labelReason(selected.reason) && (
              <p className="rounded-lg bg-amber-50 p-2 text-sm"><strong>Reported for:</strong> {labelReason(selected.reason)}</p>
            )}
            {selected.description && <p className="whitespace-pre-wrap break-words text-sm">{selected.description}</p>}
            {visiblePhotos.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {visiblePhotos.map((source, index) => (
                  <img
                    key={`${index}:${source}`}
                    src={source}
                    alt={`Submitted photo ${index + 1}`}
                    referrerPolicy="no-referrer"
                    onLoad={() => {
                      const key = `${index}:${source}`;
                      setLoadedPhotos((previous) => previous.includes(key) ? previous : [...previous, key]);
                    }}
                    onError={() => setPhotoError(true)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 object-contain"
                  />
                ))}
              </div>
            )}
            {!photoError && visiblePhotos.length > loadedPhotos.length && (
              <p role="status" className="text-sm text-slate-600">Loading submitted photos…</p>
            )}
            {photoError && <p role="alert" className="text-sm text-red-800">A submitted photo could not be loaded. Reopen the post to retry. Approval is unavailable until every photo can be reviewed.</p>}
            {hiddenPhotoCount > 0 && (
              <p className="text-sm text-slate-600">
                {hiddenPhotoCount} submitted {hiddenPhotoCount === 1 ? "photo could" : "photos could"} not be shown from an approved source.
              </p>
            )}
          </div>
          {availableDecisions(selected).length > 0 && (
            <>
              <label htmlFor={decisionId} className="block text-sm font-semibold">Decision</label>
              <select
                id={decisionId}
                className={discoverSafetyInput}
                value={decision}
                disabled={busy}
                required
                onChange={(event) => {
                  setDecision(event.target.value as DiscoverSafetyDecision | "");
                  setConfirmRemove(false);
                }}
              >
                <option value="">Select a decision</option>
                {availableDecisions(selected).map((choice) => <option key={choice} value={choice}>{decisionLabels[choice]}</option>)}
              </select>
              <label htmlFor={reasonId} className="block text-sm font-semibold">Reason for decision</label>
              <textarea
                id={reasonId}
                className={discoverSafetyInput}
                rows={3}
                maxLength={DISCOVER_SAFETY_DETAIL_LIMIT}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={busy}
                required
              />
              {decision === "remove" && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={confirmRemove} disabled={busy} required
                    onChange={(event) => setConfirmRemove(event.target.checked)} />
                  I confirm this post should be removed from Discover.
                </label>
              )}
            </>
          )}
          {saveError && <p role="alert" className="text-sm text-red-800">The decision could not be confirmed. Try again.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={discoverSafetyButton} disabled={busy} onClick={() => setSelected(null)}>
              {availableDecisions(selected).length ? "Cancel" : "Close"}
            </button>
            {availableDecisions(selected).length > 0 && (
              <button
                type="submit"
                className={discoverSafetyPrimary}
                disabled={busy || !decision || !reason.trim() || (decision === "approve" && !canReviewAllPhotos)
                  || (decision === "remove" && !confirmRemove)}
              >
                {busy ? "Saving decision…" : "Save decision"}
              </button>
            )}
          </div>
        </DiscoverSafetyDialog>
      )}
    </section>
  );
}
