import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESLINT_WARNING_BASELINE,
  lintWarningBudgetResult,
} from '../../scripts/validation/check-eslint-warning-budget.mjs';

test('passes only when lint warnings exactly match the recorded baseline', () => {
  const result = lintWarningBudgetResult(ESLINT_WARNING_BASELINE);
  assert.equal(result.passes, true);
  assert.equal(result.remainingWarnings, 0);
});

test('fails closed when lint warnings grow beyond the baseline', () => {
  const result = lintWarningBudgetResult(ESLINT_WARNING_BASELINE + 1);
  assert.equal(result.passes, false);
  assert.equal(result.remainingWarnings, -1);
});

test('requires a lower baseline whenever lint cleanup removes a warning', () => {
  const result = lintWarningBudgetResult(ESLINT_WARNING_BASELINE - 1);
  assert.equal(result.passes, false);
  assert.equal(result.remainingWarnings, 1);
});
