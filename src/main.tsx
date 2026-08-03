import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const root = createRoot(document.getElementById('root')!);

function requestFreeInvoiceToken() {
  const rawHash = window.location.hash.replace(/^#\/?/, '');
  const [route, query = ''] = rawHash.split('?');
  if (route !== 'invoice-delivery') return null;
  return new URLSearchParams(query).get('access') ?? '';
}

async function renderEntry() {
  const invoiceToken = requestFreeInvoiceToken();
  if (invoiceToken !== null) {
    const { RequestFreeInvoiceView } = await import('./features/invoices/RequestFreeInvoiceView');
    root.render(
      <StrictMode>
        <RequestFreeInvoiceView token={invoiceToken} />
      </StrictMode>,
    );
    return;
  }

  const { default: App } = await import('./App');
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void renderEntry();
