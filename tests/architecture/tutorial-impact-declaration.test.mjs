import assert from 'node:assert/strict';
import test from 'node:test';

import { validateTutorialImpactDeclaration } from '../../scripts/validation/check-tutorial-impact-declaration.mjs';

test('accepts a supported no-impact declaration with verification evidence', () => {
  const result = validateTutorialImpactDeclaration(`
Tutorial impact: NONE
Tutorial evidence: Searched Help Studio by the changed route and feature area; no published tutorial demonstrates this surface.
Affected tutorials: None
Tutorial follow-up: None
`);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'NONE');
});

test('accepts an update-required declaration only with named tutorial and follow-up', () => {
  const result = validateTutorialImpactDeclaration(`
Tutorial impact: UPDATE REQUIRED
Tutorial evidence: Previewed the published estimate walkthrough and found the retired Jobs label.
Affected tutorials: How to create an estimate
Tutorial follow-up: Record and publish a Work-navigation replacement after the merged Demo build is available.
`);
  assert.equal(result.ok, true);
});

test('accepts a completed tutorial refresh with named evidence', () => {
  const result = validateTutorialImpactDeclaration(`
Tutorial impact: UPDATED
Tutorial evidence: Help Studio revision 3 was reviewed and post-publication Preview serves the Work-navigation media.
Affected tutorials: How to create an estimate
Tutorial follow-up: None
`);
  assert.equal(result.ok, true);
});

test('rejects a missing or placeholder declaration', () => {
  const result = validateTutorialImpactDeclaration(`
Tutorial impact: <!-- NOT APPLICABLE | NONE | UPDATE REQUIRED | UPDATED -->
Tutorial evidence: TODO
Affected tutorials: None
Tutorial follow-up: None
`);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /Tutorial impact must be exactly/);
  assert.match(result.errors.join(' '), /Tutorial evidence/);
});

test('rejects an affected tutorial without a named replacement follow-up', () => {
  const result = validateTutorialImpactDeclaration(`
Tutorial impact: UPDATE REQUIRED
Tutorial evidence: The walkthrough shows a removed navigation label.
Affected tutorials: How to create an estimate
Tutorial follow-up: None
`);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /Tutorial follow-up/);
});
