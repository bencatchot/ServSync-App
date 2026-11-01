import { useMemo, useState } from 'react';
import { BusinessPracticeEstimate } from '../../src/features/practice/BusinessPracticeEstimate';
import { sanitizeSnapshot } from '../../src/features/practice/contracts';
import { DurableDraftWorkspace } from '../../src/features/drafts/DurableDraftWorkspace';
import type { DurableDraftOpenTarget } from '../../src/features/drafts/durableDraftComposerIntegration';
const contractorId='00000000-0000-4000-8000-000000000201';
const customerId='00000000-0000-4000-8000-000000000205';
const homeId='00000000-0000-4000-8000-000000000206';
const capabilities={contractorId,canReadDrafts:true,canPersistDraft:true,canImportLegacyDraft:true,canLaunchJob:true,canLaunchEstimate:true,canLaunchInvoice:false};
export default function BusinessPracticeHarness() {
  const [version,setVersion]=useState(1), [failure,setFailure]=useState(false), [work,setWork]=useState(false);
  const [target,setTarget]=useState<DurableDraftOpenTarget|null>(null), [stages,setStages]=useState(0), [calls,setCalls]=useState<string[]>([]);
  const client=useMemo(()=>({rpc:async(name:string)=>{setCalls(v=>[...v,name]); throw new Error('Synthetic response lost');},from:()=>{throw new Error('Unexpected table call');}}),[]);
  return <main className="mx-auto max-w-6xl p-4">
    <button onClick={()=>setVersion(v=>v+1)}>Change fictional source</button><button onClick={()=>setFailure(v=>!v)}>Toggle source failure</button>
    <button onClick={()=>{setWork(false);setTarget(null);}}>Close unsaved Work</button>
    <output data-testid="stages">{stages}</output><output data-testid="rpc-calls">{JSON.stringify(calls)}</output>
    <div hidden={work}><BusinessPracticeEstimate identity="synthetic-owner:synthetic-business" businessName="Fictional Company" canStage={!work} loadSetup={async()=>{
      if(failure)throw new Error('Synthetic setup read failed; Practice is unchanged.');
      return sanitizeSnapshot({business:{name:'Fictional Company',laborRate:'80'},prices:[{id:'price',title:'Fixture price',customer_description:'Customer-safe description',line_type:'material',unit:'each',default_unit_price_cents:version===1?12500:20000,labor_hours:null}],templates:[{id:'template',name:'Fixture template',scope:'Fictional repair scope',line_items:[{line_type:'equipment',line_title:'Fixture equipment',description:'Long detail',quantity:1,unit:'each',unit_price_cents:version===1?12500:20000,sort_order:5}]}]});
    }} stageDraft={(draft,practiceHandoff)=>{setStages(n=>n+1);setTarget({kind:'new',initialDraft:draft,practiceHandoff});setWork(true);}} /></div>
    {work && <DurableDraftWorkspace mode="editor" client={client} capabilities={capabilities} target={target} legacyDrafts={[]}
      customerOptions={[{key:`connected:${customerId}`,subjectType:'connected',customerId,label:'Fictional real-work fixture',status:'connected',statusLabel:'Connected',properties:[{id:homeId,label:'Fixture home'}]}]}
      customerLabel={()=>'Fixture'} propertyLabel={()=>'Fixture home'} onStartNew={()=>undefined} onOpenTarget={setTarget} onBack={()=>{setWork(false);setTarget(null);}}
      launchEnabled onRefreshCapabilities={async()=>capabilities} onLoadOutput={async()=>{throw new Error('Unexpected launch');}} onAdoptOutput={()=>{throw new Error('Unexpected launch');}} />}
  </main>;
}
