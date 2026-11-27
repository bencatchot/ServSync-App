import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InspectionAiConsent, type InspectionAiRequest } from '../../../../src/features/findings/InspectionAiConsent';
import '../../../../src/index.css';

function Fixture() {
  const [draft, setDraft] = useState<{ scope: number; notes: string } | null>(null);
  const [room, setRoom] = useState('Utility room');
  const [inspection, setInspection] = useState(1);
  const [mode, setMode] = useState<'ai' | 'walk'>('ai');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const notes = draft?.scope === inspection ? draft.notes : '';
  async function send(request: InspectionAiRequest) {
    setBusy(true);
    try {
      const response = await fetch('/functions/v1/inspection-ai', {
        method: 'POST',
        body: JSON.stringify(request),
        headers: { 'Content-Type': 'application/json' },
      });
      setStatus(response.ok ? 'Got suggestions' : 'Suggestions unavailable');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="m-4 max-w-[18rem] space-y-3">
      <button type="button" onClick={() => setMode('walk')}>Walk</button>
      <button type="button" onClick={() => setMode('ai')}>AI</button>
      {mode === 'ai' ? (
        <>
          <label className="block">Notes <textarea value={notes} onChange={event => setDraft({ scope: inspection, notes: event.target.value })} /></label>
          <label className="block">Room <input value={room} onChange={event => setRoom(event.target.value)} /></label>
          <button type="button" onClick={() => setInspection(inspection + 1)}>Switch inspection</button>
          <InspectionAiConsent key={inspection} request={{ notes, rooms: [{ room, items: ['Check drain line'] }] }}
            busy={busy} enabled onApprove={send} />
          <p role="status">{status}</p>
        </>
      ) : <p>Manual walkthrough, no AI transfer</p>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
