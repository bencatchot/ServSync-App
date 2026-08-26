import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  deferredCheckpointKeys,
  supportedCheckpointKeys,
  checkpointByKey,
} from '../../scripts/demo/scenarios/water-heater-core-loop.mjs';

const runner = readFileSync(new URL('../../scripts/demo/seed-demo-scenario.mjs', import.meta.url), 'utf8');
const foundation = readFileSync(new URL('../../servsync-demo-mode-foundation.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../servsync-demo-mode-invoice-payment-checkpoint-reset.sql', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const sandboxFixtures = readFileSync(new URL('../e2e/helpers/coreLoopFixtures.ts', import.meta.url), 'utf8');
const demoMatrix = readFileSync(new URL('../../scripts/demo/validate-demo-checkpoint-matrix.mjs', import.meta.url), 'utf8');

test('Phase 0.6 manifest covers the canonical positive lifecycle without inventing Estimate viewed', () => {
  assert.deepEqual(supportedCheckpointKeys.slice(12), [
    'invoice_draft',
    'invoice_sent',
    'invoice_viewed',
    'invoice_partially_paid',
    'invoice_paid',
    'home_history_updated',
    'invoice_home_history_updated',
  ]);
  assert.equal(deferredCheckpointKeys.includes('estimate_viewed'), false);
  assert.equal(checkpointByKey.invoice_paid.expected.invoicePaymentCount, 2);
  assert.equal(checkpointByKey.invoice_paid.expected.invoiceAmountPaidCents, 216500);
  assert.equal(checkpointByKey.invoice_home_history_updated.expected.reminderCount, 1);
});

test('Demo runner uses canonical Invoice, payment, filing, and homeowner reminder boundaries', () => {
  assert.match(runner, /servsync_create_partial_invoice_from_job/);
  assert.match(runner, /servsync_send_invoice/);
  assert.match(runner, /servsync_homeowner_view_invoice/);
  assert.match(runner, /servsync_record_offline_invoice_payment/);
  assert.match(runner, /servsync_file_invoice_to_home_history/);
  assert.match(runner, /homeownerClient[\s\S]*\.from\('home_reminders'\)[\s\S]*\.insert/);
  assert.match(runner, /invoicePayments\.reduce/);
  assert.match(runner, /actualPaymentIds[\s\S]*registeredPaymentIds/);
  assert.match(runner, /SERVSYNC_DEMO_QA_INTERRUPT_AFTER_STEP/);
});

for (const [label, sql] of [['foundation', foundation], ['forward migration', migration]]) {
  test(`${label} keeps Demo payment cleanup exact, registered, and browser-denied`, () => {
    assert.match(sql, /when p_table_name = 'invoice_offline_payment_records' then 123/);
    assert.match(sql, /when p_table_name = 'home_reminders' then 124/);
    assert.match(sql, /record_role not in \('demo_invoice_partial_payment', 'demo_invoice_final_payment'\)/);
    assert.match(sql, /invoice_record\.run_id = p_run_id/);
    assert.match(sql, /invoice_record\.record_id = v_payment_invoice_id/);
    assert.match(sql, /disable trigger invoice_offline_payment_records_immutable/);
    assert.match(sql, /enable trigger invoice_offline_payment_records_immutable/);
    assert.doesNotMatch(sql, /\btruncate\b/i);
    assert.match(sql, /revoke execute on function public\.servsync_demo_reset_registered_run\(uuid\) from public/);
    assert.match(sql, /revoke execute on function public\.servsync_demo_reset_registered_run\(uuid\) from anon/);
    assert.match(sql, /revoke execute on function public\.servsync_demo_reset_registered_run\(uuid\) from authenticated/);
    assert.match(sql, /grant execute on function public\.servsync_demo_reset_registered_run\(uuid\) to service_role/);
  });
}

test('forward migration is pinned to dedicated Demo and excludes Production/Sandbox application', () => {
  assert.match(migration, /Demo project bdytwgejqnlblhrnqxkp/);
  assert.match(migration, /Never apply to Production or shared Sandbox/);
});

test('named launch commands separate desktop, exact mobile, recovery, and protected Demo execution', () => {
  assert.match(packageJson.scripts['qa:e2e:launch-desktop'], /full-core-loop\.spec\.ts/);
  assert.match(packageJson.scripts['qa:e2e:launch-mobile'], /SERVSYNC_FIELD_MOBILE_ACCEPTANCE=true/);
  assert.match(packageJson.scripts['qa:e2e:launch-mobile'], /homeowner request to paid contractor invoice/);
  assert.match(packageJson.scripts['qa:fixtures:sandbox:recover'], /recover-core-loop-fixtures\.ts/);
  assert.match(packageJson.scripts['demo:qa:matrix'], /validate-demo-checkpoint-matrix\.mjs/);
  assert.match(demoMatrix, /--execute-demo/);
  assert.match(demoMatrix, /SERVSYNC_DEMO_QA_INTERRUPT_AFTER_STEP/);
  assert.match(demoMatrix, /homeowner-home-history/);
});

test('Sandbox run manifest is durable, exact-prefix scoped, linked-target guarded, and cleared only after zero-residue SQL', () => {
  assert.match(sandboxFixtures, /local-ops\/phase-0-6\/core-loop-runs\.json/);
  assert.match(sandboxFixtures, /\^E2E \(\?:Core Loop\|Partial Payment\)/);
  assert.match(sandboxFixtures, /requireLinkedProjectRef: true/);
  assert.match(sandboxFixtures, /Core-loop fixture cleanup left residue/);
  assert.match(sandboxFixtures, /manifest\.pending = manifest\.pending\.filter/);
  assert.doesNotMatch(sandboxFixtures, /\btruncate\b/i);
});
