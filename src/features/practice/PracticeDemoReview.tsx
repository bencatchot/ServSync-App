import { useEffect, useRef, useState } from "react";
import { ContractorDraftComposer } from "../drafts/ContractorDraftComposer";
import { createBlankSharedDraftComposerDraft } from "../drafts/draftComposerMappings";
import type { SharedDraftComposerDraft } from "../drafts/draftComposerTypes";
import type { ContractorPriceBookItem, EstimateTemplate } from "../../types";
import { createEstimatePdf } from "../../utils/pdfDocuments";
import { formatMoney } from "../../utils/format";
import {
  retentionNotice,
  validatePracticePreview,
  type PracticeDraft,
} from "./contracts";
import { practiceEstimate } from "./preview";
import { DemoPracticeRequestError } from "./demoTransport";
import { registerPracticeLeaveGuard } from "./demoNavigation";
import type {
  createDemoPracticeTransport,
  DemoPracticeState,
} from "./demoTransport";

type Transport = ReturnType<typeof createDemoPracticeTransport>;
const button =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold disabled:opacity-50";
const blank = (rate = "") =>
  createBlankSharedDraftComposerDraft({
    intended_output: "estimate",
    subject_type: "local",
    local_contact_id: "practice-customer",
    local_home_id: "practice-property",
    labor_rate: rate,
  });

