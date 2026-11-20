import { useState } from 'react';
import { ArrowLeftRight, Briefcase, Home, MapPin } from 'lucide-react';
import './preview.css';

type Portal = 'Homeowner' | 'Contractor';
type Example = 'dual' | 'homeowner' | 'contractor';
type Fixture = { name: string; portals: readonly Portal[]; home: string; business: string };

const examples: Record<Example, Fixture> = {
  dual: { name: 'Avery Morgan', portals: ['Homeowner', 'Contractor'], home: 'Willow Cottage', business: 'Heron Home Services' },
  homeowner: { name: 'Sam Brooks', portals: ['Homeowner'], home: 'Maple House', business: '' },
  contractor: { name: 'Riley Chen', portals: ['Contractor'], home: '', business: 'Cedar Creek Repairs' },
};

function exampleFromUrl(): Example {
  const value = new URLSearchParams(window.location.search).get('example');
  return value === 'homeowner' || value === 'contractor' ? value : 'dual';
}

function storageKey(example: Example) {
  return 'servsync.fictional-portal-preview.v1.' + example + '.portal';
}

function initialPortal(example: Example): Portal {
  const allowed = examples[example].portals;
  try {
    const saved = window.localStorage.getItem(storageKey(example));
    return allowed.find(portal => portal === saved) ?? allowed[0];
  } catch {
    return allowed[0];
  }
}

function Workspace({ fixture, portal }: { fixture: Fixture; portal: Portal }) {
  const personal = portal === 'Homeowner';
  const records = personal ? ['Annual home maintenance', 'Kitchen faucet repair'] : ['Furnace inspection', 'Deck repair estimate'];
  const [selected, setSelected] = useState('');
  const [note, setNote] = useState('');
  const Icon = personal ? Home : Briefcase;
  return <section className="workspace" aria-labelledby="workspace-title">
    <div className="workspace-icon"><Icon aria-hidden="true" size={26} /></div>
    <p className="section-label">{personal ? 'My property' : 'My business'}</p>
    <h2 id="workspace-title">{personal ? fixture.home : fixture.business}</h2>
    <div className="workspace-detail"><MapPin aria-hidden="true" size={15} />{personal ? 'Personal home workspace' : 'Contractor workspace'}</div>
    <hr />
    <label htmlFor="record">{personal ? 'Home project' : 'Customer job'}</label>
    <select id="record" value={selected} onChange={e => { setSelected(e.target.value); setNote(''); }}>
      <option value="">Choose {personal ? 'a project' : 'a job'}</option>
      {records.map(record => <option key={record}>{record}</option>)}
    </select>
    {selected && <div className="note">
      <label htmlFor="note">{personal ? 'Personal project note' : 'Job draft note'}</label>
      <textarea id="note" value={note} onChange={e => setNote(e.target.value)} aria-describedby="note-hint" rows={3} />
      <small id="note-hint">This practice note clears when you leave this project or job.</small>
    </div>}
  </section>;
}

function Account({ example }: { example: Example }) {
  const fixture = examples[example];
  const [portal, setPortal] = useState<Portal>(() => initialPortal(example));
  const other = fixture.portals.find(available => available !== portal);
  function switchTo(next: Portal) {
    if (!fixture.portals.includes(next)) return;
    setPortal(next);
    try { window.localStorage.setItem(storageKey(example), next); } catch { /* usable for this visit */ }
  }
  return <>
    <section className="portal-heading" aria-label="Current portal">
      <div><p className="section-label">{fixture.name}</p><h1 aria-live="polite">{portal} portal</h1></div>
      {other ? <button onClick={() => switchTo(other)}><ArrowLeftRight size={17} aria-hidden="true" />Switch to {other}</button>
        : <p className="single-role">This account has {portal.toLowerCase()} access only.</p>}
    </section>
    <Workspace key={portal} fixture={fixture} portal={portal} />
  </>;
}

export function PortalSwitchPreview() {
  const [example, setExample] = useState(exampleFromUrl);
  return <>
    <header><div className="bar"><span className="brand"><img src="/servsync-mark-white.png" alt="" />ServSync</span><span>Fictional Demo</span></div></header>
    <main>
      <div className="scenario">
        <label htmlFor="account">Example account</label>
        <select id="account" value={example} onChange={e => {
          const url = new URL(window.location.href);
          url.searchParams.set('example', e.target.value);
          window.history.replaceState(null, '', url);
          setExample(exampleFromUrl());
        }}>
          <option value="dual">Avery Morgan · Both portals</option>
          <option value="homeowner">Sam Brooks · Homeowner only</option>
          <option value="contractor">Riley Chen · Contractor only</option>
        </select>
        <p>Practice with fictional accounts. Only the last portal is remembered on this device.</p>
      </div>
      <Account key={example} example={example} />
    </main>
  </>;
}
