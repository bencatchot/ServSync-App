import { useState } from 'react';
import { ArrowRight, Briefcase, FlaskConical } from 'lucide-react';
import { ExpensePanel } from './ExpensePanel';
import { ReviewFixture, type Actor, type Work } from './reviewFixture';
import type { Scope } from './ledger';
import './review.css';
const work:Work={company:'acme-demo', estimateId:'EST-1042', jobId:null, acceptedPreTaxCents:150000, assigned:[]};
const ledger=new ReviewFixture([work]);
const owner:Actor={company:'acme-demo',role:'owner',user:'demo-owner',active:true};
const tech:Actor={company:'acme-demo',role:'field_tech',user:'demo-tech',active:true};
ledger.as(owner).submit({kind:'estimate',id:'EST-1042'},{requestId:'demo-seed',amountCents:18450,category:'Materials',day:'2026-11-22',vendor:'Bayview Supply (fictional)'});
export function Review() {
  const [role,setRole]=useState('office');
  const [location,setLocation]=useState<'estimate'|'job'>('estimate');
  const [linked,setLinked]=useState(false);
  const applyJob=()=>{work.jobId='JOB-214'; work.assigned=['demo-tech'];setLinked(true);setLocation('job');};
  const scope:Scope=location==='estimate'?{kind:'estimate',id:'EST-1042'}:{kind:'job',id:'JOB-214'};
  return <main className="ex-shell"><header><b><Briefcase size={23}/>ServSync</b><span>Contractor workspace</span></header>
  <aside className="ex-lab"><strong><FlaskConical size={16}/> Fictional preview</strong><p>Use sample data only. Photos stay in this tab. Refresh to reset.</p>
    <label>Review as <select value={role} onChange={e=>{setRole(e.target.value); if(e.target.value==='tech') applyJob();}}><option value="office">Contractor owner</option><option value="tech">Assigned field tech</option></select></label></aside>
  <nav aria-label="Work context"><button aria-pressed={location==='estimate'} disabled={role==='tech'} onClick={()=>setLocation('estimate')}>Estimate</button><ArrowRight size={15}/><button aria-pressed={location==='job'} onClick={applyJob}>{linked?'Linked job':'Open as linked job'}</button></nav>
  <div className="ex-heading"><span>{scope.id} · {location==='estimate'?'Accepted estimate':'Scheduled job'}</span><h1>Kitchen faucet replacement</h1><p>Meadow Lane · Fictional customer</p></div>
  <ExpensePanel key={role+scope.id} scope={scope} gateway={ledger.as(role==='office'?owner:tech)}/></main>;
}
