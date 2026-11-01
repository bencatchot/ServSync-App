import type { ComponentProps } from 'react';
import { ContractorFirstEstimateGuide } from './ContractorFirstEstimateGuide';
import type { ContractorWorkspaceTab } from '../navigation/contractorWorkspaceNavigation';

type Props = ComponentProps<typeof ContractorFirstEstimateGuide> & {
  activeTab: ContractorWorkspaceTab;
  onOpenPractice: () => void;
};

export function ContractorPracticeWorkspace({ activeTab, onOpenPractice, ...guideProps }: Props) {
  return <>
    {activeTab === 'overview' && <section className="mb-5 rounded-2xl border border-blue-200 bg-white p-4 md:p-6" aria-label="Practice estimate entry">
      <h2 className="text-lg font-bold text-slate-950">Try your first estimate</h2>
      <p className="my-2 text-sm text-slate-600">Explore a fictional sample, preview a customer PDF and learn the steps before starting real work.</p>
      <button type="button" className="min-h-11 rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700" onClick={onOpenPractice}>Try practice estimate builder</button>
    </section>}
    {/* Keep the editor mounted across workspace navigation, even when browser storage is unavailable. */}
    <div hidden={activeTab !== 'practice'} data-testid="contractor-practice-workspace">
      <h2 className="mb-4 text-xl font-bold text-slate-950">Practice estimate builder</h2>
      <ContractorFirstEstimateGuide {...guideProps} />
    </div>
  </>;
}
