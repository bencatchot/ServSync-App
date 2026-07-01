import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Send } from 'lucide-react';
import { formatDateTime } from '../../utils/format';

type WorkflowMessageRow = {
  id: string;
  context_type: 'job';
  service_request_id: string | null;
  inspection_id: string | null;
  contractor_id: string;
  homeowner_user_id: string;
  sender_user_id: string;
  sender_role: 'homeowner' | 'contractor' | string;
  body: string;
  created_at: string;
};

type WorkflowMessageThreadProps = {
  supabaseClient: SupabaseClient;
  currentUserId: string;
  inspectionId: string;
  title?: string;
  helper?: string;
  canSend: boolean;
  readOnlyReason?: string;
  className?: string;
  onMarkedRead?: (inspectionId: string) => void;
};

function senderLabel(message: WorkflowMessageRow, currentUserId: string) {
  if (message.sender_user_id === currentUserId) return 'You';
  if (message.sender_role === 'homeowner') return 'Homeowner';
  if (message.sender_role === 'contractor') return 'Contractor';
  return 'ServSync';
}

export function WorkflowMessageThread({
  supabaseClient,
  currentUserId,
  inspectionId,
  title = 'Customer messages',
  helper = 'Messages about this job stay connected to the job record.',
  canSend,
  readOnlyReason,
  className = '',
  onMarkedRead,
}: WorkflowMessageThreadProps) {
  const [messages, setMessages] = useState<WorkflowMessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');

  const markRead = useCallback(async () => {
    const { error } = await supabaseClient.rpc('servsync_mark_workflow_thread_read', {
      p_context_type: 'job',
      p_service_request_id: null,
      p_inspection_id: inspectionId,
    });
    if (!error) onMarkedRead?.(inspectionId);
  }, [inspectionId, onMarkedRead, supabaseClient]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabaseClient
      .from('workflow_messages')
      .select('id, context_type, service_request_id, inspection_id, contractor_id, homeowner_user_id, sender_user_id, sender_role, body, created_at')
      .eq('context_type', 'job')
      .eq('inspection_id', inspectionId)
      .order('created_at', { ascending: true });

    if (error) {
      setMessages([]);
      setLoadError('Unable to load job messages right now.');
      setLoading(false);
      return;
    }

    setMessages((data || []) as WorkflowMessageRow[]);
    setLoading(false);
    void markRead();
  }, [inspectionId, markRead, supabaseClient]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || sending || !canSend) return;

    setSending(true);
    setSendError('');
    const { data, error } = await supabaseClient.rpc('servsync_send_workflow_message', {
      p_context_type: 'job',
      p_body: body,
      p_service_request_id: null,
      p_inspection_id: inspectionId,
    });

    if (error) {
      setSendError('Unable to send this job message. Please check the job context and try again.');
      setSending(false);
      return;
    }

    setDraft('');
    if (data && typeof data === 'object' && 'id' in data) {
      setMessages(current => [...current.filter(message => message.id !== (data as WorkflowMessageRow).id), data as WorkflowMessageRow]);
      void markRead();
    } else {
      await loadMessages();
    }
    setSending(false);
  };

  return (
    <section data-testid="workflow-message-thread" className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Job thread</span>
      </div>

      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-slate-400">Loading job messages...</p>}
        {!loading && loadError && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{loadError}</p>
        )}
        {!loading && !loadError && messages.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            No job messages yet.
          </p>
        )}
        {!loading && !loadError && messages.map(message => {
          const isCurrentUser = message.sender_user_id === currentUserId;
          return (
            <div
              key={message.id}
              data-testid="workflow-message"
              className={`rounded-xl border px-3 py-2 ${isCurrentUser ? 'border-blue-100 bg-blue-50/70' : 'border-slate-200 bg-slate-50'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`text-xs font-bold uppercase tracking-[0.12em] ${isCurrentUser ? 'text-blue-700' : 'text-slate-400'}`}>
                  {senderLabel(message, currentUserId)}
                </p>
                <p className="text-xs font-medium text-slate-400">{formatDateTime(message.created_at)}</p>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{message.body}</p>
            </div>
          );
        })}
      </div>

      {canSend ? (
        <div data-testid="workflow-message-composer" className="mt-4 space-y-2">
          <label className="block text-xs font-semibold text-slate-500" htmlFor={`workflow-message-${inspectionId}`}>
            Add job message
          </label>
          <textarea
            id={`workflow-message-${inspectionId}`}
            data-testid="workflow-message-input"
            className="min-h-[88px] w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
            value={draft}
            onChange={event => {
              setDraft(event.target.value);
              if (sendError) setSendError('');
            }}
            placeholder="Write a job-specific update..."
          />
          {sendError && <p className="text-sm font-medium text-red-600">{sendError}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="workflow-message-send"
              onClick={() => void sendMessage()}
              disabled={sending || !draft.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={15} />
              {sending ? 'Sending...' : 'Send message'}
            </button>
          </div>
        </div>
      ) : (
        <p data-testid="workflow-message-readonly-notice" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          {readOnlyReason || 'You can view this job thread, but this role cannot send customer-visible job messages.'}
        </p>
      )}
    </section>
  );
}
