import { useEffect, useRef, useState } from "react";
import { ContractorDraftComposer } from "../drafts/ContractorDraftComposer";
import { blankPracticeDraft as blank, examplePracticeDraft } from "./exampleDraft";
import type { SharedDraftComposerDraft } from "../drafts/draftComposerTypes";
import type { ContractorPriceBookItem, EstimateTemplate } from "../../types";
import { createEstimatePdf } from "../../utils/pdfDocuments";
import { formatMoney } from "../../utils/format";
import {
  retentionNotice,
  sanitizePracticeDraft,
  PracticeInputError,
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
const primaryButton =
  "min-h-11 rounded-lg border border-blue-700 bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50";

export function PracticeDemoReview({ transport }: { transport: Transport }) {
  const [state, setState] = useState<DemoPracticeState | null>(null);
  const [draft, setDraft] = useState<SharedDraftComposerDraft>(() => blank());
  const [id, setId] = useState<string>(() => crypto.randomUUID());
  const [revision, setRevision] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [inputError, setInputError] = useState<PracticeInputError | null>(null);
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
  const editor = useRef<HTMLElement>(null);
  const inputErrorSummary = useRef<HTMLParagraphElement>(null);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const restorePreviewFocus = useRef(false);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const live = useRef(true);
  const busyRef = useRef(false);
  const activeRef = useRef(false);
  const previewUrl = useRef<string | null>(null);
  const workspace = state?.workspace;
  const expiresAt = state?.effectiveExpiresAt ?? workspace?.expires_at;
  const notice = expiresAt
    ? retentionNotice(
        expiresAt,
        Date.parse(expiresAt) -
          ((state?.accessDeadline ?? 0) - clock),
      )
    : null;
  const active = verified && state?.status === "active" && notice !== "expired";
  activeRef.current = active;
  const snapshot = active ? workspace?.snapshot : null;
  function clearPreview() {
    restorePreviewFocus.current = Boolean(previewUrl.current);
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
      restorePreviewFocus.current = Boolean(previewUrl.current);
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
  useEffect(() => {
    if (!preview && !busy && restorePreviewFocus.current) {
      restorePreviewFocus.current = false;
      (previewTrigger.current ?? pageHeading.current)?.focus({ preventScroll: true });
    }
  }, [preview, busy, active]);
  useEffect(() => {
    if (!inputError || busy) return;
    const controls = editor.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea');
    const target = Array.from(controls ?? []).find(control =>
      control.getAttribute('aria-label') === inputError.fieldLabel ||
      (inputError.fieldLabel === 'Scope / description' && control.tagName === 'TEXTAREA'));
    if (!target) { inputErrorSummary.current?.focus(); return; }
    target.closest('details')?.setAttribute('open', '');
    const oldDescription = target.getAttribute('aria-describedby');
    target.setAttribute('aria-invalid', 'true');
    target.setAttribute('aria-describedby', 'practice-input-error');
    target.focus();
    target.scrollIntoView({ block: 'center' });
    return () => {
      target.removeAttribute('aria-invalid');
      if (oldDescription) target.setAttribute('aria-describedby', oldDescription);
      else target.removeAttribute('aria-describedby');
    };
  }, [inputError, busy]);
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
    setEditorOpen(true);
    setInputError(null);
    setId(saved?.id ?? crypto.randomUUID());
    setRevision(saved?.revision ?? 0);
    setDraft(saved?.payload ?? blank(snapshot?.business.laborRate));
    setDirty(false);
    setMessage("");
    clearPreview();
  }
  function backToDrafts() {
    if (!mayDiscard()) return;
    setDraft(blank(snapshot?.business.laborRate));
    setDirty(false);
    setEditorOpen(false);
    setInputError(null);
    clearPreview();
    pageHeading.current?.focus();
    window.scrollTo({ top: 0 });
  }
  async function startDraft(example: boolean) {
    const next = state?.status === 'not_started' ? await transport.start() : state;
    if (!live.current || !next?.workspace?.snapshot || next.status !== 'active') return;
    acceptState(next);
    setId(crypto.randomUUID());
    setRevision(0);
    setDraft(example ? examplePracticeDraft(next.workspace.snapshot) : blank(next.workspace.snapshot.business.laborRate));
    setDirty(example);
    setInputError(null);
    setEditorOpen(true);
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
        if (e instanceof PracticeInputError) { setInputError(e); return; }
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
    let checked: SharedDraftComposerDraft;
    try { checked = sanitizePracticeDraft(draft); }
    catch (error) { throw error instanceof PracticeInputError ? error : new PracticeInputError(error instanceof Error ? error.message : 'Check this draft.'); }
    const saved = await transport.save(workspace.id, id, revision, checked);
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
    const checked = validatePracticePreview(draft);
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
  const expired = state?.status === "expired" || notice === "expired";
  const deadlineLabel = expiresAt ? new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(expiresAt)) : null;
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header aria-label="Practice environment" className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm">
        <div className="mx-auto max-w-5xl"><strong>DEMO PRACTICE · Fictional data only</strong><span className="block sm:inline"> No customer delivery or payments.</span></div>
      </header>
      <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 ref={pageHeading} tabIndex={-1} className="text-2xl font-bold outline-none">Practice an estimate</h1>
          <button className={button} disabled={busy} onClick={() => { window.location.hash = "/contractor"; }}>Leave Practice</button>
        </div>
        {!editorOpen && <p className="text-sm text-slate-600">Try a fictional repair, adjust its prices, then preview what a customer would see. Save Draft to return later.</p>}
        {verified && <div className="text-sm" aria-label="Practice access deadline">
          {state?.accessExpiresAt && deadlineLabel
            ? <p className="font-semibold">Access ends <time dateTime={expiresAt}>{deadlineLabel}</time> (your local time).</p>
            : <p>Access deadline unavailable. This pilot may end before its cycle.</p>}
          {state?.accessExpiresAt && notice === 'one_day' && <p role="status" className="font-semibold text-amber-800">Practice access ends within 1 day. Save your draft before leaving.</p>}
          {state?.accessExpiresAt && notice === 'seven_days' && <p role="status" className="text-amber-800">Practice access ends within 7 days.</p>}
        </div>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}{dirty ? " Unsaved edits remain in this tab." : ""}</p>}
        {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm">{message}</p>}
        {!verified && <section className="rounded-xl border bg-white p-4">
          <p>{error ? "Practice access is unavailable." : "Checking Practice access…"}</p>
          <button className={`${button} mt-3`} disabled={busy} onClick={() => void action(reload)}>Recheck Practice access</button>
        </section>}
        {verified && expired && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 font-semibold">Practice access has ended. Saved content is unavailable. Expiry does not delete data; renewal requires separate review.</p>}
        {verified && !expired && !editorOpen && <>
          <section aria-label="Start a Practice draft" className="rounded-xl border bg-white p-4">
            <h2 className="font-bold">Choose how to start</h2>
            <p className="mt-1 text-sm text-slate-600">The sample includes a scope, labor and a repair item. All prices are examples, not recommended rates.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={primaryButton} disabled={busy} onClick={() => void action(() => startDraft(true))}>Try sample repair</button>
              <button className={button} disabled={busy} onClick={() => void action(() => startDraft(false))}>Start blank</button>
            </div>
          </section>
          {active && <section aria-label="Saved Practice Drafts" className="rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Saved Practice Drafts ({state?.drafts.length}/50)</h2><button className={button} disabled={busy} onClick={() => void action(reload)}>Reload saved work</button></div>
            {!state?.drafts.length ? <p className="mt-2 text-sm text-slate-600">No saved Drafts yet. Choose a starting point above, then Save Draft.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {state.drafts.map(saved => <button className={`${button} text-left`} key={saved.id} disabled={busy} onClick={() => openDraft(saved)}><span className="block">{saved.payload.title || "Untitled Practice Draft"}</span><span className="block text-xs font-normal text-slate-600">Continue saved draft · Revision {saved.revision}</span></button>)}
            </div>}
          </section>}
        </>}
        {active && editorOpen && <section ref={editor} aria-label="Practice draft editor" className="rounded-xl border bg-white p-3 md:p-4">
          <p className="mb-3 text-sm text-slate-600">{dirty ? "Unsaved changes." : revision ? "Saved Practice Draft." : "New unsaved Practice Draft."} Save to return later; preview anytime. Example tax is zero.</p>
          <ContractorDraftComposer
            estimatePracticeOnly draft={draft} currentDraftId={revision ? id : null}
            customerOptions={[{ key: "local:practice-customer", subjectType: "local", customerId: "practice-customer", label: "Fictional Customer", status: "not_connected", statusLabel: "Practice only", properties: [{ id: "practice-property", label: "Fictional property" }] }]}
            priceBookItems={prices} savedWorkTemplates={templates} priceBookLoadState="ready" canViewPriceBook
            canSave={!busy} saving={busy} interactionDisabled={busy}
            onChange={next => { setDraft(next); setDirty(true); setInputError(null); }}
            onSave={() => void action(save)} onBack={backToDrafts} backLabel="Back to Practice drafts" onRemovePersistedLine={() => undefined}
            actionBarExtra={<button ref={previewTrigger} aria-label="Preview Practice estimate" className={`${primaryButton} text-sm`} disabled={busy} onClick={() => void action(showPreview)}>Preview estimate</button>}
            inlineFeedback={inputError && <p id="practice-input-error" ref={inputErrorSummary} tabIndex={-1} role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{inputError.message} Your edits remain here.</p>}
          />
        </section>}
        {verified && <details className="rounded-xl border bg-white p-3 text-sm" aria-label="Practice setup and retention">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">Sample setup and data retention</summary>
          <div className="space-y-2 pt-2 text-slate-600">
            <p>{workspace?.snapshot?.business.name || 'Fictional Sample Service Co.'}. Prices, templates and labor rate are fictional. Editing a draft does not update your Price Book or real business settings.</p>
            <p>Save Draft before leaving. Unsaved changes are not recovered after closing the tab. Saved drafts stay in this Demo pilot; no live transfer is available.</p>
            {workspace && <p>Cycle expires: <time>{new Date(workspace.expires_at).toISOString()}</time> (UTC). Pilot access can end earlier.</p>}
            <p>Expiry makes saved content unavailable. Automatic deletion and renewal are not enabled; stored data may remain after expiry. No email is sent.</p>
            <p>This rehearses a draft estimate. Review real customer details, tax, terms and any payment schedule in the real workflow before explicitly sending.</p>
          </div>
        </details>}
      </div>
      {preview && active && <dialog ref={dialog} onCancel={event => { event.preventDefault(); clearPreview(); }} aria-label="Practice estimate preview" className="fixed inset-0 z-50 m-0 h-full max-h-full w-full max-w-full bg-amber-50 p-4">
        <div className="flex h-full flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>PRACTICE — NOT A LIVE DOCUMENT · {formatMoney(preview.total)}</strong><button autoFocus className={button} onClick={clearPreview}>Close preview</button></div>
          <p>Fictional Customer · no delivery or payments</p>
          <iframe title="Watermarked Practice PDF" src={preview.url} className="mt-3 min-h-0 flex-1 bg-white" />
          <a className={`${button} mt-2 text-center`} href={preview.url} download="PRACTICE-estimate.pdf" onClick={event => {
            event.preventDefault(); const url = preview.url;
            void action(async () => {
              const value = await transport.state(); if (!live.current) return; acceptState(value);
              if (value.status !== 'active' || !value.workspace || performance.now() >= (value.accessDeadline ?? 0) || previewUrl.current !== url) return;
              const link = document.createElement('a'); link.href = url; link.download = 'PRACTICE-estimate.pdf'; link.click();
            });
          }}>Download watermarked PDF</a>
        </div>
      </dialog>}
    </main>
  );
}
