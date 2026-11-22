import type { SupabaseClient } from '@supabase/supabase-js';
import { categories, receiptLimit, validateSubmission, type Entry, type LedgerView, type Scope, type Submission } from './ledger';

function fail(action: string): never {
  // Never forward Supabase error details, request bodies, file names, or bytes.
  throw new Error(`Could not ${action}. Try again.`);
}
function object(value: unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string,unknown>;
}
function cents(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}
export function parseExpenseView(value: unknown): LedgerView {
  const o = object(value);
  if (o.kind === 'capture') return {kind:'capture'};
  if (o.kind !== 'manage' || !Array.isArray(o.entries)) return {kind:'unavailable'};
  const costs=cents(o.costs_cents);
  if(costs === null || costs < 0) return {kind:'unavailable'};
  const entries=o.entries.flatMap((raw):Entry[]=>{
    const e=object(raw);
    const amount=cents(e.amount_cents);
    if(typeof e.id!=='string'||typeof e.created_at!=='string'||amount===null||amount<=0||
      typeof e.vendor!=='string'||typeof e.purchase_date!=='string'||!categories.includes(e.category as Entry['category'])) return [];
    return [{id:e.id,cursor:e.created_at,amountCents:amount,vendor:e.vendor,day:e.purchase_date,category:e.category as Entry['category'],hasReceipt:e.has_receipt===true}];
  });
  return {kind:'manage', entries,costsCents:costs,acceptedPreTaxCents:cents(o.accepted_pre_tax_cents),projectedGrossCents:cents(o.projected_gross_cents)};
}
export async function encodePrivatePhoto(file:File) {
  if (file.size < 1 || file.size > receiptLimit || !['image/jpeg','image/png'].includes(file.type)) return fail('read this photo as a JPG or PNG up to 3 MB');
  const bytes=new Uint8Array(await file.arrayBuffer());
  let text='';
  for(let i=0;i<bytes.length;i+=0x8000) text += String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(text);
}
export function decodePrivatePhoto(value:unknown):File {
  const {media_type:type,base64}=object(value);
  if((type!=='image/jpeg'&&type!=='image/png')||typeof base64!=='string'||base64.length<4||base64.length>Math.ceil(receiptLimit/3)*4) return fail('open the receipt');
  const decoded=atob(base64);
  if(decoded.length>receiptLimit) return fail('open the receipt');
  return new File([Uint8Array.from(decoded,c=>c.charCodeAt(0))], type==='image/png'?'receipt.png':'receipt.jpg', {type});
}

export type ExpenseTech = {id:string;name:string;assigned:boolean};
export const expenseRpc = (client:SupabaseClient,scope:Scope) => {
  const args={p_kind:scope.kind,p_id:scope.id};
  return {
    async read(before?:Entry) {
      const {data,error}=await client.rpc('servsync_job_expense_view',{...args,p_before:before?.cursor??null,p_before_id:before?.id??null});
      if(error) return fail('load private expenses');
      return parseExpenseView(data);
    },
    async submit(input:Submission) {
      validateSubmission(input);
      const photo=input.receipt ? await encodePrivatePhoto(input.receipt):null;
      const {error}=await client.rpc('servsync_job_expense_submit',{...args,p_request_id:input.requestId,p_amount_cents:input.amountCents,
        p_purchase_date:input.day,p_category:input.category,p_vendor:input.vendor,p_media_type:input.receipt?.type??null,p_photo_base64:photo});
      if(error) return fail('record the expense');
    },
    async receipt(id:string) {
      // Session-scoped authenticated RPC over POST; no signed/public URL and no persistent app cache.
      const {data,error}=await client.rpc('servsync_job_expense_receipt',{...args,p_expense_id:id});
      if(error) return fail('open the receipt');
      return decodePrivatePhoto(data);
    },
    async void(id:string) {
      const {error}=await client.rpc('servsync_job_expense_void',{...args,p_expense_id:id});
      if(error) return fail('correct the expense');
    },
    async techs():Promise<ExpenseTech[]> {
      const {data,error}=await client.rpc('servsync_job_expense_techs',{p_job_id:scope.id});
      if(error || !Array.isArray(data)) return fail('load job technicians');
      return data.flatMap(raw=>{
        const r=object(raw);
        return typeof r.id==='string'&&typeof r.name==='string'?[{id:r.id,name:r.name,assigned:r.assigned===true}]:[];
      });
    },
    async assign(id:string,assigned:boolean) {
      const {error}=await client.rpc('servsync_set_job_expense_tech',{p_job_id:scope.id,p_member_id:id,p_assigned:assigned});
      if(error) return fail('change the job assignment');
    }
  };
};
