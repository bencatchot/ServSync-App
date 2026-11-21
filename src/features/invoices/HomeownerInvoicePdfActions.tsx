import React from 'react';
import { Download, FileText } from 'lucide-react';
import type { Invoice } from '../../types';
import type { InvoicePdfContext } from '../../utils/pdfDocuments';

type InvoicePdfAction = (invoice: Invoice, context: InvoicePdfContext) => Promise<unknown>;

interface Props {
  invoice: Invoice;
  context: InvoicePdfContext;
  buttonClass: string;
  onPreview: InvoicePdfAction;
  onDownload: InvoicePdfAction;
  onError: (error: unknown, fallback: string) => void;
}

export function HomeownerInvoicePdfActions({ invoice, context, buttonClass, onPreview, onDownload, onError }: Props) {
  return (
    <React.Fragment>
      <button type="button" className={buttonClass}
        onClick={() => void onPreview(invoice, context).catch(error => onError(error, 'Unable to preview invoice PDF.'))}>
        <FileText size={16} />
        Preview PDF
      </button>
      <button type="button" className={buttonClass}
        onClick={() => void onDownload(invoice, context).catch(error => onError(error, 'Unable to download invoice PDF.'))}>
        <Download size={16} />
        Download PDF
      </button>
    </React.Fragment>
  );
}
