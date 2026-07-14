import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('FB-032 contractor Service Agreements UI source guardrails', () => {
  test('adds Service Agreements as a Jobs workspace subview with conservative copy', () => {
    const source = appSource();
    const overviewSource = sourceBetween(
      source,
      "{contractorJobsView === 'overview' && (",
      "{contractorJobsView === 'new_financial' && (",
    );
    const serviceAgreementSource = sourceBetween(
      source,
      "{contractorJobsView === 'service_agreements' && (",
      "{contractorJobsView === 'templates' && (",
    );

    expect(source).toContain("type ContractorJobsView = 'overview'");
    expect(source).toContain("'service_agreements'");
    expect(overviewSource).toContain("setContractorJobsViewAndScroll('service_agreements')");
    expect(overviewSource).toContain('Service Agreements');
    expect(serviceAgreementSource).toContain('<Card title="Service Agreements"');
    expect(serviceAgreementSource).toContain('title="Draft service agreement"');
    expect(serviceAgreementSource).toContain('Not visible to the homeowner yet. Save the draft, then send when ready.');
    expect(serviceAgreementSource).toContain('Choose one explicitly shared property for each offer.');
    expect(serviceAgreementSource).toContain('Homeowners can review and respond after an offer is sent, and accepted agreements stay read-only.');
    expect(serviceAgreementSource).toContain('Scheduling and billing are coordinated separately.');
    expect(serviceAgreementSource).toContain('This does not create jobs, schedule visits, create invoices, set up autopay, send reminders or notifications, or run automation.');
    expect(serviceAgreementSource).not.toContain('Homeowner review and response is planned for a later slice.');
  });

  test('loads manager-visible lists with direct RLS-scoped reads only after manager checks', () => {
    const source = appSource();
    const loadSource = sourceBetween(
      source,
      'const loadContractor = useCallback(async () => {',
      'useEffect(() => {\n    void loadContractor();',
    );

    expect(loadSource).toContain('userCanManageServiceAgreementUi(loadedContractor, loadedTeamAccess, profile.id)');
    expect(loadSource).toContain(".from('service_agreement_templates')");
    expect(loadSource).toContain(".from('service_agreement_offers')");
    expect(loadSource).toContain(".eq('contractor_id', loadedContractor.id)");
    expect(loadSource).toContain('setServiceAgreementTemplates([]);');
    expect(loadSource).toContain('setServiceAgreementOffers([]);');
  });

  test('uses existing RPCs for writes and avoids direct frontend table mutations', () => {
    const source = appSource();
    const mutationSource = sourceBetween(
      source,
      'const resetServiceAgreementTemplateDraft = () => {',
      'const resetContractorPriceBookCsvImport = () => {',
    );

    for (const rpc of [
      'servsync_create_service_agreement_template',
      'servsync_update_service_agreement_template',
      'servsync_create_service_agreement_offer',
      'servsync_send_service_agreement_offer',
    ]) {
      expect(mutationSource).toContain(rpc);
    }

    for (const table of [
      'service_agreement_templates',
      'service_agreement_offers',
      'service_agreements',
    ]) {
      expect(mutationSource).not.toContain(`.from('${table}').insert`);
      expect(mutationSource).not.toContain(`.from('${table}').update`);
      expect(mutationSource).not.toContain(`.from('${table}').delete`);
    }

    expect(mutationSource).not.toContain('servsync_homeowner_respond_to_service_agreement_offer');
  });

  test('keeps property selection limited to explicitly shared connection homes', () => {
    const source = appSource();
    const derivedSource = sourceBetween(
      source,
      'const activeServiceAgreementTemplates = serviceAgreementTemplates',
      'const estimateSavedItemSearchText = normalizeText(estimateSavedItemSearch.trim());',
    );
    const uiSource = sourceBetween(
      source,
      "{contractorJobsView === 'service_agreements' && (",
      "{contractorJobsView === 'templates' && (",
    );

    expect(derivedSource).toContain('serviceAgreementEligibleConnections = connections');
    expect(derivedSource).toContain("connection.status === 'active'");
    expect(derivedSource).toContain('connectedHomeList(connection).some(home => Boolean(home.id))');
    expect(derivedSource).toContain('selectedServiceAgreementOfferHomes = selectedServiceAgreementOfferConnection');
    expect(derivedSource).toContain('connectedHomeList(selectedServiceAgreementOfferConnection).filter(home => Boolean(home.id))');
    expect(uiSource).toContain('Explicitly shared property');
    expect(uiSource).toContain('selectedServiceAgreementOfferHomes.map');
    expect(uiSource).not.toContain("from('homes')");
    expect(uiSource).not.toContain('homeowner_user_id');
  });

  test('preserves role and read-only boundaries for create/edit/send controls', () => {
    const source = appSource();
    const roleHelperSource = sourceBetween(
      source,
      'function userCanManageServiceAgreementUi',
      'function getContractorDisabledReason',
    );
    const serviceAgreementSource = sourceBetween(
      source,
      "{contractorJobsView === 'service_agreements' && (",
      "{contractorJobsView === 'templates' && (",
    );

    expect(roleHelperSource).toContain('contractor.owner_user_id === profileId');
    expect(roleHelperSource).toContain("activeMember?.role === 'admin' || activeMember?.role === 'office'");
    expect(roleHelperSource).not.toContain("'field_tech'");
    expect(roleHelperSource).not.toContain("'viewer'");
    expect(source).toContain('serviceAgreementActionsDisabledReason = isContractorReadOnly');
    expect(source).toContain('Only the contractor owner, admin, or office role');
    expect(serviceAgreementSource).toContain('serviceAgreementControlsDisabled');
    expect(serviceAgreementSource).toContain('canManageServiceAgreements');
  });

  test('does not add visits, homeowner response UI, or automation integrations', () => {
    const source = appSource();
    const serviceAgreementSource = sourceBetween(
      source,
      "{contractorJobsView === 'service_agreements' && (",
      "{contractorJobsView === 'templates' && (",
    );

    expect(serviceAgreementSource).not.toContain('service_agreement_visits');
    expect(serviceAgreementSource).not.toContain('servsync_homeowner_respond_to_service_agreement_offer');
    expect(serviceAgreementSource).not.toContain('stripe');
    expect(serviceAgreementSource).not.toContain('quickbooks');
    expect(serviceAgreementSource).not.toContain('e-signature integration');
    expect(serviceAgreementSource).not.toContain('send-notification-email');
    expect(serviceAgreementSource).not.toContain('send-home-access-invite-email');
    expect(serviceAgreementSource).not.toContain("from('inspections').insert");
    expect(serviceAgreementSource).not.toContain("from('invoices').insert");
    expect(serviceAgreementSource).not.toContain("from('notifications').insert");
  });
});
