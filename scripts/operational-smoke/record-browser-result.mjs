import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

function groupStatus(outcomes) {
  if (outcomes.includes('failure')) return 'failure';
  if (outcomes.length && outcomes.every((outcome) => outcome === 'success')) return 'success';
  return 'not_run';
}

export function classifyBrowserResult(jobStatus, setupOutcomes, checkOutcomes) {
  const setupStatus = groupStatus(setupOutcomes);
  const checkStatus = groupStatus(checkOutcomes);
  let category = null;
  if (setupStatus === 'failure') category = 'SETUP FAILURE';
  else if (checkStatus === 'failure') category = 'APPLICATION FAILURE';
  else if (setupStatus !== 'success' || checkStatus !== 'success') category = 'CHECKS NOT RUN';
  else if (jobStatus !== 'success') category = 'JOB INCOMPLETE';

  return {
    // Missing, skipped, or cancelled required steps must never imply success.
    status: category === null ? 'success' : jobStatus === 'cancelled' ? 'cancelled' : 'failure',
    category,
    setup_status: setupStatus,
    check_status: checkStatus,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [environment, check, outputPath] = process.argv.slice(2);
  if (!environment || !check || !outputPath) throw new Error('Expected environment, check, and output path.');
  const result = classifyBrowserResult(
    process.env.SMOKE_JOB_STATUS,
    (process.env.SMOKE_SETUP_OUTCOMES || '').split(','),
    (process.env.SMOKE_CHECK_OUTCOMES || '').split(','),
  );
  const report = {
    run_id: `github-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`,
    environment,
    check,
    ...result,
    trigger: process.env.GITHUB_EVENT_NAME,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report)}\n`);
  // Reporting still runs after failure; it never makes an incomplete job green.
  if (result.status !== 'success') process.exitCode = 1;
}
