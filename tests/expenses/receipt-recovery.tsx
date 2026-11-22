import { createRoot } from 'react-dom/client';
import { ExpensePanel } from '../../src/features/expenses/ExpensePanel';
import type { ExpenseGateway, Submission } from '../../src/features/expenses/ledger';
import '../../src/features/expenses/review.css';

const role = new URLSearchParams(location.search).get('role');
const writes: Pick<Submission,'amountCents'|'vendor'>[] = [];
const output = document.getElementById('gateway-writes')!;
output.textContent = '[]';
const gateway: ExpenseGateway = {
  read: () => role === 'owner'
    ? {kind:'manage',entries:[],costsCents:0,acceptedPreTaxCents:null,projectedGrossCents:null}
    : {kind:'capture'},
  submit: (_scope,input) => {
    // Capture every call, including ones that the application should have blocked.
    writes.push({amountCents:input.amountCents,vendor:input.vendor,...(input.receipt ? {photoName:input.receipt.name} : {})});
    output.textContent = JSON.stringify(writes);
  },
  receipt: () => null,
  void: () => {},
};
createRoot(document.getElementById('root')!).render(
  <div className="ex-embedded"><ExpensePanel scope={{kind:'job',id:'fictional-job'}} gateway={gateway}/></div>,
);
