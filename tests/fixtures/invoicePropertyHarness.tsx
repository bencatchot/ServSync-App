import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InvoicePropertyField } from '../../src/features/invoices/InvoicePropertyField';
import type { ContractorLocalContact } from '../../src/types';
const date = '2026-11-19T12:00:00Z';
const local: ContractorLocalContact = { id: 'fictional-contact', contractor_id: 'fictional-business', display_name: 'Fictional Customer', email: '', phone: '', notes: '', created_at: date, updated_at: date, homes: ['Fictional first home', 'Fictional second home'].map((nickname, i) => ({ id: `fictional-home-${i}`, local_contact_id: 'fictional-contact', contractor_id: 'fictional-business', nickname, address_line1: `${i + 1} Demo Lane`, address_line2: '', city: 'Example', state: 'AL', zip_code: '36532', home_type: '', square_feet: '', year_built: '', notes: '', created_at: date, updated_at: date })) };
export function mountInvoicePropertyHarness() {
  function Harness() {
    const [id, setId] = useState('');
    const [linked, setLinked] = useState(false);
    const [open, setOpen] = useState(true);
    return <main><button onClick={() => { setOpen(!open); setId(''); }}>Toggle editor</button><button onClick={() => setLinked(!linked)}>Toggle source link</button>
      {open && <InvoicePropertyField homeId="" localHomeId={id} connection={null} local={local} linked={linked} disabled={false} onChange={(_home, localHome) => setId(localHome)} />}
      <output data-testid="selection">{id}</output></main>;
  }
  const host = document.createElement('div'); document.body.replaceChildren(host); createRoot(host).render(<Harness />);
}
