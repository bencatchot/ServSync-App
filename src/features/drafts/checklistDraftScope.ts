import type { InspectionRoomData, InspectionTemplateRoom } from '../../types';
import { UNANSWERED_FINDING_STATUS } from '../findings/statusPresentation';
import { DRAFT_CHECKLIST_STARTER_OPTIONS } from './checklistStarterCatalog';
import type { SharedDraftComposerDraft } from './draftComposerTypes';

export const DRAFT_CHECKLIST_UNANSWERED_STATUS = UNANSWERED_FINDING_STATUS;

export type DraftChecklistSourceKind =
  | 'starter_inspection_checklist'
  | 'contractor_inspection_checklist'
  | 'home_inspection_checklist';

export type DraftChecklistWorkflowKind = 'inspection' | 'maintenance' | 'assessment';

export type DraftChecklistRoomSnapshot = {
  room: string;
  room_id: string;
  display_name: string;
  room_type: string;
  location_note: string;
  sort_order: number;
  items: string[];
};

export type DraftChecklistSourceSnapshot = {
  schema_version: 1;
  source_kind: DraftChecklistSourceKind;
  source_id: string;
  source_label: string;
  workflow_kind: DraftChecklistWorkflowKind;
  job_type: 'inspection' | 'maintenance_visit';
  snapshot_fingerprint: string;
  source_updated_at: string | null;
  rooms: DraftChecklistRoomSnapshot[];
};

export type DraftChecklistSourceOption = Omit<DraftChecklistSourceSnapshot, 'schema_version' | 'snapshot_fingerprint' | 'rooms'> & {
  group_label: string;
  rooms: InspectionTemplateRoom[];
  subject_binding?:
    | {
        subject_type: 'connected';
        homeowner_user_id: string | null;
        home_id: string;
      }
    | {
        subject_type: 'local';
        local_contact_id: string | null;
        local_home_id: string;
      };
};

export function draftChecklistSourceMatchesDraftSubject(
  option: DraftChecklistSourceOption,
  draft: Pick<
    SharedDraftComposerDraft,
    'subject_type' | 'homeowner_user_id' | 'home_id' | 'local_contact_id' | 'local_home_id'
  >,
) {
  if (option.source_kind !== 'home_inspection_checklist') return true;
  const binding = option.subject_binding;
  if (!binding || binding.subject_type !== draft.subject_type) return false;

  if (binding.subject_type === 'connected') {
    return Boolean(
      binding.home_id
      && draft.home_id
      && binding.home_id === draft.home_id
      && (!binding.homeowner_user_id || binding.homeowner_user_id === draft.homeowner_user_id),
    );
  }

  return Boolean(
    binding.local_home_id
    && draft.local_home_id
    && binding.local_home_id === draft.local_home_id
    && (!binding.local_contact_id || binding.local_contact_id === draft.local_contact_id),
  );
}

const SOURCE_KINDS: readonly DraftChecklistSourceKind[] = [
  'starter_inspection_checklist',
  'contractor_inspection_checklist',
  'home_inspection_checklist',
];

