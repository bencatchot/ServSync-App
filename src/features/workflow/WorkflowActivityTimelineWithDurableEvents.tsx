import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WorkflowActivityTimeline,
  type WorkflowActivityTimelineEvent,
} from './WorkflowActivityTimeline';

type DurableWorkflowActivityEventType =
  | 'appointment_proposed'
  | 'appointment_confirmed'
  | 'estimate_approved'
  | 'estimate_declined'
  | 'job_created'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'invoice_voided';

type DurableWorkflowActivityRow = {
  id: string;
  context_type: string;
  service_request_id: string | null;
  inspection_id: string | null;
  estimate_id: string | null;
  invoice_id: string | null;
  appointment_id: string | null;
  event_type: DurableWorkflowActivityEventType | string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type WorkflowActivityContextIds = {
  serviceRequestIds?: Array<string | null | undefined>;
  inspectionIds?: Array<string | null | undefined>;
  estimateIds?: Array<string | null | undefined>;
  invoiceIds?: Array<string | null | undefined>;
};

type WorkflowActivityTimelineWithDurableEventsProps = {
  supabaseClient: SupabaseClient | null;
  derivedEvents: WorkflowActivityTimelineEvent[];
  contextIds: WorkflowActivityContextIds;
  title?: string;
  helper?: string;
  className?: string;
};

const DISPLAYED_DURABLE_EVENT_TYPES: DurableWorkflowActivityEventType[] = [
  'appointment_proposed',
  'appointment_confirmed',
  'estimate_approved',
  'estimate_declined',
  'job_created',
  'invoice_sent',
  'invoice_paid',
  'invoice_voided',
];

function uniqueIds(ids: Array<string | null | undefined> | undefined) {
  return [...new Set((ids || []).filter((id): id is string => Boolean(id)))];
}

function inFilter(column: string, ids: string[]) {
  if (ids.length === 0) return null;
  return `${column}.in.(${ids.join(',')})`;
}

function metadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function durableEventDedupeKey(event: DurableWorkflowActivityRow) {
  switch (event.event_type) {
    case 'appointment_proposed':
      return event.service_request_id
        ? `appointment_proposed:${event.service_request_id}:${metadataString(event.metadata, 'proposal_batch_id') || event.created_at}`
        : null;
    case 'appointment_confirmed':
      return event.appointment_id ? `appointment_confirmed:${event.appointment_id}` : null;
    case 'estimate_approved':
      return event.estimate_id ? `estimate_approved:${event.estimate_id}` : null;
    case 'estimate_declined':
      return event.estimate_id ? `estimate_declined:${event.estimate_id}` : null;
    case 'job_created':
      return event.inspection_id ? `job_created:${event.inspection_id}` : null;
    case 'invoice_sent':
      return event.invoice_id ? `invoice_sent:${event.invoice_id}` : null;
    case 'invoice_paid':
      return event.invoice_id ? `invoice_paid:${event.invoice_id}` : null;
    case 'invoice_voided':
      return event.invoice_id ? `invoice_voided:${event.invoice_id}` : null;
    default:
      return null;
  }
}

function durableEventDefaults(eventType: DurableWorkflowActivityEventType): Omit<WorkflowActivityTimelineEvent, 'id' | 'dedupeKey' | 'timestamp'> {
  switch (eventType) {
    case 'appointment_proposed':
      return {
        label: 'Visit times proposed',
        detail: 'Visit options were shared for review.',
        tone: 'blue',
        icon: 'appointment',
      };
    case 'appointment_confirmed':
      return {
        label: 'Appointment confirmed',
        detail: 'The visit time was confirmed.',
        tone: 'emerald',
        icon: 'appointment',
      };
    case 'estimate_approved':
      return {
        label: 'Estimate approved',
        detail: 'The estimate was approved.',
        tone: 'emerald',
        icon: 'estimate',
      };
    case 'estimate_declined':
      return {
        label: 'Estimate declined',
        detail: 'The estimate was declined.',
        tone: 'amber',
        icon: 'estimate',
      };
    case 'job_created':
      return {
        label: 'Job created',
        detail: 'A job was created for this work.',
        tone: 'blue',
        icon: 'job',
      };
    case 'invoice_sent':
      return {
        label: 'Invoice sent',
        detail: 'The invoice was sent.',
        tone: 'blue',
        icon: 'invoice',
      };
    case 'invoice_paid':
      return {
        label: 'Invoice marked paid',
        detail: 'The invoice was marked paid.',
        tone: 'emerald',
        icon: 'invoice',
      };
    case 'invoice_voided':
      return {
        label: 'Invoice voided',
        detail: 'The invoice was voided.',
        tone: 'red',
        icon: 'invoice',
      };
  }
}

function mergeWorkflowActivityEvents(
  derivedEvents: WorkflowActivityTimelineEvent[],
  durableRows: DurableWorkflowActivityRow[],
) {
  const derivedByKey = new Map<string, WorkflowActivityTimelineEvent>();
  for (const event of derivedEvents) {
    if (event.dedupeKey) derivedByKey.set(event.dedupeKey, event);
  }

  const durableEvents: WorkflowActivityTimelineEvent[] = [];
  for (const row of durableRows) {
    if (!DISPLAYED_DURABLE_EVENT_TYPES.includes(row.event_type as DurableWorkflowActivityEventType)) continue;
    const dedupeKey = durableEventDedupeKey(row);
    if (!dedupeKey) continue;
    const fallback = derivedByKey.get(dedupeKey);
    const defaults = durableEventDefaults(row.event_type as DurableWorkflowActivityEventType);
    durableEvents.push({
      ...defaults,
      ...fallback,
      id: `durable-${row.id}`,
      dedupeKey,
      timestamp: row.created_at,
    });
  }

  const durableKeys = new Set(durableEvents.map(event => event.dedupeKey).filter(Boolean));
  const fallbackEvents = derivedEvents.filter(event => !event.dedupeKey || !durableKeys.has(event.dedupeKey));
  return [...durableEvents, ...fallbackEvents];
}

export function WorkflowActivityTimelineWithDurableEvents({
  supabaseClient,
  derivedEvents,
  contextIds,
  title,
  helper,
  className = '',
}: WorkflowActivityTimelineWithDurableEventsProps) {
  const [durableRows, setDurableRows] = useState<DurableWorkflowActivityRow[]>([]);
  const [fetchFailed, setFetchFailed] = useState(false);
  const serviceRequestIds = useMemo(() => uniqueIds(contextIds.serviceRequestIds), [contextIds.serviceRequestIds]);
  const inspectionIds = useMemo(() => uniqueIds(contextIds.inspectionIds), [contextIds.inspectionIds]);
  const estimateIds = useMemo(() => uniqueIds(contextIds.estimateIds), [contextIds.estimateIds]);
  const invoiceIds = useMemo(() => uniqueIds(contextIds.invoiceIds), [contextIds.invoiceIds]);
  const queryKey = useMemo(
    () => [serviceRequestIds, inspectionIds, estimateIds, invoiceIds].map(ids => ids.join('|')).join('::'),
    [estimateIds, inspectionIds, invoiceIds, serviceRequestIds],
  );

  useEffect(() => {
    let cancelled = false;
    const filters = [
      inFilter('service_request_id', serviceRequestIds),
      inFilter('inspection_id', inspectionIds),
      inFilter('estimate_id', estimateIds),
      inFilter('invoice_id', invoiceIds),
    ].filter((filter): filter is string => Boolean(filter));

    if (!supabaseClient || filters.length === 0) {
      setDurableRows([]);
      setFetchFailed(false);
      return;
    }

    const loadDurableEvents = async () => {
      setFetchFailed(false);
      const { data, error } = await supabaseClient
        .from('workflow_activity_events')
        .select('id, context_type, service_request_id, inspection_id, estimate_id, invoice_id, appointment_id, event_type, metadata, created_at')
        .in('event_type', DISPLAYED_DURABLE_EVENT_TYPES)
        .or(filters.join(','))
        .order('created_at', { ascending: false })
        .limit(50);

      if (cancelled) return;
      if (error) {
        setDurableRows([]);
        setFetchFailed(true);
        return;
      }
      setDurableRows((data || []) as DurableWorkflowActivityRow[]);
    };

    void loadDurableEvents();
    return () => {
      cancelled = true;
    };
  }, [queryKey, supabaseClient]);

  const mergedEvents = useMemo(
    () => mergeWorkflowActivityEvents(derivedEvents, durableRows),
    [derivedEvents, durableRows],
  );

  return (
    <div className={className}>
      <WorkflowActivityTimeline
        events={mergedEvents}
        title={title}
        helper={helper}
      />
      {fetchFailed && (
        <p data-testid="workflow-activity-delayed-notice" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Some activity may be delayed.
        </p>
      )}
    </div>
  );
}
