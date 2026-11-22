import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decodePrivatePhoto, encodePrivatePhoto, expenseRpc, parseExpenseView } from '../../src/features/expenses/durableGateway';
import { receiptLimit } from '../../src/features/expenses/ledger';

test('3 MiB image fits in 4 MiB base64; oversized and HEIC images are rejected', async()=>{
  const bytes = new Uint8Array(receiptLimit);
  bytes.set([255,216,255]);
  const photo = new File([bytes],'never-send-this-name.jpg',{type:'image/jpeg'});
  const base64 = await encodePrivatePhoto(photo);
  assert.equal(base64.length,4*1024*1024);
  const read = decodePrivatePhoto({media_type:'image/jpeg',base64});
  assert.equal(read.size,receiptLimit);
  assert.equal(read.name,'receipt.jpg');
  await assert.rejects(encodePrivatePhoto(new File([bytes,new Uint8Array(1)],'too-large.jpg',{type:'image/jpeg'})));
  await assert.rejects(encodePrivatePhoto(new File([bytes.subarray(0,3)],'phone.heic',{type:'image/heic'})));
  assert.throws(()=>decodePrivatePhoto({media_type:'image/png',base64:base64+'AAAA'}));
});

test('capture adapter never returns injected profit, entries or receipt bytes',()=>{
  assert.deepEqual(parseExpenseView({kind:'capture',entries:[{vendor:'secret'}],projected_gross_cents:100,base64:'secret'}),{kind:'capture'});
  assert.deepEqual(parseExpenseView({kind:'manager'}),{kind:'unavailable'});
});

test('RPC arguments do not carry actor/tenant or photo filenames and errors do not echo details',async()=>{
  const captured:{name:string;args:Record<string,unknown>}[]=[];
  const client = {rpc: async (name:string,args:Record<string,unknown>) => {
    captured.push({name,args});
    return name.endsWith('receipt') ? {error:{message:'sensitive RPC detail 12345'},data:null}:{error:null,data:null};
  }} as unknown as SupabaseClient;
  const adapter = expenseRpc(client,{kind:'job',id:'job1'});
  await adapter.submit({requestId:'fixture',amountCents:14,category:'Materials',day:'2026-11-22',vendor:'',
    receipt:new File([new Uint8Array([255,216,255])],'photo-very-private.jpg',{type:'image/jpeg'})});
  assert.equal(captured[0].name,'servsync_job_expense_submit');
  assert.equal(captured[0].args.p_media_type,'image/jpeg');
  assert.ok(!JSON.stringify(captured).includes('photo-very-private'));
  assert.ok(!('p_contractor_id' in captured[0].args) && !('actor' in captured[0].args) && !('role' in captured[0].args));
  await assert.rejects(adapter.receipt('some'),{message:'Could not open the receipt. Try again.'});
});
