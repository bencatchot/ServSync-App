import { expect, test, type Page } from '@playwright/test';
async function mount(page:Page) {
  await page.route(/\/src\/App\.tsx(?:\?.*)?$/,r=>r.fulfill({contentType:'text/javascript',body:"export { default } from '/tests/fixtures/BusinessPracticeHarness.tsx';"}));
  await page.goto('/#/contractor?practice=estimate'); await page.reload();
}
async function setup(page:Page) { await page.getByRole('button',{name:'Read my business setup',exact:true}).click(); await page.getByRole('button',{name:'Use this setup for new practice',exact:true}).click(); await page.getByRole('button',{name:'Start new practice estimate',exact:true}).click(); }
async function template(page:Page,title='Fictional repair') { await page.getByRole('button',{name:'Choose template',exact:true}).click(); await page.getByTestId('durable-draft-template-option').click(); await page.getByLabel('What needs doing?',{exact:true}).fill(title); }
async function confirm(page:Page) { await expect(page.getByRole('button',{name:'Confirm and open new Draft',exact:true})).toBeDisabled(); await page.getByLabel('Destination',{exact:true}).selectOption('synthetic-owner:synthetic-business'); await page.getByRole('button',{name:'Confirm and open new Draft',exact:true}).click(); }
for(const mobile of [false,true]) {
  test(`snapshot refresh/resume/PDF preserves original ${mobile?'mobile':'desktop'}`,async({page},info)=>{
    await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000}); const mutations:string[]=[]; page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))mutations.push(r.url());});
    await mount(page); await setup(page); await template(page);
    await expect(page.getByLabel('Draft estimate line item 1 description',{exact:true})).toHaveValue('Fixture equipment');
    await expect(page.getByLabel('Draft estimate line item 1 unit price',{exact:true})).toHaveValue('125.00');
    await page.getByRole('button',{name:'Preview customer estimate',exact:true}).click();
    const href=await page.getByRole('link',{name:'Open customer PDF preview'}).getAttribute('href');
    const pdf=await page.evaluate(async url=>(await fetch(url!)).text(),href); expect(pdf).toContain('%PDF');expect(pdf).toContain('PRACTICE');expect(pdf).toContain('125.00');
    await page.getByRole('button',{name:'Browse items',exact:true}).click(); await page.getByRole('checkbox',{name:'Select Fixture price'}).check(); await page.getByRole('button',{name:/Add 1 item to/}).click(); await expect(page.getByLabel('Draft estimate line item 2 unit price',{exact:true})).toHaveValue('125.00');
    await page.getByRole('button',{name:'Change fictional source'}).click(); await page.getByRole('button',{name:'Review refreshed business setup',exact:true}).click();
    await expect(page.getByRole('region',{name:'Review setup snapshot'})).toContainText('Existing estimates keep their original snapshot');
    await page.getByRole('button',{name:'Use this setup for new practice',exact:true}).click();
    await expect(page.getByLabel('Draft estimate line item 1 unit price',{exact:true})).toHaveValue('125.00');
    await page.getByRole('button',{name:'Start new practice estimate',exact:true}).click(); await template(page,'Second practice');
    await expect(page.getByLabel('Draft estimate line item 1 unit price',{exact:true})).toHaveValue('200.00');
    await page.getByLabel('Resume practice estimate').selectOption({label:'Fictional repair · setup v1'}); await page.reload();
    await expect(page.getByLabel('What needs doing?',{exact:true})).toHaveValue('Fictional repair'); await expect(page.getByLabel('Draft estimate line item 1 unit price',{exact:true})).toHaveValue('125.00');
    await page.getByRole('button',{name:'Toggle source failure'}).click();await page.getByRole('button',{name:'Review refreshed business setup',exact:true}).click();await expect(page.getByRole('alert')).toContainText('unchanged');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); await page.screenshot({path:info.outputPath('practice-business.png'),fullPage:true});expect(mutations).toEqual([]);
  });
}
test('confirmed handoff reopens before Save, blocks implicit launch and ambiguous save replay after Practice edits',async({page})=>{
  await mount(page);await setup(page);await template(page);await page.getByRole('button',{name:'Review transfer to a new real Draft',exact:true}).click();await confirm(page);
  await expect(page.getByTestId('stages')).toHaveText('1');await expect(page.getByText('New unsaved Draft copied from Practice.',{exact:false})).toBeVisible();await expect(page.getByTestId('rpc-calls')).toHaveText('[]');
  await page.reload();await page.getByRole('button',{name:'Review previous handoff',exact:true}).click();await expect(page.getByText('Reopen the original unsaved copy?',{exact:true})).toBeVisible();await confirm(page);
  await page.getByLabel('Customer',{exact:true}).fill('Fictional'); await page.getByRole('option',{name:/Fictional real-work fixture/}).click();
  await page.getByRole('button',{name:'Create Estimate',exact:true}).click();await expect(page.getByTestId('durable-draft-launch-error')).toContainText('Save this transferred Draft');await expect(page.getByTestId('rpc-calls')).toHaveText('[]');
  await page.getByRole('button',{name:'Save Draft',exact:true}).click();await expect(page.getByTestId('rpc-calls')).toHaveText('["servsync_save_work_draft"]');
  await page.getByRole('button',{name:'Save Draft',exact:true}).click(); await expect(page.getByTestId('durable-draft-save-error')).toContainText('cannot safely start another save'); await expect(page.getByTestId('rpc-calls')).toHaveText('["servsync_save_work_draft"]');
  await page.getByRole('button',{name:'Close unsaved Work'}).click(); await page.getByLabel('What needs doing?',{exact:true}).fill('Edited after uncertain save');
  await page.getByRole('button',{name:'Review previous handoff',exact:true}).click(); await expect(page.getByRole('alert')).toContainText('cannot be replayed');
  await page.reload();await page.getByRole('button',{name:'Review previous handoff',exact:true}).click();await expect(page.getByRole('alert')).toContainText('cannot be replayed');
});
test('unavailable tab storage prevents handoff while keeping current inputs open',async({page})=>{
  await mount(page);await setup(page);await template(page);
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('servsync.businessPractice'))throw new Error('Synthetic storage unavailable');original.call(this,k,v);};});
  await page.getByLabel('What needs doing?',{exact:true}).fill('Keep this open');await expect(page.getByRole('alert')).toContainText('could not be saved');
  await page.getByRole('button',{name:'Review transfer to a new real Draft',exact:true}).click();await confirm(page);await expect(page.getByTestId('stages')).toHaveText('0');await expect(page.getByLabel('What needs doing?',{exact:true})).toHaveValue('Keep this open');
});
