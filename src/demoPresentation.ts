export const SERVSYNC_DEMO_PRESENTATION_DEDICATED_REF = 'bdytwgejqnlblhrnqxkp';
export const SERVSYNC_PRODUCTION_REF = 'uqgtheclhxqlnjpfmheq';
export const SERVSYNC_SHARED_SANDBOX_REF = 'zpzdkoaubyjtsomccxya';

export type PresentationEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SERVSYNC_DEMO_PRESENTATION_ENABLED?: string;
  VITE_SERVSYNC_DEMO_PROJECT_REF?: string;
};

export function parseSupabaseProjectRef(url?: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const [projectRef] = parsed.hostname.split('.');
    if (!projectRef || parsed.hostname.split('.').slice(1).join('.') !== 'supabase.co') return null;
    return projectRef;
  } catch {
    return null;
  }
}

export function isServSyncDemoPresentationMode(env: PresentationEnv = import.meta.env as unknown as PresentationEnv) {
  if (env.VITE_SERVSYNC_DEMO_PRESENTATION_ENABLED !== 'true') return false;
  if (env.VITE_SERVSYNC_DEMO_PROJECT_REF !== SERVSYNC_DEMO_PRESENTATION_DEDICATED_REF) return false;

  const actualRef = parseSupabaseProjectRef(env.VITE_SUPABASE_URL);
  if (!actualRef) return false;
  if (actualRef === SERVSYNC_PRODUCTION_REF || actualRef === SERVSYNC_SHARED_SANDBOX_REF) return false;
  return actualRef === env.VITE_SERVSYNC_DEMO_PROJECT_REF;
}

export type DemoPresentationJobStatusInput = {
  status: string;
  totalWorkItems: number;
  completedWorkItems: number;
};

export function demoPresentationJobCheckpointLabel(job: DemoPresentationJobStatusInput) {
  if (job.status === 'completed' || job.status === 'closed') {
    return 'Work completed. Billing and home records are the next workflow and are intentionally outside this demo.';
  }
  if (job.status === 'scheduled') return 'Contractor visit scheduled';
  if (job.status === 'in_progress' && job.totalWorkItems > 0 && job.completedWorkItems >= job.totalWorkItems) {
    return 'Ready for contractor review';
  }
  if (job.status === 'in_progress') return 'Work in progress';
  return 'Draft job created from accepted estimate';
}

export function demoPresentationWorkItemProgress(totalWorkItems: number, completedWorkItems: number) {
  if (totalWorkItems <= 0) return 'No work items yet';
  return `${completedWorkItems} of ${totalWorkItems} work items complete`;
}
