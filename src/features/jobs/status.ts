import type { Inspection, JobLifecycleStatus } from '../../types';

export const OPEN_JOB_STATUSES: JobLifecycleStatus[] = ['draft', 'scheduled', 'in_progress'];
export const CLOSED_JOB_STATUSES: JobLifecycleStatus[] = ['completed', 'closed', 'cancelled'];

export function inspectionJobStatus(work: Pick<Inspection, 'status' | 'job_status'>): JobLifecycleStatus {
  if (work.job_status) return work.job_status;
  return work.status === 'finalized' ? 'completed' : 'draft';
}

export function inspectionIsOpenJob(work: Pick<Inspection, 'status' | 'job_status'>) {
  return OPEN_JOB_STATUSES.includes(inspectionJobStatus(work));
}

export function inspectionIsClosedJob(work: Pick<Inspection, 'status' | 'job_status'>) {
  return CLOSED_JOB_STATUSES.includes(inspectionJobStatus(work));
}

export function inspectionCanSaveProgress(work: Pick<Inspection, 'status' | 'job_status'>) {
  return work.status === 'draft' && OPEN_JOB_STATUSES.includes(inspectionJobStatus(work));
}

export function inspectionJobStatusLabel(work: Pick<Inspection, 'status' | 'job_status'>) {
  const labels: Record<JobLifecycleStatus, string> = {
    draft: 'Draft',
    scheduled: 'Scheduled',
    in_progress: 'In progress',
    completed: 'Completed',
    closed: 'Closed',
    cancelled: 'Cancelled',
  };
  return labels[inspectionJobStatus(work)];
}

export function inspectionJobBadgeClass(work: Pick<Inspection, 'status' | 'job_status'>) {
  const status = inspectionJobStatus(work);
  if (status === 'draft' || status === 'scheduled') return 'bg-amber-50 text-amber-700';
  if (status === 'in_progress') return 'bg-blue-50 text-blue-700';
  if (status === 'cancelled') return 'bg-red-50 text-red-700';
  return 'bg-emerald-50 text-emerald-700';
}
