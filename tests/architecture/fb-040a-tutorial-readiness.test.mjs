import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Service Requests owns the contextual intake walkthrough placement', async () => {
  const appSource = await readFile(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  assert.match(
    appSource,
    /contextKey="contractor\.service_requests"[\s\S]{0,160}label="Service request walkthrough"/,
  );
});

test('Work owns the contextual completion walkthrough placement', async () => {
  const appSource = await readFile(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  assert.match(
    appSource,
    /contextKey="contractor\.work"[\s\S]{0,200}label="How to complete work and save the service record"/,
  );
});

test('pilot tutorial coverage protects the six canonical onboarding workflows', async () => {
  const coverage = await readFile(
    new URL('../../docs/servsync-master-plan/ServSync_Pilot_Tutorial_Coverage.md', import.meta.url),
    'utf8',
  );
  for (const tutorialId of ['TUT-001', 'TUT-002', 'TUT-003', 'TUT-004', 'TUT-005', 'TUT-006']) {
    assert.match(coverage, new RegExp(`\\| ${tutorialId} \\|`));
  }
  for (const context of [
    'contractor.service_requests',
    'contractor.drafts',
    'contractor.work',
    'contractor.financials',
    'homeowner.service',
    'homeowner.records',
  ]) {
    assert.ok(coverage.includes(`\`${context}\``), `missing protected context ${context}`);
  }
  assert.match(coverage, /three published video tutorials/i);
  assert.match(coverage, /three missing pilot walkthroughs/i);
  assert.match(coverage, /Production publication requires explicit owner approval/i);
});
