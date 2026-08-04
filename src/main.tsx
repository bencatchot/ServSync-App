import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { RequestFreeInvoiceDeliveryLookup } from './types';
import './index.css';

type EntryRequest =
  | { kind: 'app' }
  | { kind: 'invoice'; bootstrapToken: string | null };

let root: Root;
let mountedKind: EntryRequest['kind'] | null = null;
let renderRevision = 0;
let suppressPairedHashChange = false;
let suppressionTimer: number | null = null;

function consumeEntryRequest(): EntryRequest {
  const rawHash = window.location.hash.replace(/^#\/?/, '');
  const [route, query = ''] = rawHash.split('?');
  if (route !== 'invoice-delivery') return { kind: 'app' };

  const params = new URLSearchParams(query);
  const hasBootstrapToken = params.has('access');
  const bootstrapToken = hasBootstrapToken ? params.get('access') ?? '' : null;
  if (hasBootstrapToken) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/invoice-delivery`);
  }
  return { kind: 'invoice', bootstrapToken };
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
    const { lookupRequestFreeInvoice } = await import('./features/invoices/requestFreeInvoiceDelivery');
    lookup = await lookupRequestFreeInvoice(bootstrapToken);
  } catch {
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

async function renderEntry(entry: EntryRequest, force = false) {
  if (!force && entry.kind === mountedKind && (entry.kind !== 'invoice' || entry.bootstrapToken === null)) return;

  const revision = ++renderRevision;
  mountedKind = null;
  root.render(null);

  if (entry.kind === 'invoice') {
    await renderInvoice(entry, revision);
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

const onHashChange = () => {
  if (suppressPairedHashChange) {
    suppressPairedHashChange = false;
    if (suppressionTimer !== null) window.clearTimeout(suppressionTimer);
    suppressionTimer = null;
    return;
  }
  void renderEntry(consumeEntryRequest(), true);
};

const onPopState = () => {
  suppressPairedHashChange = true;
  if (suppressionTimer !== null) window.clearTimeout(suppressionTimer);
  suppressionTimer = window.setTimeout(() => {
    suppressPairedHashChange = false;
    suppressionTimer = null;
  }, 0);
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
    window.removeEventListener('hashchange', onHashChange);
    window.removeEventListener('popstate', onPopState);
    if (suppressionTimer !== null) window.clearTimeout(suppressionTimer);
  });
}

start();
