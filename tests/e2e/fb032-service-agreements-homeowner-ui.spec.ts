import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('FB-032 homeowner Service Agreements UI source guardrails', () => {
  test('adds Service Agreements to the homeowner Estimates / Invoices area', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const recordsPageSource = sourceBetween(
      homeownerSource,
      'const renderHomeownerEstimatesInvoicesPage = () => (',
      'const homeownerClosedRequestStatuses',
    );

    expect(recordsPageSource).toContain('Review estimates, invoices, and service agreement offers from connected contractors');
    expect(homeownerSource).toContain("title: 'Agreement Offers'");
    expect(homeownerSource).toContain("title: 'Agreements'");
    expect(homeownerSource).toContain('visibleServiceAgreementOffers.map(renderHomeownerServiceAgreementOfferCard)');
    expect(homeownerSource).toContain('visibleServiceAgreements.map(renderHomeownerServiceAgreementCard)');
    expect(source).toContain("type HomeownerTab = 'overview'");
    expect(source).not.toContain("'service_agreements_homeowner'");
  });

  test('loads homeowner-visible offers and agreements with RLS-scoped direct reads', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const loadSource = sourceBetween(
      homeownerSource,
      'const loadHomeowner = useCallback(async () => {',
      'useEffect(() => {\n    void loadHomeowner();',
    );

    expect(loadSource).toContain(".from('service_agreement_offers')");
    expect(loadSource).toContain(".eq('homeowner_user_id', profile.id)");
    expect(loadSource).toContain(".neq('status', 'draft')");
    expect(loadSource).toContain(".from('service_agreements')");
    expect(loadSource).not.toContain(".from('service_agreement_templates')");
  });

  test('accept and decline use the homeowner response RPC only', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const responseSource = sourceBetween(
      homeownerSource,
      "const respondToServiceAgreementOffer = async (offer: ServiceAgreementOffer, response: 'accepted' | 'declined') => {",
      'const viewHomeownerInvoice = async',
    );
    const offerCardSource = sourceBetween(
      homeownerSource,
      'const renderHomeownerServiceAgreementOfferCard = (offer: ServiceAgreementOffer) => {',
      'const renderHomeownerServiceAgreementCard = (agreement: ServiceAgreement) => {',
    );

    expect(responseSource).toContain("supabase.rpc('servsync_homeowner_respond_to_service_agreement_offer'");
    expect(responseSource).toContain("p_response: response");
    expect(offerCardSource).toContain("respondToServiceAgreementOffer(offer, 'accepted')");
    expect(offerCardSource).toContain("respondToServiceAgreementOffer(offer, 'declined')");
    expect(homeownerSource).not.toContain('servsync_create_service_agreement_template');
    expect(homeownerSource).not.toContain('servsync_update_service_agreement_template');
    expect(homeownerSource).not.toContain('servsync_create_service_agreement_offer');
    expect(homeownerSource).not.toContain('servsync_send_service_agreement_offer');
  });

  test('keeps homeowner UI read-only except the response RPC', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');

    for (const table of [
      'service_agreement_templates',
      'service_agreement_offers',
      'service_agreements',
    ]) {
      expect(homeownerSource).not.toContain(`.from('${table}').insert`);
      expect(homeownerSource).not.toContain(`.from('${table}').update`);
      expect(homeownerSource).not.toContain(`.from('${table}').delete`);
    }

    expect(homeownerSource).not.toContain('Create service agreement template');
    expect(homeownerSource).not.toContain('Save draft offer');
    expect(homeownerSource).not.toContain('Send offer');
  });

  test('renders homeowner guardrail copy and read-only agreement cards', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const agreementCardSource = sourceBetween(
      homeownerSource,
      'const renderHomeownerServiceAgreementCard = (agreement: ServiceAgreement) => {',
      'const renderHomeownerInvoiceCard = (invoice: Invoice',
    );

    expect(homeownerSource).toContain('Accepting this agreement does not set up autopay.');
    expect(homeownerSource).toContain('Accepting does not create an invoice, schedule a visit, or create a job.');
    expect(homeownerSource).toContain('This is not a legal e-signature flow.');
    expect(homeownerSource).toContain('Your contractor will still coordinate scheduling and billing separately.');
    expect(agreementCardSource).toContain('data-testid="homeowner-service-agreement-card"');
    expect(agreementCardSource).toContain('This agreement was accepted and is now read-only.');
    expect(agreementCardSource).not.toContain('respondToServiceAgreementOffer');
  });

  test('does not add visits, automation, payments, notification delivery, or scheduling hooks', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const agreementSource = sourceBetween(
      homeownerSource,
      'const respondToServiceAgreementOffer = async',
      'const renderHomeownerInvoiceCard = (invoice: Invoice',
    );

    expect(agreementSource).not.toContain('service_agreement_visits');
    expect(agreementSource).not.toContain("from('inspections').insert");
    expect(agreementSource).not.toContain("from('invoices').insert");
    expect(agreementSource).not.toContain("from('home_reminders').insert");
    expect(agreementSource).not.toContain("from('notifications').insert");
    expect(agreementSource).not.toContain('send-notification-email');
    expect(agreementSource).not.toContain('send-home-access-invite-email');
    expect(agreementSource).not.toContain('stripe');
    expect(agreementSource).not.toContain('quickbooks');
    expect(agreementSource).not.toContain('recurrence');
  });
});
