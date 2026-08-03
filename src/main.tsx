import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const root = createRoot(document.getElementById('root')!);

type EntryTarget =
  | { kind: 'app' }
  | { kind: 'invoice'; token: string };

let mountedTarget: EntryTarget | null = null;
let renderRevision = 0;

function requestFreeInvoiceToken() {
  const rawHash = window.location.hash.replace(/^#\/?/, '');
  const [route, query = ''] = rawHash.split('?');
  if (route !== 'invoice-delivery') return null;
  return new URLSearchParams(query).get('access') ?? '';
}

function currentEntryTarget(): EntryTarget {
  const invoiceToken = requestFreeInvoiceToken();
  return invoiceToken === null
    ? { kind: 'app' }
    : { kind: 'invoice', token: invoiceToken };
}

function sameEntryTarget(left: EntryTarget | null, right: EntryTarget) {
  return left?.kind === right.kind
    && (left?.kind !== 'invoice' || right.kind !== 'invoice' || left.token === right.token);
}

async function renderEntry() {
  const target = currentEntryTarget();
  if (sameEntryTarget(mountedTarget, target)) return;

  const revision = ++renderRevision;
  mountedTarget = null;
  root.render(null);

  if (target.kind === 'invoice') {
    const { RequestFreeInvoiceView } = await import('./features/invoices/RequestFreeInvoiceView');
    if (revision !== renderRevision) return;
    root.render(
      <StrictMode>
        <RequestFreeInvoiceView key={target.token} token={target.token} />
      </StrictMode>,
    );
    mountedTarget = target;
    return;
  }

  const { default: App } = await import('./App');
  if (revision !== renderRevision) return;
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  mountedTarget = target;
}

const onHashChange = () => void renderEntry();
window.addEventListener('hashchange', onHashChange);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    renderRevision += 1;
    window.removeEventListener('hashchange', onHashChange);
  });
}

void renderEntry();
