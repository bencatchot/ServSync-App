import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Camera, Check, ChevronDown, LockKeyhole, Plus, ReceiptText, X } from 'lucide-react';
import { categories, centsFromText, type Category, type ExpenseGateway, type Scope } from './ledger';

const usd = (c: number) => new Intl.NumberFormat('en-US',{style:'currency', currency:'USD'}).format(c / 100);
function today() { const d = new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); }

export function ExpensePanel({ gateway, scope }: {gateway:ExpenseGateway; scope:Scope}) {
  const [amount,setAmount] = useState('');
  const [vendor,setVendor] = useState('');
  const [day,setDay] = useState(today);
  const [category,setCategory] = useState<Category>('Materials');
  const [file,setFile] = useState<File>();
  const [opened,setOpened] = useState(false);
  const [revision,refresh] = useState(0);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [preview,setPreview] = useState<File | null>(null);
  const [url,setUrl] = useState('');
  const [voidId,setVoidId] = useState<string | null>(null);
  const submitKey = useRef(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const ident = useId();
  useEffect(() => {
    if (!preview) { setUrl(''); return; }
    const next = URL.createObjectURL(preview);
    setUrl(next); dialog.current?.showModal(); closeButton.current?.focus();
    return () => { URL.revokeObjectURL(next); };
  },[preview]);
  const view = gateway.read(scope);
  if (view.kind === 'unavailable') return <section className="ex-card"><h2>Expenses unavailable</h2><p>You don’t have access to expenses for this work.</p></section>;
  const isManager = view.kind === 'manage';
  function save(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const cents = centsFromText(amount);
      if (cents === null) throw Error('Enter a positive amount, such as 24.95.');
      gateway.submit(scope, {amountCents:cents, vendor, day, category, receipt:file, requestId:submitKey.current});
      setMessage(file ? 'Expense recorded with its receipt.' : 'Expense recorded.'); setAmount(''); setVendor(''); setFile(undefined); setOpened(false);
      submitKey.current = crypto.randomUUID(); refresh(revision+1);
      if (fileInput.current) fileInput.current.value = '';
      if (cameraInput.current) cameraInput.current.value = '';
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not record expense.'); }
  }
  return <section className="ex-card">
    <div className="ex-top"><div><span className="ex-private"><LockKeyhole size={13}/> Contractor only</span><h2>{isManager ? 'Job expenses' : 'Record an expense'}</h2>
      <p>{isManager ? 'Direct costs for this work. Never included on customer documents.' : 'Enter what you spent on this assigned job. A receipt is optional.'}</p></div></div>
    {view.kind === 'manage' && <div className="ex-metrics">
      <div><span>Accepted estimate · before tax</span><strong>{view.acceptedPreTaxCents === null ? 'Not available' : usd(view.acceptedPreTaxCents)}</strong></div>
      <div><span>Recorded direct costs</span><strong>{usd(view.costsCents)}</strong></div>
      <div className="ex-highlight"><span>Projected gross profit*</span><strong>{view.projectedGrossCents === null ? 'Not available' : usd(view.projectedGrossCents)}</strong></div>
    </div>}
    {isManager && <p className="ex-hint">*Based only on recorded costs. Not cash collected or company net income.</p>}
    {message && <p role="status" className="ex-success"><Check size={16}/>{message}</p>}
    {isManager && !opened && <button className="ex-primary" onClick={()=>{setOpened(true);setMessage('');}}><Plus size={17}/> Add expense</button>}
    {(opened || !isManager) && <form onSubmit={save} className="ex-form">
      <div className="ex-fields"><label>Amount ($)<input required autoComplete="off" inputMode="decimal" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
      <label>Purchase date<input type="date" required value={day} onChange={e=>setDay(e.target.value)}/></label>
      <label>Category<select value={category} onChange={e=>setCategory(e.target.value as Category)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label>Vendor <small>(optional)</small><input maxLength={140} value={vendor} placeholder="e.g. Supply house" onChange={e=>setVendor(e.target.value)}/></label></div>
      <div className="ex-receipt"><Camera size={19}/><strong>Receipt photo <small>(optional JPG or PNG, up to 8 MB)</small></strong>
      <div className="ex-actions"><button type="button" onClick={()=>cameraInput.current?.click()}>Take photo</button><button type="button" onClick={()=>fileInput.current?.click()}>Choose photo</button></div>
      <input hidden ref={cameraInput} aria-label="Take receipt photo" type="file" accept="image/jpeg,image/png" capture="environment" onChange={e=>{if (e.target.files?.[0]) setFile(e.target.files[0]);}}/>
      <input hidden ref={fileInput} id={ident} aria-label="Choose receipt photo" type="file" accept="image/jpeg,image/png" onChange={e=>{if (e.target.files?.[0]) setFile(e.target.files[0]);}}/>
      {file && <small>Attached: {file.name}</small>}</div>
      {error && <div role="alert" className="ex-error">{error}</div>}
      <div className="ex-actions"><button className="ex-primary" type="submit">Record expense</button>{isManager && <button type="button" onClick={()=>{setOpened(false); setFile(undefined); setError(''); setAmount(''); setVendor('');}}>Cancel</button>}</div></form>}
    {view.kind === 'manage' && <div className="ex-entries"><h3>Recorded expenses <span>{view.entries.length}</span></h3>
      {view.entries.length === 0 && <p>No expenses recorded for this work yet.</p>}
      {view.entries.map(e=><article key={e.id}><div className="ex-row"><ReceiptText size={20}/><div><b>{e.vendor || e.category}</b><small>{e.day} · {e.category}</small></div><strong>{usd(e.amountCents)}</strong></div>
      <div className="ex-links">{e.hasReceipt && <button onClick={()=>setPreview(gateway.receipt(scope,e.id))}>View receipt</button>}
      {voidId===e.id ? <><span>Remove from job costs?</span><button onClick={()=>{gateway.void(scope,e.id);setVoidId(null);setMessage('Expense removed from job costs.');refresh(revision+1);}}>Yes, remove</button><button onClick={()=>setVoidId(null)}>Keep</button></> : <button onClick={()=>setVoidId(e.id)}>Correct an entry <ChevronDown size={12}/></button>}</div></article>)}</div>}
    {preview && <dialog ref={dialog} onClose={()=>setPreview(null)}><div className="ex-top"><h3>Private receipt</h3><button ref={closeButton} aria-label="Close receipt" onClick={()=>dialog.current?.close()}><X size={16}/></button></div>{url && <img src={url} alt="Attached purchase receipt"/>}</dialog>}
  </section>;
}
