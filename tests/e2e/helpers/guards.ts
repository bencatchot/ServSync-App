import { testAppUrl } from './env';

const APPROVED_SANDBOX_HOST_PARTS = [
  'localhost',
  '127.0.0.1',
  'staging',
  'preview',
  'vercel.app',
];

export function isApprovedSandboxUrl(url = testAppUrl): boolean {
  if (process.env.E2E_ALLOW_MUTATION === 'true') return true;

  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();
  return APPROVED_SANDBOX_HOST_PARTS.some(part => hostname.includes(part));
}

export function requireApprovedSandboxForMutation(url = testAppUrl): void {
  if (!isApprovedSandboxUrl(url)) {
    throw new Error(
      `Refusing to run mutating Playwright test against ${url}. Use localhost, staging, preview, a Vercel Preview URL, or set E2E_ALLOW_MUTATION=true.`,
    );
  }
}
