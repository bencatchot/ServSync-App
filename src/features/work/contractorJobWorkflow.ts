import type { FindingStatus, Inspection } from '../../types';
import { UNANSWERED_FINDING_STATUS } from '../findings/statusPresentation';

export type FieldWorkflowKind = 'inspection' | 'work_order' | 'maintenance' | 'assessment';
export type JobWorkflowMode = 'simple' | 'checklist';
export type SimpleServiceJobType = 'service_visit' | 'repair' | 'install' | 'estimate_visit';

export const SIMPLE_SERVICE_JOB_TYPES: ReadonlySet<string> = new Set([
  'service_visit',
  'repair',
  'install',
  'estimate_visit',
]);
export const SIMPLE_WORK_ITEMS_ROOM = 'Work Items';

const CHECKLIST_JOB_TYPES = new Set(['inspection', 'maintenance_visit']);
const SERVICE_TASK_ACTION_STARTERS = [
  'add',
  'adjust',
  'assemble',
  'build',
  'caulk',
  'check',
  'clean',
  'connect',
  'demo',
  'diagnose',
  'dispose',
  'fix',
  'haul',
  'install',
  'inspect',
  'mount',
  'paint',
  'patch',
  'repair',
  'replace',
  'remove',
  'seal',
  'secure',
  'service',
  'test',
  'troubleshoot',
  'verify',
];

type ContractorJobWorkflowRecord = Pick<
  Inspection,
  'job_type' | 'template_id' | 'name' | 'summary' | 'rooms_with_findings'
>;

function normalizeJobWorkflowText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isInspectionLikeFieldWork(work: Pick<Inspection, 'name' | 'summary'>) {
  const haystack = normalizeJobWorkflowText(`${work.name || ''} ${work.summary || ''}`);
  return /\b(inspection|assessment|inspect|report)\b/.test(haystack);
}

export function roomIsApprovedScope(roomName: string) {
  const normalizedRoomName = normalizeJobWorkflowText(roomName);
  return normalizedRoomName === 'approved scope' || normalizedRoomName === 'approved work';
}

export function roomIsSimpleWorkItems(roomName: string) {
  return normalizeJobWorkflowText(roomName) === normalizeJobWorkflowText(SIMPLE_WORK_ITEMS_ROOM);
}

function cleanServiceTaskTitle(value: string) {
  const cleaned = value
    .replace(/^\s*[-*\d.)]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,;:\s]+|[,;:\s.]+$/g, '')
    .trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : '';
}

function splitScopeIntoServiceTaskCandidates(scope: string) {
  const protectedScope = scope
    .replace(/\r\n/g, '\n')
    .replace(/\s*[;]\s*/g, '\n')
    .replace(/\n+/g, '\n');
  const commaPattern = new RegExp(`,\\s+(?=(?:${SERVICE_TASK_ACTION_STARTERS.join('|')})\\b)`, 'gi');
  const andPattern = new RegExp(`\\s+and\\s+(?=(?:${SERVICE_TASK_ACTION_STARTERS.join('|')})\\b)`, 'gi');
  return protectedScope
    .split('\n')
    .flatMap(part => part.split(commaPattern))
    .flatMap(part => part.split(andPattern));
}

export function serviceTasksFromScope(scope: string, jobTitle: string) {
  const normalizedJobTitle = normalizeJobWorkflowText(jobTitle);
  const seen = new Set<string>();
  const tasks = splitScopeIntoServiceTaskCandidates(scope)
    .map(cleanServiceTaskTitle)
    .filter(candidate => {
      const normalized = normalizeJobWorkflowText(candidate);
      if (!normalized || normalized.length < 4) return false;
      if (normalized === normalizedJobTitle) return false;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  if (tasks.length > 1) return tasks;
  const fallback = cleanServiceTaskTitle(scope);
  const normalizedFallback = normalizeJobWorkflowText(fallback);
  if (normalizedFallback && normalizedFallback !== normalizedJobTitle && normalizedFallback.length >= 4) {
    return [fallback];
  }
  return [];
}

export function jobHasChecklistStructure(job: Pick<Inspection, 'rooms_with_findings'>) {
  const rooms = job.rooms_with_findings ?? [];
  const findingCount = rooms.reduce((count, room) => count + (room.findings?.length ?? 0), 0);
  if (findingCount === 0) return false;
  return !rooms.every(room => roomIsApprovedScope(room.room));
}

export function jobTypeFromWorkflowKind(kind: FieldWorkflowKind, mode: JobWorkflowMode = 'checklist'): string {
  if (mode === 'simple') return 'service_visit';
  if (kind === 'maintenance') return 'maintenance_visit';
  if (kind === 'inspection' || kind === 'assessment') return 'inspection';
  return 'service_visit';
}

export function isChecklistJob(job: ContractorJobWorkflowRecord) {
  const type = (job.job_type || '').trim();
  if (CHECKLIST_JOB_TYPES.has(type)) return true;
  if (SIMPLE_SERVICE_JOB_TYPES.has(type)) return false;
  return Boolean(job.template_id && jobHasChecklistStructure(job))
    || (isInspectionLikeFieldWork(job) && jobHasChecklistStructure(job));
}

export function isSimpleServiceJob(job: ContractorJobWorkflowRecord) {
  return !isChecklistJob(job);
}

export function initialFindingStatusForJob(job: ContractorJobWorkflowRecord): FindingStatus {
  return isSimpleServiceJob(job) ? 'Pass' : UNANSWERED_FINDING_STATUS;
}

export function jobTypeLabel(job: ContractorJobWorkflowRecord) {
  if (isChecklistJob(job)) {
    return job.job_type === 'maintenance_visit' ? 'Maintenance / checklist job' : 'Inspection / checklist job';
  }
  const labels: Record<string, string> = {
    service_visit: 'Service job',
    repair: 'Repair job',
    install: 'Install job',
    estimate_visit: 'Estimate visit',
  };
  return labels[(job.job_type || 'service_visit').trim()] ?? 'Service job';
}

export function jobTypeHelperCopy(job: ContractorJobWorkflowRecord) {
  if (isChecklistJob(job)) {
    return job.job_type === 'maintenance_visit'
      ? 'Record completed maintenance tasks and future recommendations.'
      : 'Use checklist items and notes to document conditions.';
  }
  const helpers: Record<string, string> = {
    service_visit: 'Track the issue, diagnosis, work performed, and recommendations.',
    repair: 'Document the problem, repair performed, parts used, and follow-up needs.',
    install: 'Track install notes, photos, and completion details.',
    estimate_visit: 'Capture site notes and scope details for an estimate.',
  };
  return helpers[(job.job_type || 'service_visit').trim()] ?? helpers.service_visit;
}
