// Synthetic interaction fixture ONLY. Has no network client, persistence, or production imports.
import type { Entry, ExpenseGateway, LedgerView, Scope, Submission } from './ledger';
import { validateSubmission } from './ledger';
type Role = 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer' | 'homeowner';
export interface Actor { company: string; user: string; role: Role; active: boolean }
export interface Work { company: string; estimateId: string | null; acceptedPreTaxCents: number | null; jobId: string | null; assigned: string[] }
interface Row { company: string; work: Work; actorId: string; entry: Entry; receipt?: File; requestId: string; voided: boolean }

export class ReviewFixture {
  private rows: Row[] = [];
  constructor(private works: Work[]) {}
  private resolve(actor: Actor, scope: Scope) {
    if (!actor.active || !actor.company || !actor.user) return null;
    const found = this.works.filter(w => w.company === actor.company && (scope.kind === 'job' ? w.jobId === scope.id : w.estimateId === scope.id));
    if (found.length !== 1) return null;
    const work = found[0];
    if (['owner','admin','office'].includes(actor.role)) return { work, manager: true };
    if (actor.role === 'field_tech' && scope.kind === 'job' && work.assigned.includes(actor.user)) return { work, manager: false };
    return null;
  }
  as(actor: Actor): ExpenseGateway {
    const denied = () => { throw Error('Expenses are unavailable for this account or work item.'); };
    const requireRow = (scope: Scope, id: string) => {
      const ctx = this.resolve(actor, scope);
      const row = ctx?.manager && this.rows.find(r => r.work === ctx.work && !r.voided && r.entry.id === id);
      if (!row) return denied();
      return row;
    };
    return {
      read: (scope): LedgerView => {
        const ctx = this.resolve(actor, scope);
        if (!ctx) return {kind:'unavailable'};
        if (!ctx.manager) return {kind:'capture'};
        const entries = this.rows.filter(r => !r.voided && r.work === ctx.work).map(r => ({...r.entry})).reverse();
        const costsCents = entries.reduce((n,e)=>n+e.amountCents, 0);
        const accepted = ctx.work.acceptedPreTaxCents;
        return {kind:'manage', entries, costsCents, acceptedPreTaxCents:accepted, projectedGrossCents:accepted === null ? null : accepted-costsCents};
      },
      submit: (scope, input: Submission) => {
        const ctx = this.resolve(actor, scope);
        if (!ctx) return denied();
        validateSubmission(input);
        if (this.rows.some(r => r.work===ctx.work && r.actorId===actor.user && r.requestId===input.requestId)) return;
        this.rows.push({company:ctx.work.company, work:ctx.work, actorId:actor.user, requestId:input.requestId, voided:false,
          receipt:input.receipt, entry:{id:crypto.randomUUID(), amountCents:input.amountCents, category:input.category, day:input.day, vendor:input.vendor.trim(), hasReceipt:!!input.receipt}});
      },
      receipt: (scope,id) => requireRow(scope,id).receipt ?? null,
      void: (scope,id) => { requireRow(scope,id).voided = true; }
    };
  }
}
