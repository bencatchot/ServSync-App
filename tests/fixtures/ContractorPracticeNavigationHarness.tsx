import { useContractorPracticeAccess } from '../../src/features/navigation/useContractorPracticeAccess';
import { useState } from 'react';
import { ContractorPracticeWorkspace } from '../../src/features/onboarding/ContractorPracticeWorkspace';
import { useContractorWorkspaceNavigation } from '../../src/features/navigation/useContractorWorkspaceNavigation';
import { MobileNavigationDialog } from '../../src/features/navigation/MobileNavigationDialog';

// Synthetic app replacement: the browser still executes the real src/main.tsx entry lifecycle.
export default function ContractorPracticeNavigationHarness() {
  const { tab, setTab } = useContractorWorkspaceNavigation();
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const [pending, setPending] = useState(params.has('pending'));
  const eligible = !params.has('ineligible') && !pending;
  useContractorPracticeAccess(tab, setTab, eligible, pending);
  const [menu, setMenu] = useState(false);
  const links = (['overview', 'practice', 'work'] as const).map((name, i) => <button key={name} className="p-3" onClick={() => { setTab(name); setMenu(false); }}>{['Dashboard', 'Practice', 'Work'][i]}</button>);
  const [realRoute, setRealRoute] = useState('');
  return <main className="mx-auto max-w-6xl p-4">
    {pending && <button onClick={() => setPending(false)}>Resolve eligible access</button>}
    <nav aria-label="Workspace" className="hidden md:block">{links}</nav>
    <button className="md:hidden" onClick={() => setMenu(true)}>More</button>
    {menu && <MobileNavigationDialog onClose={() => setMenu(false)}>{links}</MobileNavigationDialog>}
    <output data-testid="active-tab">{tab}</output>
    {eligible && <ContractorPracticeWorkspace activeTab={tab} onOpenPractice={() => setTab('practice')}
      identity="synthetic-navigation:synthetic-business" businessName="Fictional Company" hasEstimates={false} canStartReal
      onStartReal={() => { setRealRoute('new-empty-real-draft'); setTab('work'); }}
      onResumeReal={() => { setRealRoute('saved-drafts'); setTab('work'); }}
      onBusiness={() => setTab('profile')} onPrices={() => setTab('work')} onCustomers={() => setTab('connections')} />}
    <output id="real-navigation">{realRoute}</output>
  </main>;
}
