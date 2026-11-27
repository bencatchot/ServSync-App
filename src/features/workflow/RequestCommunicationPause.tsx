export function RequestCommunicationPausedNotice() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" role="status">
      <p>Replies, attachments, and shared notes are unavailable. You can still update appointments or close the request without a note.</p>
      <a className="font-semibold text-blue-700 underline" href="mailto:support@servsync.app">Contact ServSync support</a>
    </div>
  );
}
