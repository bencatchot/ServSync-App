import { fail } from 'k6';
import { requireLoadTestAllowed, requireSandboxSupabaseRef, sandboxBaseUrl, stageProfile } from './helpers/loadGuards.js';

requireLoadTestAllowed('sandbox-auth');
requireSandboxSupabaseRef();
const baseUrl = sandboxBaseUrl();

export const options = {
  stages: stageProfile(),
  thresholds: {
    checks: ['rate==1'],
  },
};

export default function sandboxAuthReadPlaceholder() {
  fail(
    [
      `Authenticated sandbox load testing is intentionally not implemented in this slice for ${baseUrl}.`,
      'This placeholder validates the sandbox-only guard shape without logging in, seeding users, or mutating data.',
      'Future work must add an approved sandbox credential pool and read-only scenarios before this script can run real load.',
    ].join(' '),
  );
}