const WORKFLOW_KINDS: readonly DraftChecklistWorkflowKind[] = ['inspection', 'maintenance', 'assessment'];
const SNAPSHOT_KEYS = [
  'job_type',
  'rooms',
  'schema_version',
  'snapshot_fingerprint',
  'source_id',
  'source_kind',
  'source_label',
  'source_updated_at',
  'workflow_kind',
] as const;
const ROOM_KEYS = [
  'display_name',
  'items',
  'location_note',
  'room',
  'room_id',
  'room_type',
  'sort_order',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizeText(value: unknown, maxLength = 160) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function duplicateKey(value: unknown, maxLength = 160) {
  return normalizeText(value, maxLength).toLowerCase();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown) {
  const text = stableJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `draft-checklist-v1-${hash.toString(16).padStart(8, '0')}`;
}

export function normalizeDraftChecklistRooms(rooms: readonly InspectionTemplateRoom[]): DraftChecklistRoomSnapshot[] {
  const normalized = rooms
    .map((room, index) => {
      const label = normalizeText(room.display_name || room.room || `Room ${index + 1}`, 80) || `Room ${index + 1}`;
      const items = (Array.isArray(room.items) ? room.items : [])
        .map(item => normalizeText(item, 140))
        .filter(Boolean);
      return {
        room: normalizeText(room.room || label, 80) || label,
        room_id: normalizeText(room.room_id || room.room || label, 80) || label,
        display_name: label,
        room_type: normalizeText(room.room_type, 80),
        location_note: normalizeText(room.location_note, 160),
        sort_order: typeof room.sort_order === 'number' && Number.isSafeInteger(room.sort_order) ? room.sort_order : index,
        items,
      };
    })
    .filter(room => room.items.length > 0);
  validateDraftChecklistRoomStructure(normalized);
  return normalized;
}

function validateDraftChecklistRoomStructure(rooms: readonly DraftChecklistRoomSnapshot[]) {
  const roomIds = new Set<string>();
  const roomOrders = new Set<number>();
  for (const room of rooms) {
    const roomId = duplicateKey(room.room_id, 80);
    if (!roomId || roomIds.has(roomId)) throw new Error('DRAFT_CHECKLIST_SOURCE_INVALID');
    roomIds.add(roomId);
    if (roomOrders.has(room.sort_order)) throw new Error('DRAFT_CHECKLIST_SOURCE_INVALID');
    roomOrders.add(room.sort_order);
    const itemLabels = new Set<string>();
    for (const item of room.items) {
      const itemLabel = duplicateKey(item, 140);
      if (!itemLabel || itemLabels.has(itemLabel)) throw new Error('DRAFT_CHECKLIST_SOURCE_INVALID');
      itemLabels.add(itemLabel);
    }
  }
}

export function createDraftChecklistSnapshot(option: DraftChecklistSourceOption): DraftChecklistSourceSnapshot {
  const sourceKind = option.source_kind;
  const workflowKind = option.workflow_kind;
  if (!SOURCE_KINDS.includes(sourceKind) || !WORKFLOW_KINDS.includes(workflowKind)) {
    throw new Error('DRAFT_CHECKLIST_SOURCE_INVALID');
  }
  const rooms = normalizeDraftChecklistRooms(option.rooms);
  if (!normalizeText(option.source_id) || !normalizeText(option.source_label) || rooms.length === 0) {
    throw new Error('DRAFT_CHECKLIST_SOURCE_INVALID');
  }
  const snapshot = {
    schema_version: 1 as const,
    source_kind: sourceKind,
    source_id: normalizeText(option.source_id, 120),
    source_label: normalizeText(option.source_label, 160),
    workflow_kind: workflowKind,
    job_type: option.job_type === 'maintenance_visit' ? 'maintenance_visit' as const : 'inspection' as const,
    source_updated_at: option.source_updated_at ?? null,
    rooms,
  };
  return {
    ...snapshot,
    snapshot_fingerprint: fingerprint(snapshot),
  };
}

export function parseDraftChecklistSnapshot(value: unknown): DraftChecklistSourceSnapshot | null {
  if (!isRecord(value)) return null;
  if (!hasExactKeys(value, SNAPSHOT_KEYS)
    || value.schema_version !== 1
    || !SOURCE_KINDS.includes(value.source_kind as DraftChecklistSourceKind)
    || typeof value.source_id !== 'string'
    || typeof value.source_label !== 'string'
    || !WORKFLOW_KINDS.includes(value.workflow_kind as DraftChecklistWorkflowKind)
    || (value.job_type !== 'inspection' && value.job_type !== 'maintenance_visit')
    || typeof value.snapshot_fingerprint !== 'string'
    || (value.source_updated_at !== null && typeof value.source_updated_at !== 'string')
    || !Array.isArray(value.rooms)) return null;
  const rooms = value.rooms;
  if (rooms.some(room => !isRecord(room)
    || !hasExactKeys(room, ROOM_KEYS)
    || typeof room.room !== 'string'
    || typeof room.room_id !== 'string'
    || typeof room.display_name !== 'string'
    || typeof room.room_type !== 'string'
    || typeof room.location_note !== 'string'
    || typeof room.sort_order !== 'number'
    || !Number.isSafeInteger(room.sort_order)
    || !Array.isArray(room.items)
    || room.items.some(item => typeof item !== 'string'))) return null;
  try {
    const normalized = createDraftChecklistSnapshot({
      source_kind: value.source_kind as DraftChecklistSourceKind,
      source_id: value.source_id,
      source_label: value.source_label,
      workflow_kind: value.workflow_kind as DraftChecklistWorkflowKind,
      job_type: value.job_type,
      source_updated_at: value.source_updated_at,
      rooms: rooms as InspectionTemplateRoom[],
      group_label: '',
    });
    if (normalized.snapshot_fingerprint !== value.snapshot_fingerprint) return null;
    if (normalized.source_kind === 'starter_inspection_checklist' && !isCanonicalStarterChecklistSnapshot(normalized)) return null;
    return normalized;
  } catch {
    return null;
  }
}

export function canonicalStarterChecklistSnapshot(sourceId: string): DraftChecklistSourceSnapshot | null {
  const option = DRAFT_CHECKLIST_STARTER_OPTIONS.find(starter => starter.source_id === sourceId);
  return option ? createDraftChecklistSnapshot(option) : null;
}

export function isCanonicalStarterChecklistSnapshot(snapshot: DraftChecklistSourceSnapshot): boolean {
  const canonical = canonicalStarterChecklistSnapshot(snapshot.source_id);
  return Boolean(canonical && stableJson(canonical) === stableJson(snapshot));
}

export function draftChecklistRoomsToInspectionRooms(rooms: readonly DraftChecklistRoomSnapshot[]): InspectionRoomData[] {
  return rooms.map(room => ({
    room: room.room,
    room_id: room.room_id,
    display_name: room.display_name,
    room_type: room.room_type,
    location_note: room.location_note,
    reference_photo_storage_path: '',
    sort_order: room.sort_order,
    last_edited_by: '',
    last_edited_at: '',
    findings: room.items.map(title => ({
      title,
      status: DRAFT_CHECKLIST_UNANSWERED_STATUS,
      notes: '',
      action: '',
      due: '',
      photos: [],
    })),
  }));
}
