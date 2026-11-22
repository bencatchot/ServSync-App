import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LockKeyhole } from 'lucide-react';
import { ExpensePanel } from './ExpensePanel';
import { expenseRpc, type ExpenseTech } from './durableGateway';
import type { ExpenseGateway, LedgerView, Scope } from './ledger';
import './review.css';

type OpenState = LedgerView | {kind:'loading'} | {kind:'error'};
function OpenExpenseDrawer({client,scope,close}:{client:SupabaseClient;scope:Scope;close:()=>void}) {
  const remote=useMemo(()=>expenseRpc(client,{kind:scope.kind,id:scope.id}),[client,scope.kind,scope.id]);
  const [view,setView]=useState<OpenState>({kind:'loading'});
  const [techs,setTechs]=useState<ExpenseTech[]|null>(null);
  const [more,setMore]=useState(false);
  const [assignmentError,setAssignmentError]=useState(false);
  const [savingTech,setSavingTech]=useState(false);
  const [assignmentsOpen,setAssignmentsOpen]=useState(false);
  useEffect(()=>{
    let live=true;
    void remote.read().then(v=>{
      if(!live) return;
      setView(v);setMore(v.kind==='manage'&&v.entries.length===25);
    }).catch(()=>{if(live) setView({kind:'error'});});
    return ()=>{live=false;};
  },[remote]);
  async function sync() {
    try {
      const v=await remote.read();
      setView(v);setMore(v.kind==='manage'&&v.entries.length===25);
    } catch { setView({kind:'error'}); }
  }
  async function loadMore() {
    if(view.kind!=='manage'||!view.entries.length) return;
    const next=await remote.read(view.entries[view.entries.length-1]);
    if(next.kind!=='manage') {setView(next);setMore(false);return;}
    const existing=new Set(view.entries.map(e=>e.id));
    setView({...next,entries:[...view.entries,...next.entries.filter(e=>!existing.has(e.id))]});
    setMore(next.entries.length===25);
  }
  async function openAssignments() {
    setAssignmentsOpen(true);setAssignmentError(false);
    try {setTechs(await remote.techs());} catch {setAssignmentError(true);}
  }
  async function changeAssignment(tech:ExpenseTech) {
    if(savingTech) return;
    setSavingTech(true);setAssignmentError(false);
    try {
      await remote.assign(tech.id,!tech.assigned);
      setTechs(await remote.techs());
    } catch {setAssignmentError(true);} finally {setSavingTech(false);}
  }
  if(view.kind==='loading'||view.kind==='error') return <aside className="ex-card"><p role="status">{view.kind==='loading'?'Loading private expenses…':'Private expenses aren’t available right now.'}</p><button type="button" onClick={close}>Close</button></aside>;
  const ledger:LedgerView=view.kind==='manage'&&more ? {...view,loadMore}:view;
  const gateway:ExpenseGateway={
    read:()=>ledger,receipt:(_scope,id)=>remote.receipt(id),
    submit:async(_scope,input)=>{await remote.submit(input);await sync();},
    void:async(_scope,id)=>{await remote.void(id);await sync();}
  };
  return <div className="space-y-3">
    <ExpensePanel gateway={gateway} scope={scope}/>
    <div className="ex-actions">
      <button type="button" onClick={close}>Close expenses</button>
      {scope.kind==='job' && view.kind==='manage' && !assignmentsOpen && <button type="button" onClick={()=>void openAssignments()}>Field-tech assignment (optional)</button>}
    </div>
    {scope.kind==='job' && view.kind==='manage' && assignmentsOpen && <fieldset className="ex-card">
      <legend>Who can record expenses on this job?</legend>
      <p>Optional. You can always record expenses yourself. Assigned techs don’t see totals or receipts.</p>
      {assignmentError && <p role="alert">Assignments could not be loaded or confirmed. <button type="button" onClick={()=>void openAssignments()}>Retry</button></p>}
      {!techs && !assignmentError && <p role="status">Loading technicians…</p>}
      {techs?.length===0 && <p>No active field technicians. No assignment is needed.</p>}
      {techs?.map(tech=><label key={tech.id} className="flex gap-2 py-1"><input type="checkbox" checked={tech.assigned} disabled={savingTech} onChange={()=>void changeAssignment(tech)}/>{tech.name}</label>)}
    </fieldset>}
  </div>;
}

export function DurableExpenseDrawer({client,scope}:{client:SupabaseClient;scope:Scope}) {
  const [open,setOpen]=useState(false);
  return <div className="ex-embedded">
    {open ? <OpenExpenseDrawer client={client} scope={scope} close={()=>setOpen(false)}/> : <button type="button" onClick={()=>setOpen(true)}><LockKeyhole size={16}/> Private expenses</button>}
  </div>;
}