export function PracticeDemoReview({ transport }: { transport: Transport }) {
  const [state, setState] = useState<DemoPracticeState | null>(null);
  const [draft, setDraft] = useState<SharedDraftComposerDraft>(() => blank());
  const [id, setId] = useState<string>(() => crypto.randomUUID());
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState(performance.now());
  const [preview, setPreview] = useState<{ url: string; total: number } | null>(
    null,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const live = useRef(true);
  const busyRef = useRef(false);
  const activeRef = useRef(false);
  const previewUrl = useRef<string | null>(null);
  const workspace = state?.workspace;
  const notice = workspace
    ? retentionNotice(
        workspace.expires_at,
        Date.parse(workspace.expires_at) -
          ((state?.accessDeadline ?? 0) - clock),
      )
    : null;
  const active = verified && state?.status === "active" && notice !== "expired";
  activeRef.current = active;
  const snapshot = active ? workspace?.snapshot : null;
  function clearPreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
  }
  function acceptState(value: DemoPracticeState) {
    setState(value);
    setClock(performance.now());
    setVerified(true);
  }
  useEffect(() => {
    live.current = true;
    let current = true;
    busyRef.current = true;
    setBusy(true);
    setVerified(false);
    void transport
      .state()
      .then((value) => {
        if (current) {
          acceptState(value);
          setError("");
        }
      })
      .catch(() => {
        if (current)
          setError(
            "Practice access could not be verified. Check your connection and approved Demo sign-in, then retry.",
          );
      })
      .finally(() => {
        if (current) {
          busyRef.current = false;
          setBusy(false);
        }
      });
    return () => {
      current = false;
      live.current = false;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, [transport]);
  useEffect(() => {
    const timer = setInterval(() => setClock(performance.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!active) {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
      setPreview(null);
    }
  }, [active]);
  useEffect(() => {
    if (preview && dialog.current) {
      const d = dialog.current;
      d.showModal();
      return () => d.close();
    }
  }, [preview]);
  useEffect(
    () =>
      registerPracticeLeaveGuard(
        () =>
          !dirty ||
          window.confirm(
            "Discard unsaved Practice changes? Saved Drafts will remain available.",
          ),
      ),
    [dirty],
  );
  function mayDiscard() {
    return (
      !dirty ||
      window.confirm(
        "Discard unsaved Practice changes? Saved Drafts will remain available.",
      )
    );
  }
  function openDraft(saved?: PracticeDraft) {
    if (!mayDiscard()) return;
    setId(saved?.id ?? crypto.randomUUID());
    setRevision(saved?.revision ?? 0);
    setDraft(saved?.payload ?? blank(snapshot?.business.laborRate));
    setDirty(false);
    setMessage("");
    clearPreview();
  }
  async function action(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (e) {
      if (live.current) {
        if (!(e instanceof DemoPracticeRequestError && e.kind === "conflict"))
          setVerified(false);
        if (e instanceof DemoPracticeRequestError && e.kind === "denied") {
          setState(null);
          setDraft(blank());
          setDirty(false);
        }
        clearPreview();
        setError(
          e instanceof Error
            ? e.message
            : "Practice is unavailable. Recheck access before continuing.",
        );
      }
    } finally {
      busyRef.current = false;
      if (live.current) setBusy(false);
    }
  }
  useEffect(() => {
    const check = () => {
      if (busyRef.current || !live.current) return;
      void action(reload);
    };
    const timer = setInterval(check, 60000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
    // The transport is stable across same-user token refresh; polling never replaces editor input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport]);
  useEffect(() => {
    if (notice !== "expired") return;
    setDirty(false);
    setDraft(blank());
    setState((old) =>
      old?.workspace && old.status !== "expired"
        ? {
            ...old,
            status: "expired",
            drafts: [],
            workspace: { ...old.workspace, snapshot: null },
          }
        : old,
    );
  }, [notice]);
  async function reload() {
    const value = await transport.state();
    if (live.current) {
      acceptState(value);
      setMessage(
        "Saved work reloaded. Your unsaved editor changes have not been replaced.",
      );
    }
  }
  async function save() {
    if (!workspace || !activeRef.current) return;
    const saved = await transport.save(workspace.id, id, revision, draft);
    if (!live.current) return;
    setRevision(saved.revision);
    setDraft(saved.payload);
    setDirty(false);
    setState((old) =>
      old
        ? {
            ...old,
            drafts: [...old.drafts.filter((d) => d.id !== saved.id), saved],
          }
        : old,
    );
    setMessage(
      "Practice Draft saved in Demo. Choose it from Saved Practice Drafts when you return.",
    );
  }
  async function showPreview() {
    // Recheck pilot access before producing a new downloadable document.
    const value = await transport.state();
    if (!live.current) return;
    acceptState(value);
    if (
      value.status !== "active" ||
      !value.workspace?.snapshot ||
      performance.now() >= (value.accessDeadline ?? 0)
    )
      return;
    let checked: ReturnType<typeof validatePracticePreview>;
    try {
      checked = validatePracticePreview(draft);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Check the scope and line items.",
      );
      return;
    }
    const previewDeadline = value.accessDeadline ?? 0;
    const result = await createEstimatePdf(practiceEstimate(draft), {
      contractorName: value.workspace.snapshot.business.name,
      customerName: "Fictional Customer",
      practice: true,
    });
    if (
      !live.current ||
      !activeRef.current ||
      performance.now() >= previewDeadline
    )
      return;
    clearPreview();
    const url = URL.createObjectURL(result.blob);
    previewUrl.current = url;
    setPreview({ url, total: checked.totalCents });
  }
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
      source: "fictional fixture",
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
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header
        aria-label="Practice environment"
        className="sticky top-0 z-40 border-b-2 border-amber-600 bg-amber-100 px-4 py-3"
      >
        <div className="mx-auto max-w-5xl">
          <strong>DEMO PRACTICE — Fictional data only</strong>
          <p className="text-sm">
            No customer delivery, payments or live transfer. Saved work stays in
            this Demo pilot.
          </p>
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Practice an estimate</h1>
          <button
            className={button}
            disabled={busy}
            onClick={() => {
              window.location.hash = "/contractor";
            }}
          >
            Leave Practice
          </button>
        </div>
        <p>
          This synthetic pilot uses fictional business setup. It does not copy
          your Production account, contact customers or create live Drafts. Use
          fictional details only.
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
            {error}
            {dirty ? " Unsaved edits remain in this tab." : ""}
          </p>
        )}
        {message && (
          <p role="status" className="rounded-lg bg-emerald-50 p-3">
            {message}
          </p>
        )}
        {!verified && (
          <section className="rounded-xl border bg-white p-4">
            <p>
              {error
                ? "Practice access is unavailable."
                : "Checking Practice access…"}
            </p>
            <button
              className={`${button} mt-3`}
              disabled={busy}
              onClick={() => void action(reload)}
            >
              Recheck Practice access
            </button>
          </section>
        )}
        {verified && (
          <section
            aria-label="Practice retention"
            className="rounded-xl border bg-white p-4"
          >
            <h2 className="font-bold">
              {snapshot?.business.name ?? "Synthetic Practice cycle"}
            </h2>
            <p>
              One 30-day cycle from creation. Save Draft before leaving to
              resume later. Unsaved changes are not recovered after closing this
              tab.
            </p>
            {workspace && (
              <p className="mt-2 font-bold">
                Access expires:{" "}
                <time>{new Date(workspace.expires_at).toISOString()}</time>{" "}
                (UTC)
              </p>
            )}
            <p className="mt-2 text-sm">
              Expiry makes saved content unavailable. Automatic deletion and
              renewal are not enabled; stored data may remain after expiry.
              In-app warnings appear in the last 7 days and last day. No email
              is sent.
            </p>
            {notice === "seven_days" && (
              <p role="alert">Practice expires within 7 days.</p>
            )}
            {notice === "one_day" && (
              <p role="alert">Practice expires within 1 day.</p>
            )}
            {(state?.status === "expired" || notice === "expired") && (
              <p role="alert" className="mt-3 font-bold">
                This Practice cycle has expired. Content is unavailable. Renewal
                requires a separate review.
              </p>
            )}
            {state?.status === "not_started" && (
              <button
                className={`${button} mt-3`}
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const next = await transport.start();
                    if (live.current) {
                      acceptState(next);
                      setDraft(
                        blank(next.workspace?.snapshot?.business.laborRate),
                      );
                    }
                  })
                }
              >
                Start Practice with fictional setup
              </button>
            )}
          </section>
        )}
        {active && (
          <>
            <section
              aria-label="Practice actions"
              className="flex flex-wrap gap-2"
            >
              <button
                className={button}
                disabled={busy}
                onClick={() => openDraft()}
              >
                New Practice Draft
              </button>
              <button
                className={button}
                disabled={busy}
                onClick={() => void action(reload)}
              >
                Reload saved work
              </button>
            </section>
            <section
              aria-label="Saved Practice Drafts"
              className="rounded-xl border bg-white p-4"
            >
              <h2 className="font-bold">
                Saved Practice Drafts ({state?.drafts.length}/50)
              </h2>
              {!state?.drafts.length ? (
                <p>
                  No saved Drafts yet. Add a scope and line items below, then
                  Save Draft.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {state.drafts.map((d) => (
                    <button
                      className={button}
                      key={d.id}
                      disabled={busy}
                      onClick={() => openDraft(d)}
                    >
                      {d.payload.title || "Untitled Practice Draft"}
                    </button>
                  ))}
                </div>
              )}
            </section>
            <section className="rounded-xl border bg-white p-4">
              <p className="mb-3 text-sm">
                {dirty
                  ? "Unsaved changes."
                  : revision
                    ? "Saved Practice Draft."
                    : "New unsaved Practice Draft."}{" "}
                Prices and templates are fictional. Example tax is zero.
              </p>
              <ContractorDraftComposer
                estimatePracticeOnly
                draft={draft}
                currentDraftId={revision ? id : null}
                customerOptions={[
                  {
                    key: "local:practice-customer",
                    subjectType: "local",
                    customerId: "practice-customer",
                    label: "Fictional Customer",
                    status: "not_connected",
                    statusLabel: "Practice only",
                    properties: [
                      { id: "practice-property", label: "Fictional property" },
                    ],
                  },
                ]}
                priceBookItems={prices}
                savedWorkTemplates={templates}
                priceBookLoadState="ready"
                canViewPriceBook
                canSave={!busy}
                saving={busy}
                interactionDisabled={busy}
                onChange={(next) => {
                  setDraft(next);
                  setDirty(true);
                }}
                onSave={() => void action(save)}
                onBack={() =>
                  setMessage(
                    "Saved Practice Drafts are listed above. Save changes before leaving.",
                  )
                }
                onRemovePersistedLine={() => undefined}
              />
              <button
                className={`${button} mt-4`}
                disabled={busy}
                onClick={() => void action(showPreview)}
              >
                Preview Practice estimate
              </button>
            </section>
          </>
        )}
      </div>
      {preview && active && (
        <dialog
          ref={dialog}
          onCancel={clearPreview}
          aria-label="Practice estimate preview"
          className="fixed inset-0 z-50 m-0 h-full max-h-full w-full max-w-full bg-amber-50 p-4"
        >
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>
                PRACTICE — NOT A LIVE DOCUMENT · {formatMoney(preview.total)}
              </strong>
              <button autoFocus className={button} onClick={clearPreview}>
                Close preview
              </button>
            </div>
            <p>Fictional Customer · no delivery or payments</p>
            <iframe
              title="Watermarked Practice PDF"
              src={preview.url}
              className="mt-3 min-h-0 flex-1 bg-white"
            />
            <a
              className={`${button} mt-2 text-center`}
              href={preview.url}
              download="PRACTICE-estimate.pdf"
              onClick={(event) => {
                event.preventDefault();
                const url = preview.url;
                void action(async () => {
                  const value = await transport.state();
                  if (!live.current) return;
                  acceptState(value);
                  if (
                    value.status !== "active" ||
                    !value.workspace ||
                    performance.now() >= (value.accessDeadline ?? 0) ||
                    previewUrl.current !== url
                  )
                    return;
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "PRACTICE-estimate.pdf";
                  link.click();
                });
              }}
            >
              Download watermarked PDF
            </a>
          </div>
        </dialog>
      )}
    </main>
  );
}
