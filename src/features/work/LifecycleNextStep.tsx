import type { LifecycleNextStep as LifecycleNextStepModel } from './lifecyclePrimaryAction';

export function LifecycleNextStep({ step, state }: { step: LifecycleNextStepModel; state: string }) {
  return (
    <div
      data-testid="lifecycle-next-step"
      data-lifecycle-state={state}
      data-primary-action={step.id}
      className={`mt-3 border-l-2 py-1 pl-3 ${step.waiting ? 'border-blue-500' : 'border-slate-300'}`}
    >
      <p className={`text-[11px] font-bold uppercase ${step.waiting ? 'text-blue-700' : 'text-slate-500'}`}>Next step</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{step.title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{step.helper}</p>
    </div>
  );
}
