export const SERVSYNC_PROJECT_REFS = {
  sandbox: 'zpzdkoaubyjtsomccxya',
  demo: 'bdytwgejqnlblhrnqxkp',
  production: 'uqgtheclhxqlnjpfmheq',
} as const;

export const FAILURE_CATEGORIES = [
  'ENVIRONMENT FAILURE',
  'CREDENTIAL FAILURE',
  'IDENTITY FAILURE',
  'FIXTURE FAILURE',
  'AUTHORIZATION FAILURE',
  'APPLICATION FAILURE',
  'BACKUP HEALTH FAILURE',
  'PROVIDER/EXTERNAL FAILURE',
] as const;

export type SmokeFailureCategory = (typeof FAILURE_CATEGORIES)[number];
export type RoleSmokeTarget = 'sandbox' | 'demo';
export type ContractorSmokeRole = 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer' | 'contractorB';
export type HomeownerSmokeRole = 'homeowner' | 'homeownerB';
export type SmokeRole = ContractorSmokeRole | HomeownerSmokeRole;

export type SmokeCheckResult = {
  name: string;
  status: 'pass' | 'fail';
  category?: SmokeFailureCategory;
  summary: string;
};

export type RoleSmokeReport = {
  reportVersion: 1;
  runId: string;
  startedAt: string;
  completedAt: string;
  environment: RoleSmokeTarget;
  trigger: 'schedule' | 'workflow_dispatch' | 'local';
  status: 'pass' | 'fail';
  checksRun: number;
  passed: number;
  failed: number;
  checks: SmokeCheckResult[];
};

type CredentialNames = { email: string; password: string };

