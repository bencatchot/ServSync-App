import type { Inspection, ServiceAgreement } from '../../types';
import { isOperationalJob } from '../jobs/jobRecordSelectors';

export interface PlanVisit {
  id: string;
  agreement_id: string;
  ordinal: number;
  due_on: string | null;
  job_id: string | null;
  job_name: string | null;
  job_status: string | null;
  report_ready: boolean | null;
  shared_with_homeowner: boolean;
  version: number;
}
export type PlanWithVisits = { plan: ServiceAgreement; visits: PlanVisit[] };
export const visitCompleted = (visit: PlanVisit) => ['completed', 'closed'].includes(visit.job_status ?? '');
export function visitStatus(visit: PlanVisit) {
  if (visitCompleted(visit)) return 'Completed';
  if (visit.job_status === 'cancelled') return 'Job cancelled — visit not completed';
  if (visit.job_status === 'in_progress') return 'In progress';
  if (visit.job_status === 'scheduled') return 'Scheduled Job';
  return visit.job_status ? 'Job linked — not completed' : 'Not scheduled';
}
export function visitAttention(visit: PlanVisit, today: string) {
  if (visitCompleted(visit) || !visit.due_on) return null;
  if (visit.due_on < today) return 'Overdue';
  const days = (Date.parse(`${visit.due_on}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000;
  return days <= 30 ? 'Due soon' : null;
}
export function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function eligibleVisitJobs(plan: ServiceAgreement, jobs: Inspection[]) {
  return jobs.filter(job => job.contractor_id === plan.contractor_id && job.homeowner_user_id === plan.homeowner_user_id
    && job.home_id === plan.home_id && isOperationalJob(job));
}
export function visitProgress(plan: ServiceAgreement, visits: PlanVisit[], sharedOnly = false) {
  const completed = visits.filter(visitCompleted).length;
  if (sharedOnly) return `${completed} shared ${completed === 1 ? 'visit' : 'visits'} completed. Only progress shared by your contractor is shown.`;
  return plan.included_visit_count === null
    ? `${completed} completed · No visit allowance specified in the accepted plan`
    : `${completed} of ${plan.included_visit_count} included visits completed`;
}
