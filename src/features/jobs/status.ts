import type { Inspection, JobLifecycleStatus } from '../../types';
import { jobStatusPresentation, statusToneClass } from '../status/statusPresentation';

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
  return jobStatusPresentation(inspectionJobStatus(work)).label;
}

export function inspectionJobBadgeClass(work: Pick<Inspection, 'status' | 'job_status'>) {
  return statusToneClass(jobStatusPresentation(inspectionJobStatus(work)).tone);
}
