import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_TSX_MAX_LINES,
  appMonolithBudgetResult,
  checkAppMonolithBudget,
  countSourceLines,
} from '../../scripts/validation/check-app-monolith-budget.mjs';

test('counts source lines consistently with or without a trailing newline', () => {
  assert.equal(countSourceLines(''), 0);
  assert.equal(countSourceLines('one'), 1);
  assert.equal(countSourceLines('one\n'), 1);
  assert.equal(countSourceLines('one\ntwo\n'), 2);
});

test('keeps the checked-in App.tsx exactly at the ratcheting baseline', () => {
  const result = checkAppMonolithBudget();
  assert.equal(result.passes, true);
  assert.equal(result.lineCount, APP_TSX_MAX_LINES);
});

test('fails closed when App.tsx grows beyond the baseline', () => {
  const overBudgetSource = `${'line\n'.repeat(APP_TSX_MAX_LINES)}one-more-line`;
  const result = appMonolithBudgetResult(overBudgetSource);
  assert.equal(result.passes, false);
  assert.equal(result.lineCount, APP_TSX_MAX_LINES + 1);
  assert.equal(result.remainingLines, -1);
});

test('requires a lower baseline whenever an extraction shrinks App.tsx', () => {
  const underBudgetSource = 'line\n'.repeat(APP_TSX_MAX_LINES - 1);
  const result = appMonolithBudgetResult(underBudgetSource);
  assert.equal(result.passes, false);
  assert.equal(result.lineCount, APP_TSX_MAX_LINES - 1);
  assert.equal(result.remainingLines, 1);
});
