import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/features/drafts/DurableDraftWorkspace.tsx', import.meta.url), 'utf8');

test('New Draft customer creation reuses the canonical local-customer mutation and does not launch an output', () => {
  const rendererStart = app.indexOf('const renderDraftCustomerCreation');
  const rendererEnd = app.indexOf('const openEstimateCustomerCreate', rendererStart);
  const renderer = app.slice(rendererStart, rendererEnd);

  assert.ok(rendererStart > -1 && rendererEnd > rendererStart);
  assert.match(renderer, /createLocalContact\(\{/);
  assert.doesNotMatch(renderer, /servsync_create_local_contact/);
  assert.doesNotMatch(renderer, /launchContractorWorkDraft|saveEstimate|saveInvoice/);
  assert.match(app, /supabase\.rpc\('servsync_create_local_contact'/);
  assert.match(app, /renderCustomerCreation=\{renderDraftCustomerCreation\}/);
});

test('the durable editor applies only the returned local customer selection to the current form', () => {
  assert.match(workspace, /setForm\(current => current \? applyDraftCustomerSelection\(current, customer\) : current\)/);
  assert.match(workspace, /customer\.subjectType !== 'local'/);
  assert.doesNotMatch(workspace.slice(workspace.indexOf('const handleCreatedCustomer'), workspace.indexOf('const handleSave')), /launchContractorWorkDraft/);
});
