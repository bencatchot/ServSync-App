import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { RequestFreeEstimateDeliveryLookup, RequestFreeFinalizedReportLookup, RequestFreeInvoiceDeliveryLookup } from './types';
import './index.css';
import { allowPracticeNavigation } from './features/practice/demoNavigation';

type EntryRequest =
  | { kind: 'app' }
  | { kind: 'practice' }
  | { kind: 'invoice'; bootstrapToken: string | null }
  | { kind: 'estimate'; bootstrapToken: string | null }
  | { kind: 'report'; bootstrapToken: string | null };

let root: Root;
let mountedUrl = window.location.href;
let mountedKind: EntryRequest['kind'] | null = null;
let renderRevision = 0;
let pairedHashUrl: string | null = null;
let activeDeliveryRequest: { controller: AbortController; settled: Promise<void> } | null = null;

function consumeEntryRequest(): EntryRequest {
  const rawHash = window.location.hash.replace(/^#\/?/, '');
  const [route, query = ''] = rawHash.split('?');
  if (route === 'practice-demo') return { kind: 'practice' };
  if (route !== 'invoice-delivery' && route !== 'estimate-delivery' && route !== 'report-delivery') return { kind: 'app' };

  const params = new URLSearchParams(query);
  const hasBootstrapToken = params.has('access');
  const bootstrapToken = hasBootstrapToken ? params.get('access') ?? '' : null;
  if (hasBootstrapToken) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/${route}`);
  }
  return { kind: route === 'invoice-delivery' ? 'invoice' : route === 'estimate-delivery' ? 'estimate' : 'report', bootstrapToken };
}

async function runInvoiceRequest(bootstrapToken: string | null, revision: number) {
  const previousRequest = activeDeliveryRequest;
  if (previousRequest) {
    previousRequest.controller.abort();
    await previousRequest.settled;
  }
  if (revision !== renderRevision) return null;

  const controller = new AbortController();
  let settleRequest!: () => void;
  const request = {
    controller,
    settled: new Promise<void>(resolve => { settleRequest = resolve; }),
  };
  activeDeliveryRequest = request;

  try {
    const { lookupRequestFreeInvoice } = await import('./features/invoices/requestFreeInvoiceDelivery');
    if (revision !== renderRevision) return null;
    return await lookupRequestFreeInvoice(bootstrapToken, { signal: controller.signal });
  } finally {
    settleRequest();
    if (activeDeliveryRequest === request) activeDeliveryRequest = null;
  }
}

async function runEstimateRequest(bootstrapToken: string | null, revision: number) {
  const previousRequest = activeDeliveryRequest;
  if (previousRequest) {
    previousRequest.controller.abort();
    await previousRequest.settled;
  }
  if (revision !== renderRevision) return null;

  const controller = new AbortController();
  let settleRequest!: () => void;
  const request = {
    controller,
    settled: new Promise<void>(resolve => { settleRequest = resolve; }),
  };
  activeDeliveryRequest = request;

  try {
    const { lookupRequestFreeEstimate } = await import('./features/estimates/requestFreeEstimateDelivery');
    if (revision !== renderRevision) return null;
    return await lookupRequestFreeEstimate(bootstrapToken, { signal: controller.signal });
  } finally {
    settleRequest();
    if (activeDeliveryRequest === request) activeDeliveryRequest = null;
  }
}

async function runReportRequest(bootstrapToken: string | null, revision: number) {
  const previousRequest = activeDeliveryRequest;
  if (previousRequest) { previousRequest.controller.abort(); await previousRequest.settled; }
  if (revision !== renderRevision) return null;
  const controller = new AbortController();
  let settleRequest!: () => void;
  const request = { controller, settled: new Promise<void>(resolve => { settleRequest = resolve; }) };
  activeDeliveryRequest = request;
  try {
    const { lookupRequestFreeFinalizedReport } = await import('./features/reports/finalizedReportDelivery');
    if (revision !== renderRevision) return null;
    return await lookupRequestFreeFinalizedReport(bootstrapToken, { signal: controller.signal });
  } finally {
    settleRequest();
    if (activeDeliveryRequest === request) activeDeliveryRequest = null;
  }
}

async function renderInvoice(entry: Extract<EntryRequest, { kind: 'invoice' }>, revision: number) {
  const { RequestFreeInvoiceView } = await import('./features/invoices/RequestFreeInvoiceView');
  if (revision !== renderRevision) return;

  root.render(
    <StrictMode>
      <RequestFreeInvoiceView lookup={null} />
    </StrictMode>,
  );
  mountedKind = 'invoice';

  let bootstrapToken = entry.bootstrapToken;
  entry.bootstrapToken = null;
  let lookup: RequestFreeInvoiceDeliveryLookup;
  try {
    const result = await runInvoiceRequest(bootstrapToken, revision);
    if (result === null) return;
    lookup = result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    lookup = { state: 'error' };
  } finally {
    bootstrapToken = null;
  }

  if (revision !== renderRevision) return;
  root.render(
    <StrictMode>
      <RequestFreeInvoiceView lookup={lookup} />
    </StrictMode>,
  );
}

async function renderEstimate(entry: Extract<EntryRequest, { kind: 'estimate' }>, revision: number) {
  const { RequestFreeEstimateView } = await import('./features/estimates/RequestFreeEstimateView');
  if (revision !== renderRevision) return;

  root.render(
    <StrictMode>
      <RequestFreeEstimateView lookup={null} />
    </StrictMode>,
  );
  mountedKind = 'estimate';

  let bootstrapToken = entry.bootstrapToken;
  entry.bootstrapToken = null;
  let lookup: RequestFreeEstimateDeliveryLookup;
  try {
    const result = await runEstimateRequest(bootstrapToken, revision);
    if (result === null) return;
    lookup = result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    lookup = { state: 'error' };
  } finally {
    bootstrapToken = null;
  }

  if (revision !== renderRevision) return;
  root.render(
    <StrictMode>
      <RequestFreeEstimateView lookup={lookup} />
    </StrictMode>,
  );
}

async function renderReport(entry: Extract<EntryRequest, { kind: 'report' }>, revision: number) {
  const { RequestFreeFinalizedReportView } = await import('./features/reports/RequestFreeFinalizedReportView');
  if (revision !== renderRevision) return;
  root.render(<StrictMode><RequestFreeFinalizedReportView lookup={null} /></StrictMode>);
  mountedKind = 'report';
  let bootstrapToken = entry.bootstrapToken;
  entry.bootstrapToken = null;
  let lookup: RequestFreeFinalizedReportLookup;
  try {
    const result = await runReportRequest(bootstrapToken, revision);
    if (result === null) return;
    lookup = result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    lookup = { state: 'error' };
  } finally { bootstrapToken = null; }
  if (revision !== renderRevision) return;
  root.render(<StrictMode><RequestFreeFinalizedReportView lookup={lookup} /></StrictMode>);
}

async function renderEntry(entry: EntryRequest, force = false) {
  if (!force && entry.kind === mountedKind && (entry.kind === 'app' || entry.kind === 'practice' || entry.bootstrapToken === null)) return;

  mountedUrl = window.location.href;
  const revision = ++renderRevision;
  mountedKind = null;
  root.render(null);

  const previousRequest = activeDeliveryRequest;
  if (previousRequest) {
    previousRequest.controller.abort();
    await previousRequest.settled;
  }
  if (revision !== renderRevision) return;

  if (entry.kind === 'invoice') {
    await renderInvoice(entry, revision);
    return;
  }
  if (entry.kind === 'estimate') {
    await renderEstimate(entry, revision);
    return;
  }
  if (entry.kind === 'report') {
    await renderReport(entry, revision);
    return;
  }

  if (entry.kind === 'practice') {
    const { PracticeDemoEntry } = await import('./features/practice/PracticeDemoEntry');
    if (revision !== renderRevision) return;
    root.render(<StrictMode><PracticeDemoEntry /></StrictMode>);
    mountedKind = 'practice';
    return;
  }

  const { default: App } = await import('./App');
  if (revision !== renderRevision) return;
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  mountedKind = 'app';
}

const onHashChange = (event: HashChangeEvent) => {
  // WebKit can deliver the paired event after a zero-delay timer. Match the
  // navigation itself so a second render cannot discard a consumed access token.
  const paired = event.newURL === pairedHashUrl;
  pairedHashUrl = null;
  if (paired) return;
  if (mountedKind === 'practice' && !allowPracticeNavigation()) {
    window.history.replaceState(null, '', mountedUrl);
    return;
  }
  void renderEntry(consumeEntryRequest(), true);
};

const onPopState = () => {
  pairedHashUrl = new URL(mountedUrl).hash !== window.location.hash
    ? window.location.href
    : null;
  if (mountedKind === 'practice' && !allowPracticeNavigation()) {
    window.history.pushState(null, '', mountedUrl);
    return;
  }
  void renderEntry(consumeEntryRequest(), true);
};

function start() {
  const initialEntry = consumeEntryRequest();
  root = createRoot(document.getElementById('root')!);
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('popstate', onPopState);
  void renderEntry(initialEntry);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    renderRevision += 1;
    activeDeliveryRequest?.controller.abort();
    window.removeEventListener('hashchange', onHashChange);
    window.removeEventListener('popstate', onPopState);
    pairedHashUrl = null;
  });
}

start();
