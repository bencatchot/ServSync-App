import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyBrowserResult } from '../../scripts/operational-smoke/record-browser-result.mjs';

const setup = ['success', 'success', 'success', 'success'];
const cases = [
  { name: 'Playwright installation failure', job: 'failure', setup: [...setup.slice(0, 3), 'failure'], checks: ['skipped'], category: 'SETUP FAILURE' },
  { name: 'checkout failure', job: 'failure', setup: ['failure', 'skipped', 'skipped', 'skipped'], checks: ['skipped'], category: 'SETUP FAILURE' },
  { name: 'cancelled setup', job: 'cancelled', setup: ['success', 'cancelled', 'skipped', 'skipped'], checks: ['skipped'], category: 'CHECKS NOT RUN' },
  { name: 'skipped check', job: 'success', setup, checks: ['skipped'], category: 'CHECKS NOT RUN' },
  { name: 'cancelled check', job: 'cancelled', setup, checks: ['cancelled'], category: 'CHECKS NOT RUN' },
  { name: 'partial Production checks', job: 'cancelled', setup, checks: ['success', 'cancelled'], category: 'CHECKS NOT RUN' },
  { name: 'failed Production public check with auth skipped', job: 'failure', setup, checks: ['failure', 'skipped'], category: 'APPLICATION FAILURE' },
  { name: 'failed authenticated check', job: 'failure', setup, checks: ['success', 'failure'], category: 'APPLICATION FAILURE' },
  { name: 'failed Sandbox build with checks skipped', job: 'failure', setup, checks: ['failure', 'skipped', 'skipped', 'skipped'], category: 'APPLICATION FAILURE' },
  { name: 'failed Sandbox API check with browser skipped', job: 'failure', setup, checks: ['success', 'success', 'failure', 'skipped'], category: 'APPLICATION FAILURE' },
  { name: 'continued check failure cannot become success', job: 'success', setup, checks: ['failure'], category: 'APPLICATION FAILURE' },
  { name: 'empty outcomes', job: 'success', setup: [], checks: [], category: 'CHECKS NOT RUN' },
  { name: 'missing required outcome', job: 'success', setup, checks: ['success', ''], category: 'CHECKS NOT RUN' },
  { name: 'unknown outcome', job: 'success', setup, checks: ['unexpected-private-value'], category: 'CHECKS NOT RUN' },
  { name: 'job failure after successful checks', job: 'failure', setup, checks: ['success'], category: 'JOB INCOMPLETE' },
  { name: 'cancelled job after successful checks', job: 'cancelled', setup, checks: ['success'], category: 'JOB INCOMPLETE' },
  { name: 'successful Demo checks', job: 'success', setup, checks: ['success'], category: null },
  { name: 'successful Production checks', job: 'success', setup, checks: ['success', 'success'], category: null },
  { name: 'successful Sandbox checks', job: 'success', setup, checks: ['success', 'success', 'success', 'success'], category: null },
];

for (const scenario of cases) {
  test(`sanitized browser report: ${scenario.name}`, () => {
    const result = classifyBrowserResult(scenario.job, scenario.setup, scenario.checks);
    assert.equal(result.category, scenario.category);
    assert.equal(result.status, scenario.category === null ? 'success' : scenario.job === 'cancelled' ? 'cancelled' : 'failure');
    const dir = mkdtempSync(join(tmpdir(), 'servsync-browser-report-'));
    try {
      const output = join(dir, 'artifacts', 'result.json');
      const child = spawnSync(process.execPath, [
        'scripts/operational-smoke/record-browser-result.mjs', 'sandbox', 'browser', output,
      ], {
        env: {
          SMOKE_JOB_STATUS: scenario.job,
          SMOKE_SETUP_OUTCOMES: scenario.setup.join(','),
          SMOKE_CHECK_OUTCOMES: scenario.checks.join(','),
          GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2', GITHUB_EVENT_NAME: 'schedule',
          TEST_CONTRACTOR_PASSWORD: 'sentinel-not-for-report',
        },
        encoding: 'utf8',
      });
      assert.equal(child.status, scenario.category === null ? 0 : 1, child.stderr);
      const report = readFileSync(output, 'utf8');
      assert.deepEqual(JSON.parse(report), {
        run_id: 'github-123-2', environment: 'sandbox', check: 'browser', ...result, trigger: 'schedule',
      });
      assert.equal(report.includes('sentinel-not-for-report'), false);
      assert.equal(report.includes('unexpected-private-value'), false);
      assert.equal(child.stdout, '');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('workflow reports cover every prerequisite/check and preserve fail-closed execution', () => {
  const workflow = readFileSync('.github/workflows/fb016-recurring-role-smoke.yml', 'utf8');
  const jobs = workflow.split('\njobs:\n')[1].split(/^ {2}(?=[a-z-]+:\n)/m).slice(1);
  assert.equal(jobs.length, 3);
  for (const job of jobs) {
    assert.match(job, /runs-on: ubuntu-24\.04/);
    assert.doesNotMatch(job, /continue-on-error/);
    const ids = [...job.matchAll(/^ {8}id: (\w+)$/gm)].map((match) => match[1]);
    const reportedIds = [...job.matchAll(/steps\.(\w+)\.outcome/g)].map((match) => match[1]);
    assert.deepEqual(reportedIds, ids);
    assert.match(job, /if: always\(\)\n {8}env:\n {10}SMOKE_JOB_STATUS: \$\{\{ job.status \}\}/);
    assert.match(job, /run: node scripts\/operational-smoke\/record-browser-result\.mjs/);
    assert.match(job, /- name: Upload[^\n]*\n {8}if: always\(\)/);
  }
  assert.doesNotMatch(workflow, /^ {2}(push|pull_request|pull_request_target):/m);
});