const SANDBOX_CREDENTIALS: Record<SmokeRole, CredentialNames> = {
  owner: { email: 'TEST_CONTRACTOR_EMAIL', password: 'TEST_CONTRACTOR_PASSWORD' },
  admin: { email: 'TEST_CONTRACTOR_ADMIN_EMAIL', password: 'TEST_CONTRACTOR_ADMIN_PASSWORD' },
  office: { email: 'TEST_CONTRACTOR_OFFICE_EMAIL', password: 'TEST_CONTRACTOR_OFFICE_PASSWORD' },
  field_tech: { email: 'TEST_CONTRACTOR_FIELD_TECH_EMAIL', password: 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD' },
  viewer: { email: 'TEST_CONTRACTOR_VIEWER_EMAIL', password: 'TEST_CONTRACTOR_VIEWER_PASSWORD' },
  contractorB: { email: 'TEST_CONTRACTOR_B_EMAIL', password: 'TEST_CONTRACTOR_B_PASSWORD' },
  homeowner: { email: 'TEST_HOMEOWNER_EMAIL', password: 'TEST_HOMEOWNER_PASSWORD' },
  homeownerB: { email: 'TEST_HOMEOWNER_B_EMAIL', password: 'TEST_HOMEOWNER_B_PASSWORD' },
};

const DEMO_CREDENTIALS: Partial<Record<SmokeRole, CredentialNames>> = {
  owner: { email: 'DEMO_CONTRACTOR_EMAIL', password: 'DEMO_CONTRACTOR_PASSWORD' },
  contractorB: { email: 'DEMO_CONTRACTOR_B_EMAIL', password: 'DEMO_CONTRACTOR_B_PASSWORD' },
  homeowner: { email: 'DEMO_HOMEOWNER_EMAIL', password: 'DEMO_HOMEOWNER_PASSWORD' },
  homeownerB: { email: 'DEMO_HOMEOWNER_B_EMAIL', password: 'DEMO_HOMEOWNER_B_PASSWORD' },
};

export const TARGET_ROLES: Record<RoleSmokeTarget, SmokeRole[]> = {
  sandbox: ['owner', 'admin', 'office', 'field_tech', 'viewer', 'contractorB', 'homeowner', 'homeownerB'],
  demo: ['owner', 'contractorB', 'homeowner', 'homeownerB'],
};

export class RoleSmokeFailure extends Error {
  readonly category: SmokeFailureCategory;
  readonly check: string;

  constructor(
    category: SmokeFailureCategory,
    check: string,
    message: string,
  ) {
    super(message);
    this.name = 'RoleSmokeFailure';
    this.category = category;
    this.check = check;
  }
}

export function requireSmokeInvariant(
  condition: unknown,
  category: SmokeFailureCategory,
  check: string,
  message: string,
): asserts condition {
  if (!condition) throw new RoleSmokeFailure(category, check, message);
}

function required(env: NodeJS.ProcessEnv, name: string, category: SmokeFailureCategory): string {
  const value = env[name]?.trim();
  if (!value) throw new RoleSmokeFailure(category, 'preflight', `Missing required variable ${name}.`);
  return value;
}

function projectRefFromSupabaseUrl(raw: string): string | null {
  try {
    const match = new URL(raw).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function credentialsForRole(target: RoleSmokeTarget, role: SmokeRole): CredentialNames {
  const credentials = target === 'sandbox' ? SANDBOX_CREDENTIALS[role] : DEMO_CREDENTIALS[role];
  if (!credentials) {
    throw new RoleSmokeFailure('ENVIRONMENT FAILURE', 'preflight', `${role} is not configured for ${target} recurring smoke.`);
  }
  return credentials;
}

export type RoleSmokePreflight = {
  target: RoleSmokeTarget;
  projectRef: string;
  supabaseUrl: string;
  anonKey: string;
  appUrl: string;
  roles: SmokeRole[];
  credentials: Record<string, { email: string; password: string }>;
};

export function preflightRoleSmoke(env: NodeJS.ProcessEnv = process.env): RoleSmokePreflight {
  const rawTarget = required(env, 'SERVSYNC_ROLE_SMOKE_TARGET', 'ENVIRONMENT FAILURE').toLowerCase();
  if (rawTarget !== 'sandbox' && rawTarget !== 'demo') {
    throw new RoleSmokeFailure('ENVIRONMENT FAILURE', 'preflight', 'Recurring role smoke permits only Sandbox or Demo targets.');
  }
  const target = rawTarget as RoleSmokeTarget;
  const expectedProjectRef = SERVSYNC_PROJECT_REFS[target];
  const projectRef = required(env, 'ROLE_SMOKE_SUPABASE_PROJECT_REF', 'ENVIRONMENT FAILURE').toLowerCase();
  const supabaseUrl = required(env, 'ROLE_SMOKE_SUPABASE_URL', 'ENVIRONMENT FAILURE');
  const anonKey = required(env, 'ROLE_SMOKE_SUPABASE_ANON_KEY', 'CREDENTIAL FAILURE');
  const appUrl = required(env, 'ROLE_SMOKE_APP_URL', 'ENVIRONMENT FAILURE');
  const urlProjectRef = projectRefFromSupabaseUrl(supabaseUrl);

  if (projectRef === SERVSYNC_PROJECT_REFS.production || urlProjectRef === SERVSYNC_PROJECT_REFS.production) {
    throw new RoleSmokeFailure('ENVIRONMENT FAILURE', 'preflight', 'Full role smoke refuses the Production Supabase project.');
  }
  if (projectRef !== expectedProjectRef || urlProjectRef !== expectedProjectRef) {
    throw new RoleSmokeFailure('ENVIRONMENT FAILURE', 'preflight', `Configured Supabase identity does not match ${target}.`);
  }
  let parsedAppUrl: URL;
  try {
    parsedAppUrl = new URL(appUrl);
  } catch {
    throw new RoleSmokeFailure('ENVIRONMENT FAILURE', 'preflight', 'ROLE_SMOKE_APP_URL is invalid.');
  }
  if (['servsync.app', 'www.servsync.app'].includes(parsedAppUrl.hostname.toLowerCase())) {
    throw new RoleSmokeFailure('ENVIRONMENT FAILURE', 'preflight', 'Full role smoke refuses the Production application.');
  }

  const roles = TARGET_ROLES[target];
  const credentials: Record<string, { email: string; password: string }> = {};
  for (const role of roles) {
    const names = credentialsForRole(target, role);
    credentials[role] = {
      email: required(env, names.email, 'CREDENTIAL FAILURE'),
      password: required(env, names.password, 'CREDENTIAL FAILURE'),
    };
  }

  const identities = Object.entries(credentials);
  for (let left = 0; left < identities.length; left += 1) {
    for (let right = left + 1; right < identities.length; right += 1) {
      if (identities[left][1].email.toLowerCase() === identities[right][1].email.toLowerCase()) {
        throw new RoleSmokeFailure('CREDENTIAL FAILURE', 'preflight', 'Two logical smoke roles resolve to the same account.');
      }
    }
  }

  const otherTargetCredentials = target === 'sandbox' ? DEMO_CREDENTIALS : SANDBOX_CREDENTIALS;
  for (const current of Object.values(credentials)) {
    for (const names of Object.values(otherTargetCredentials)) {
      if (!names) continue;
      const otherEmail = env[names.email]?.trim();
      const otherPassword = env[names.password]?.trim();
      if (otherEmail && otherPassword && current.email.toLowerCase() === otherEmail.toLowerCase() && current.password === otherPassword) {
        throw new RoleSmokeFailure('CREDENTIAL FAILURE', 'preflight', 'One credential pair is shared across environment classes.');
      }
    }
  }

  return { target, projectRef, supabaseUrl, anonKey, appUrl, roles, credentials };
}

export function safeErrorSummary(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted-id]')
    .replace(/(?:eyJ|sk_|sb_|whsec_)[A-Za-z0-9._-]{8,}/g, '[redacted-secret]')
    .slice(0, 240);
}

export function createRoleSmokeReport(options: {
  runId: string;
  startedAt: string;
  completedAt: string;
  environment: RoleSmokeTarget;
  trigger?: 'schedule' | 'workflow_dispatch' | 'local';
  checks: SmokeCheckResult[];
}): RoleSmokeReport {
  const passed = options.checks.filter(check => check.status === 'pass').length;
  const failed = options.checks.length - passed;
  return {
    reportVersion: 1,
    runId: options.runId,
    startedAt: options.startedAt,
    completedAt: options.completedAt,
    environment: options.environment,
    trigger: options.trigger ?? 'local',
    status: failed === 0 ? 'pass' : 'fail',
    checksRun: options.checks.length,
    passed,
    failed,
    checks: options.checks,
  };
}

export function roleSmokeTrigger(env: NodeJS.ProcessEnv = process.env): 'schedule' | 'workflow_dispatch' | 'local' {
  const event = env.GITHUB_EVENT_NAME?.trim();
  if (!event) return 'local';
  if (event === 'schedule' || event === 'workflow_dispatch') return event;
  throw new RoleSmokeFailure('ENVIRONMENT FAILURE', 'scheduler_trigger', 'Recurring smoke refuses an unexpected GitHub trigger.');
}

export type BackupHealthPayload = {
  status?: unknown;
  sourceProjectRef?: unknown;
  lastSuccessfulBackupAt?: unknown;
  lastRunId?: unknown;
  manifestSha256?: unknown;
  metrics?: { failedObjectCount?: unknown; sourceObjectCount?: unknown; backedUpObjectCount?: unknown };
  ageHours?: unknown;
};

export function validateBackupHealth(payload: BackupHealthPayload, now = new Date()): void {
  if (payload.status !== 'healthy' || payload.sourceProjectRef !== SERVSYNC_PROJECT_REFS.production) {
    throw new RoleSmokeFailure('BACKUP HEALTH FAILURE', 'storage_backup_health', 'Production Storage backup health is not healthy.');
  }
  if (typeof payload.lastSuccessfulBackupAt !== 'string' || !Number.isFinite(Date.parse(payload.lastSuccessfulBackupAt))) {
    throw new RoleSmokeFailure('BACKUP HEALTH FAILURE', 'storage_backup_health', 'Storage backup timestamp is unavailable.');
  }
  const ageHours = (now.getTime() - Date.parse(payload.lastSuccessfulBackupAt)) / 3_600_000;
  if (ageHours < 0 || ageHours > 36) {
    throw new RoleSmokeFailure('BACKUP HEALTH FAILURE', 'storage_backup_health', 'Production Storage backup is outside the 36-hour health window.');
  }
  if (typeof payload.manifestSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(payload.manifestSha256)) {
    throw new RoleSmokeFailure('BACKUP HEALTH FAILURE', 'storage_backup_health', 'Storage backup manifest identity is invalid.');
  }
  if (payload.metrics?.failedObjectCount !== 0 || payload.metrics.sourceObjectCount !== payload.metrics.backedUpObjectCount) {
    throw new RoleSmokeFailure('BACKUP HEALTH FAILURE', 'storage_backup_health', 'Production Storage backup is incomplete.');
  }
}

export function validateBackupHealthResponse(status: number, payload: unknown, now = new Date()): void {
  const isHealthPayload = Boolean(
    payload
      && typeof payload === 'object'
      && !Array.isArray(payload)
      && typeof (payload as BackupHealthPayload).status === 'string',
  );

  if (status >= 500 && !isHealthPayload) {
    throw new RoleSmokeFailure('PROVIDER/EXTERNAL FAILURE', 'storage_backup_health', 'Backup-health endpoint is unavailable.');
  }
  if (status < 200 || status >= 300) {
    if (isHealthPayload) validateBackupHealth(payload as BackupHealthPayload, now);
    throw new RoleSmokeFailure('BACKUP HEALTH FAILURE', 'storage_backup_health', 'Backup-health endpoint did not return a healthy response.');
  }
  if (!isHealthPayload) {
    throw new RoleSmokeFailure('BACKUP HEALTH FAILURE', 'storage_backup_health', 'Backup-health endpoint returned an invalid health response.');
  }
  validateBackupHealth(payload as BackupHealthPayload, now);
}
