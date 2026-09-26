import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
export async function verifyJourney({homeowner,owner,contractorId,ref,anonKey,marker,checks,query}) {
 assert.equal(ref,'zpzdkoaubyjtsomccxya');
 const origin='http://127.0.0.1:4187';
 const server=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4187','--strictPort'],{env:{...process.env,VITE_SUPABASE_URL:`https://${ref}.supabase.co`,VITE_SUPABASE_ANON_KEY:anonKey},stdio:'ignore'});
 let browser,page;
 const connections=()=>query(`select id,status from public.homeowner_contractor_connections where homeowner_user_id='${homeowner.id}' and contractor_id='${contractorId}'`);
 const requests=()=>query(`select id,title,description,home_id from public.service_requests where homeowner_user_id='${homeowner.id}' and contractor_id='${contractorId}'`);
 try {
  for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
  execFileSync('npx',['--no-install','agent-browser','--session','discover-journey','open',origin],{stdio:'pipe'});
  execFileSync('npx',['--no-install','agent-browser','--session','discover-journey','wait','--load','networkidle'],{stdio:'pipe'});
  const snapshot=execFileSync('npx',['--no-install','agent-browser','--session','discover-journey','snapshot','-i'],{encoding:'utf8',stdio:'pipe'});assert.ok(snapshot.length>100);
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${origin}/#/profile?slug=${marker}`);
  await expect(page.getByRole('heading',{name:marker,exact:true})).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:'Sign in to connect',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).fill(homeowner.email);await page.getByLabel('Password',{exact:true}).fill(homeowner.password);
  await page.getByRole('main').getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('button',{name:'Set up my property',exact:true})).toBeVisible({timeout:30000});
  assert.equal(connections().length,0);assert.equal(requests().length,0);checks.push('Real UI sign-in retains contractor profile and sends no connection/request');
  await page.getByRole('button',{name:'Set up my property',exact:true}).click();
  await page.getByRole('button',{name:'Add property',exact:true}).click();
  await page.getByLabel('Home nickname',{exact:true}).fill('Sandbox Journey Home');
  await page.getByLabel('Address',{exact:true}).fill('123 Fictional Test Street');
  await page.getByLabel('City',{exact:true}).last().fill('Fairhope');
  await page.locator('input[list="home-state"]').fill('AL');
  await page.getByLabel('ZIP',{exact:true}).fill('36532');
  await page.getByRole('button',{name:'Save profile and add property',exact:true}).click();
  await expect(page.getByText('Profile and new property saved.',{exact:true})).toBeVisible({timeout:30000});
  await page.getByRole('link',{name:'Return to contractor profile',exact:true}).click();
  await expect(page.getByRole('button',{name:'Set up my property',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:`Request connection with ${marker}`,exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('checkbox',{name:/Sandbox Journey Home/}).check();
  await dialog.getByRole('checkbox',{name:/Share my contact info/}).check();
  await dialog.getByRole('checkbox',{name:/Home overview/}).check();
  await dialog.getByRole('checkbox',{name:/^Address/}).check();
  await dialog.getByLabel('Optional message',{exact:true}).fill('Sandbox-only plumbing visit request.');
  await dialog.getByRole('button',{name:'Send connection request',exact:true}).click();
  await expect(page.getByText('Connection request sent',{exact:true})).toBeVisible({timeout:30000});
  let conn=connections();assert.equal(conn.length,1);assert.equal(conn[0].status,'pending');assert.equal(requests().length,0);
  await expect(page.getByRole('button',{name:'Request service',exact:true})).toHaveCount(0);
  checks.push('Property created through UI; exact profile return; explicit pending connection with selected property');
  const denied=await homeowner.c.rpc('servsync_create_service_request',{p_connection_id:conn[0].id,p_category:'Plumbing',p_urgency:'normal',p_title:'Pending must reject',p_description:'Sandbox fixture'});assert.ok(denied.error);assert.equal(requests().length,0);
  const accepted=await owner.c.rpc('servsync_respond_to_connection_request',{p_connection_id:conn[0].id,p_response:'accept'});assert.equal(accepted.error,null);assert.equal(connections()[0].status,'active');
  checks.push('Pending service request denied by backend; owning contractor accepts through canonical authenticated RPC');
  await page.reload();await page.getByRole('button',{name:'Request service',exact:true}).click({timeout:30000});
  await expect(page.getByRole('heading',{name:`Request service from ${marker}`,exact:true})).toBeVisible();
  await page.getByLabel('Short title',{exact:true}).fill('Sandbox fixture faucet leak');
  await page.getByLabel('What do you need help with?',{exact:true}).fill('Sandbox fixture only. Inspect a dripping faucet; no real visit is requested.');
  assert.equal(requests().length,0);
  await page.getByRole('button',{name:'Send request',exact:true}).click();
  await expect.poll(()=>requests().length,{timeout:30000}).toBe(1);
  const row=requests()[0];assert.equal(row.title,'Sandbox fixture faucet leak');assert.ok(row.home_id);assert.match(row.description,/Sandbox fixture only/);
  const delivered=await owner.c.rpc('servsync_contractor_service_requests');assert.equal(delivered.error,null);assert.ok(delivered.data.some(item=>item.id===row.id||item.request_id===row.id),'Contractor can retrieve the exact submitted request');
  checks.push('Owning contractor retrieves the submitted request through the canonical authenticated reader');
  await page.reload();assert.equal(requests().length,1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  await page.screenshot({path:'/tmp/servsync-discover-live-journey.png',fullPage:true});
  checks.push('390px UI opens correct connected service composer; explicit send persists exactly one request with correct property/title/details; reload stable');
 } catch(e){if(page)writeFileSync('/tmp/servsync-journey-failure.txt',await page.locator('body').innerText());throw e;}
 finally {if(browser)await browser.close();server.kill();try{execFileSync('npx',['--no-install','agent-browser','--session','discover-journey','close'],{stdio:'ignore'});}catch{}}
}
