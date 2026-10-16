import { useEffect, useRef, useState } from "react";
import { ContractorDraftComposer } from "../drafts/ContractorDraftComposer";
import { createBlankSharedDraftComposerDraft } from "../drafts/draftComposerMappings";
import type { SharedDraftComposerDraft } from "../drafts/draftComposerTypes";
import {
  retentionNotice,
  validatePracticePreview,
  type PracticeDraft,
  type PracticeReceipt,
  type PracticeReview,
  type PracticeWorkspace,
} from "./contracts";
import { practiceEstimate } from "./preview";
import { createEstimatePdf } from "../../utils/pdfDocuments";
import { formatMoney } from "../../utils/format";
import type { ContractorPriceBookItem, EstimateTemplate } from "../../types";

type State = {
  workspace: PracticeWorkspace | null;
  drafts: PracticeDraft[];
  serverNow: string;
};
const button =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold disabled:opacity-50";
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/practice-local/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-practice-local": "1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Practice request failed.");
  return data;
}
function blank(rate = "") {
  return createBlankSharedDraftComposerDraft({
    intended_output: "estimate",
    subject_type: "local",
    local_contact_id: "practice-customer",
    local_home_id: "practice-property",
    labor_rate: rate,
  });
}

export function PracticeLocalReview() {
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState<SharedDraftComposerDraft>(() => blank());
  const [id, setId] = useState<string>(() => crypto.randomUUID());
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState<PracticeReview | null>(null);
  const [receipt, setReceipt] = useState<PracticeReceipt | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewTotal, setPreviewTotal] = useState(0);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const [refreshReview, setRefreshReview] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    const dialog = previewDialog.current;
    if (preview && dialog) {
      dialog.showModal();
      return () => dialog.close();
    }
  }, [preview]);
  async function load() {
    const value = await api<State>("state");
    setState(value);
    setOffset(Date.parse(value.serverNow) - Date.now());
    return value;
  }
  useEffect(() => {
    let live = true;
    api<State>("state")
      .then((value) => {
        if (live) {
          setState(value);
          setOffset(Date.parse(value.serverNow) - Date.now());
          setDraft(blank(value.workspace?.snapshot?.business.laborRate));
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  const workspace = state?.workspace;
  const status = workspace
    ? retentionNotice(workspace.expires_at, clock + offset)
    : "expired";
  const expired = status === "expired";
  useEffect(() => {
    if (expired) setPreview(null);
  }, [expired]);
  const snapshot = workspace?.snapshot;
  const prices: ContractorPriceBookItem[] = (snapshot?.prices ?? []).map(
    (p) => ({
      ...p,
      contractor_id: "practice",
      internal_notes: "",
      trade: "",
      category: "",
      subcategory: null,
      taxable: false,
      sku: null,
      source: "practice snapshot",
      active: true,
      archived_at: null,
      created_at: "",
      updated_at: "",
    }),
  );
  const templates: EstimateTemplate[] = (snapshot?.templates ?? []).map(
    (t) => ({
      ...t,
      contractor_id: "practice",
      trade: "",
      notes: "",
      terms: "",
      created_at: "",
      updated_at: "",
    }),
  );
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to complete action.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!workspace) throw new Error("Start a Practice cycle first.");
    const result = await api<PracticeDraft>("save", {
      workspace: workspace.id,
      id,
      revision,
      draft,
    });
    setDraft(result.payload);
    setRevision(result.revision);
    setMessage("Practice Draft saved on the local server.");
    await load();
    return result;
  }
  async function showPreview() {
    const checked = validatePracticePreview(draft);
    setPreviewTotal(checked.totalCents);
    const result = await createEstimatePdf(practiceEstimate(draft), {
      contractorName: snapshot?.business.name || "Fictional business",
      customerName: "Fictional Customer",
      practice: true,
    });
    setPreview(URL.createObjectURL(result.blob));
  }
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header
        className="sticky top-0 z-40 border-b-2 border-amber-600 bg-amber-100 px-4 py-3"
        aria-label="Practice environment"
      >
        <div className="mx-auto max-w-5xl">
          <strong>PRACTICE — Changes stay here.</strong>
          <p className="text-sm">
            No customer delivery or payments. Fictional data · local review
            harness.
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
        <h1 className="text-2xl font-bold">Temporary Practice workspace</h1>
        <p className="text-sm text-slate-600">
          This local foundation uses a real disposable database. Your live
          account and live records are not connected. Only estimate planning and
          a synthetic destination transfer are available.
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="rounded-lg bg-emerald-50 p-3">
            {message}
          </p>
        )}
        {!state ? (
          <p>Loading Practice…</p>
        ) : (
          <>
            <section
              className="rounded-xl border bg-white p-4"
              aria-label="Practice retention"
            >
              <h2 className="font-bold">
                {snapshot?.business.name || "Practice cycle"}
              </h2>
              {workspace && (
                <>
                  <p>
                    Cycle started:{" "}
                    <time>{new Date(workspace.created_at).toISOString()}</time>
                  </p>
                  <p className="font-bold">
                    Expires:{" "}
                    <time>{new Date(workspace.expires_at).toISOString()}</time>{" "}
                    (UTC)
                  </p>
                </>
              )}
              <p className="mt-2 text-sm">
                Proposed default: 30 days from creation, not a calendar-month
                reset. In-app warnings appear during the last 7 days and last
                day. You may miss them while offline. No email is sent.
              </p>
              {status === "seven_days" && (
                <p role="alert" className="mt-2 font-bold text-amber-800">
                  Practice expires within 7 days. Review anything you want to
                  keep.
                </p>
              )}
              {status === "one_day" && (
                <p role="alert" className="mt-2 font-bold text-red-800">
                  Practice expires within 1 day. Review anything you want to
                  keep.
                </p>
              )}
              {workspace && expired && (
                <p role="alert" className="mt-2 font-bold">
                  This cycle has expired. Its content is unavailable and
                  eligible for cleanup after pending transfers resolve.
                </p>
              )}
              <p className="mt-2 text-sm">
                Cleanup is dry-run only in this harness. At most two retained
                cycles per business; unresolved transfers can block cleanup and
                a fresh start.
              </p>
              {expired && (
                <button
                  className={`${button} mt-3`}
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const w = await api<PracticeWorkspace>("start", {});
                      setId(crypto.randomUUID());
                      setRevision(0);
                      setDraft(blank(w.snapshot.business.laborRate));
                      setReview(null);
                      setReceipt(null);
                      await load();
                    })
                  }
                >
                  {workspace
                    ? "Start a fresh Practice cycle"
                    : "Start Practice with fictional setup"}
                </button>
              )}
            </section>
            {workspace && !expired && (
              <>
                <section
                  className="flex flex-wrap gap-2"
                  aria-label="Practice actions"
                >
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => {
                      setId(crypto.randomUUID());
                      setRevision(0);
                      setDraft(blank(snapshot?.business.laborRate));
                      setReview(null);
                      setReceipt(null);
                      setMessage("New unsaved Practice Draft.");
                    }}
                  >
                    New Practice Draft
                  </button>
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => setRefreshReview(true)}
                  >
                    Review setup refresh
                  </button>
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await load();
                        setMessage(
                          "Reloaded saved Practice work. Unsaved editor changes remain here.",
                        );
                      })
                    }
                  >
                    Reload saved work
                  </button>
                </section>
                {refreshReview && (
                  <section className="rounded-xl border border-amber-400 bg-amber-50 p-4">
                    <h2 className="font-bold">Review setup refresh</h2>
                    <p>
                      Replace the setup snapshot with the current fictional
                      fixture: 1 price, 1 template, labor rate $75. Existing
                      Draft scope and prices remain unchanged. No live setup is
                      read or written.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await api("refresh", {
                              workspace: workspace.id,
                              revision: workspace.revision,
                            });
                            await load();
                            setRefreshReview(false);
                            setMessage(
                              "Setup snapshot refreshed. Saved Drafts were preserved.",
                            );
                          })
                        }
                      >
                        Refresh Practice setup
                      </button>
                      <button
                        className={button}
                        onClick={() => setRefreshReview(false)}
                      >
                        Cancel refresh
                      </button>
                    </div>
                  </section>
                )}
                <section
                  className="rounded-xl border bg-white p-4"
                  aria-label="Saved Practice Drafts"
                >
                  <h2 className="font-bold">
                    Saved Practice Drafts ({state.drafts.length}/50)
                  </h2>
                  {!state.drafts.length ? (
                    <p>
                      No saved Drafts yet. Build a scope below, then Save Draft
                      before leaving.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {state.drafts.map((d) => (
                        <button
                          key={d.id}
                          className={button}
                          disabled={busy}
                          onClick={() => {
                            setId(d.id);
                            setRevision(d.revision);
                            setDraft(d.payload);
                            setReview(null);
                            setReceipt(null);
                          }}
                        >
                          {d.payload.title || "Untitled Practice Draft"}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                <section className="rounded-xl border bg-white p-4">
                  <p className="mb-3 text-sm text-slate-600">
                    Use fictional details only. Private notes, property details
                    and integration settings are outside this first slice. Taxes
                    are zero in this example; real tax/customer mapping remains
                    a live-import rollout gate.
                  </p>
                  <ContractorDraftComposer
                    estimatePracticeOnly
                    draft={draft}
                    customerOptions={[
                      {
                        key: "local:practice-customer",
                        subjectType: "local",
                        customerId: "practice-customer",
                        label: "Fictional Customer",
                        status: "not_connected",
                        statusLabel: "Practice only",
                        properties: [
                          {
                            id: "practice-property",
                            label: "Fictional property",
                          },
                        ],
                      },
                    ]}
                    savedWorkTemplates={templates}
                    priceBookItems={prices}
                    priceBookLoadState="ready"
                    canViewPriceBook
                    canSave={!busy}
                    saving={busy}
                    interactionDisabled={busy}
                    onChange={(next) => {
                      setDraft(next);
                      setReview(null);
                    }}
                    onSave={() =>
                      void action(async () => {
                        await save();
                      })
                    }
                    onBack={() =>
                      setMessage(
                        "Practice remains open. Saved work is available above.",
                      )
                    }
                    onRemovePersistedLine={() => undefined}
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() => void action(showPreview)}
                    >
                      Preview Practice estimate
                    </button>
                    <button
                      className={button}
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const saved = await save();
                          setReview(
                            await api<PracticeReview>("review", {
                              workspace: workspace.id,
                              id: saved.id,
                              revision: saved.revision,
                              operation: crypto.randomUUID(),
                            }),
                          );
                          setReceipt(null);
                        })
                      }
                    >
                      Review transfer to test destination
                    </button>
                  </div>
                </section>
              </>
            )}
            {review && !expired && (
              <section
                className="rounded-xl border-2 border-amber-600 bg-white p-4"
                aria-label="Transfer review"
              >
                <h2 className="font-bold">
                  Explicit transfer review — synthetic destination
                </h2>
                <p>
                  Create one new unsent Draft in the separate local test
                  destination. No customer/property is assigned. No overwrite,
                  sending, approval, scheduling or payment.
                </p>
                <p className="mt-2 font-bold">
                  Reviewed total: {formatMoney(review.total_cents)} · Keep these
                  explicit prices
                </p>
                <p>
                  Review expires: {new Date(review.expires_at).toISOString()}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className={button}
                    disabled={busy || review.status !== "review"}
                    onClick={() =>
                      void action(async () => {
                        const r = await api<PracticeReceipt>("commit", {
                          operation: review.id,
                          hash: review.package_hash,
                          approval: "create-one-test-draft",
                        });
                        setReceipt(r);
                        setReview({ ...review, status: "complete" });
                        setMessage(
                          "Created one unsent test destination Draft. Nothing sent.",
                        );
                      })
                    }
                  >
                    Approve: create 1 test destination Draft
                  </button>
                  <button
                    className={button}
                    disabled={busy || review.status !== "review"}
                    onClick={() =>
                      void action(async () => {
                        await api("cancel", { operation: review.id });
                        setReview(null);
                        setMessage(
                          "Transfer cancelled. No destination Draft created.",
                        );
                      })
                    }
                  >
                    Cancel transfer
                  </button>
                </div>
              </section>
            )}
            {receipt && (
              <p className="rounded-xl bg-emerald-50 p-4">
                Test destination Draft: <code>{receipt.destination_id}</code>.
                Minimal receipt expires{" "}
                {new Date(receipt.expires_at).toISOString()}; the destination
                Draft is never purged by Practice cleanup.
              </p>
            )}
          </>
        )}
      </div>
      {preview && (
        <dialog
          ref={previewDialog}
          onCancel={() => setPreview(null)}
          aria-label="Practice estimate preview"
          className="fixed inset-0 z-50 m-0 h-full max-h-full w-full max-w-full bg-amber-50 p-4"
        >
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>
                PRACTICE — NOT A LIVE DOCUMENT · {formatMoney(previewTotal)}
              </strong>
              <button
                className={button}
                autoFocus
                onClick={() => setPreview(null)}
              >
                Close preview
              </button>
            </div>
            <p>Fictional Customer · no delivery or payments</p>
            <iframe
              title="Watermarked Practice PDF"
              src={preview}
              className="mt-3 min-h-0 flex-1 bg-white"
            />
            <a
              className={`${button} mt-2 text-center`}
              href={preview}
              download="PRACTICE-estimate.pdf"
            >
              Download watermarked PDF
            </a>
          </div>
        </dialog>
      )}
    </main>
  );
}
