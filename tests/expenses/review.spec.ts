import { expect, test } from '@playwright/test';
test('private expense rehearsal: customer data never loaded, receipt and totals follow conversion, tech cannot see profit',async({page})=>{
  const appCalls:string[]=[];
  page.on('request',r=>{if(r.method()!=='GET' || /\/rest\/v1\/|\/storage\/v1\/|\/api\//.test(r.url()))appCalls.push(r.url());});
  await page.goto('/job-expenses-preview.html');
  await expect(page.getByRole('heading',{name:'Job expenses'})).toBeVisible();
  await page.getByRole('button',{name:'Add expense'}).click();
  await page.getByLabel('Amount ($)',{exact:true}).fill('15.50');
  await page.getByLabel('Vendor').fill('Sample Plumbing');
  await page.locator('input[type=file]').last().setInputFiles({name:'fiction.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/xp8AAAAASUVORK5CYII=','base64')});
  await page.getByRole('button',{name:'Record expense',exact:true}).click();
  await expect(page.getByText('$200.00',{exact:true})).toBeVisible();
  await expect(page.getByText('$1,300.00',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'View receipt'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Close receipt'}).click();
  await page.getByRole('button',{name:'Open as linked job'}).click();
  await expect(page.getByText('Sample Plumbing')).toHaveCount(1);
  await page.getByLabel('Review as').selectOption('tech');
  await expect(page.getByText(/projected gross profit/i)).toHaveCount(0);
  await expect(page.getByText('Sample Plumbing')).toHaveCount(0);
  await page.getByLabel('Amount ($)',{exact:true}).fill('10.01');
  await page.getByRole('button',{name:'Record expense',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Expense recorded.');
  await page.getByLabel('Review as').selectOption('office');
  await expect(page.getByText('$210.01',{exact:true})).toBeVisible();
  await expect(page.getByText('$1,289.99',{exact:true})).toBeVisible();
  expect(appCalls).toEqual([]);
});

for (const role of ['owner','tech'] as const) {
  test(`${role} can remove an oversized receipt and save the same fields exactly once without a photo`, async ({page}) => {
    await page.goto(`/tests/expenses/receipt-recovery.html?role=${role}`);
    if (role === 'owner') await page.getByRole('button',{name:'Add expense'}).click();
    const amount = page.getByLabel('Amount ($)',{exact:true});
    const vendor = page.getByLabel('Vendor');
    const photo = page.getByLabel(role === 'owner' ? 'Choose receipt photo' : 'Take receipt photo',{exact:true});
    const record = page.getByRole('button',{name:'Record expense',exact:true});
    const writes = page.locator('#gateway-writes');
    await amount.fill('24.95');
    await vendor.fill('Fictional Supply');
    await page.getByLabel('Category').selectOption('Equipment');
    await page.getByLabel('Purchase date').fill('2026-11-22');

    // Generate a valid JPEG, then insert legal JPEG comment blocks before its
    // image data to cross the limit by exactly one byte without any real photos.
    const b64 = await page.evaluate(() => document.createElement('canvas').toDataURL('image/jpeg').split(',')[1]);
    const jpeg = Buffer.from(b64,'base64');
    const segments:Buffer[] = [];
    let padding = 3 * 1024 * 1024 + 1 - jpeg.length;
    while (padding > 0) {
      let size = Math.min(padding,65535);
      if (padding > size && padding - size < 4) size -= 4;
      const segment = Buffer.alloc(size,0x41);
      segment.writeUInt16BE(0xfffe,0);
      segment.writeUInt16BE(size-2,2);
      segments.push(segment);
      padding -= size;
    }
    const fixture = {name:'fictional-oversized.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([jpeg.subarray(0,2),...segments,jpeg.subarray(2)])};
    expect(fixture.buffer.length).toBe(3 * 1024 * 1024 + 1);
    await photo.setInputFiles(fixture);
    expect(await photo.evaluate(async el => {
      const selected=(el as HTMLInputElement).files?.[0];
      if (!selected) return false;
      const bitmap=await createImageBitmap(selected);
      const decoded=bitmap.width>0 && bitmap.height>0;
      bitmap.close();
      return decoded;
    })).toBe(true);
    await record.click();
    await expect(page.getByRole('alert')).toHaveText('Use a JPG or PNG receipt at most 3 MB.');
    await expect(writes).toHaveText('[]');

    const remove = page.getByRole('button',{name:'Remove photo'});
    await remove.click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText('Attached:',{exact:false})).toHaveCount(0);
    await expect(page.getByLabel('Take receipt photo',{exact:true})).toHaveValue('');
    await expect(page.getByLabel('Choose receipt photo',{exact:true})).toHaveValue('');
    await expect(amount).toHaveValue('24.95');
    await expect(vendor).toHaveValue('Fictional Supply');
    await expect(page.getByLabel('Category')).toHaveValue('Equipment');
    await expect(page.getByLabel('Purchase date')).toHaveValue('2026-11-22');

    await photo.setInputFiles(fixture);
    await expect(remove).toBeVisible();
    await remove.click();
    await record.click();
    await expect(page.getByRole('status')).toHaveText('Expense recorded.');
    await expect(writes).toHaveText('[{"amountCents":2495,"vendor":"Fictional Supply"}]');
  });
}
