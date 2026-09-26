// Operator-only Sandbox acceptance. Requires owner approval for disposable accounts/data.
// The runtime requires a separate --apply-migration flag for first installation.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
export async function verifyBrowser({actor,ref,anonKey,marker,checks}) {
 assert.equal(ref,'zpzdkoaubyjtsomccxya');
 const origin='http://127.0.0.1:4186';
 const server=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4186','--strictPort'],{env:{...process.env,VITE_SUPABASE_URL:`https://${ref}.supabase.co`,VITE_SUPABASE_ANON_KEY:anonKey},stdio:'ignore'});
 let browser;
 try {
  for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{} await new Promise(r=>setTimeout(r,500));}
  // Public dev-server gut check before authenticated work.
  execFileSync('npx',['--no-install','agent-browser','--session','shortlist-sandbox','open',origin],{stdio:'pipe'});
  execFileSync('npx',['--no-install','agent-browser','--session','shortlist-sandbox','wait','--load','networkidle'],{stdio:'pipe'});
  const snapshot=execFileSync('npx',['--no-install','agent-browser','--session','shortlist-sandbox','snapshot','-i'],{encoding:'utf8',stdio:'pipe'});
  assert.ok(snapshot.length>100,'Nonblank dev-server snapshot');
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(({session,key})=>localStorage.setItem(key,JSON.stringify(session)),{session:actor.session,key:`sb-${ref}-auth-token`});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${origin}/#/homeowner`);
  await page.getByRole('button',{name:'Discover',exact:true}).click({timeout:30000});
  const section=page.getByRole('region',{name:'Find a contractor',exact:true});
  await expect(section.getByRole('heading',{name:marker,exact:true})).toBeVisible({timeout:30000});
  const card=section.locator('article').filter({has:page.getByRole('heading',{name:marker,exact:true})});
  await card.getByRole('button',{name:`Save contractor ${marker}`,exact:true}).click();
  await expect(card.getByRole('button',{name:`Remove saved contractor ${marker}`,exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'Discover',exact:true}).click({timeout:30000});
  await section.getByRole('button',{name:'Saved contractors',exact:true}).click();
  await expect(card.getByRole('button',{name:`Remove saved contractor ${marker}`,exact:true})).toBeVisible();
  await card.getByRole('button',{name:`Remove saved contractor ${marker}`,exact:true}).click();
  await expect(section.getByRole('heading',{name:marker,exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  checks.push('390px full app against live Sandbox: directory, save, reload persistence, saved tab and removal; no overflow or uncaught errors');
 } finally {if(browser)await browser.close();server.kill();try{execFileSync('npx',['--no-install','agent-browser','--session','shortlist-sandbox','close'],{stdio:'ignore'});}catch{}}
}
