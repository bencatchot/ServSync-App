import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

type LegalPageType = 'privacy' | 'terms' | 'service-terms' | 'inspection-disclaimer' | 'emergency-notice' | 'communications-consent' | 'photo-consent' | 'billing-terms' | 'portal-notice';

const EFFECTIVE_DATE = 'May 14, 2026';

const PAGE_META: Record<LegalPageType, { title: string; subtitle: string }> = {
  privacy: { title: 'Privacy Policy', subtitle: 'How ServSync collects, uses, and protects customer information.' },
  terms: { title: 'Terms of Use', subtitle: 'Rules for using the ServSync app and customer portal.' },
  'service-terms': { title: 'Home Maintenance Service Terms', subtitle: 'General terms for recurring home maintenance services.' },
  'inspection-disclaimer': { title: 'Inspection Limitations Disclaimer', subtitle: 'Important limits of routine visual maintenance inspections.' },
  'emergency-notice': { title: 'Emergency Notice', subtitle: 'The customer portal is not an emergency response system.' },
  'communications-consent': { title: 'Electronic Communications Consent', subtitle: 'Consent for service-related email, phone, text, and portal communications.' },
  'photo-consent': { title: 'Photo and Media Consent Notice', subtitle: 'How property photos are used for service documentation.' },
  'billing-terms': { title: 'Billing and Payment Terms', subtitle: 'General payment, invoice, and plan-change terms.' },
  'portal-notice': { title: 'Customer Portal Notice', subtitle: 'Important information about portal records and account access.' },
};

export default function LegalPage({ type }: { type: LegalPageType }) {
  const meta = PAGE_META[type];
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="bg-blue-600 text-white px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
              <ShieldCheck size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{meta.title}</h1>
              <p className="text-blue-100 text-sm">ServSync</p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6 text-slate-600 text-sm leading-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800 text-xs leading-5">
            These documents are practical business drafts and should be reviewed by an attorney before relying on them with paying customers.
          </div>
          <p><strong>Effective Date:</strong> {EFFECTIVE_DATE}</p>
          <p>{meta.subtitle}</p>
          {renderLegalContent(type)}
          <LegalNav />
        </div>
      </div>
    </div>
  );
}

export function LegalLinks({ compact = false }: { compact?: boolean }) {
  const className = compact ? 'text-blue-600 font-semibold hover:text-blue-700' : 'text-blue-600 font-semibold hover:text-blue-700 underline-offset-2 hover:underline';
  return (
    <>
      <a href="/#/privacy" target="_blank" rel="noreferrer" className={className}>Privacy Policy</a>
      {' · '}
      <a href="/#/terms" target="_blank" rel="noreferrer" className={className}>Terms of Use</a>
      {' · '}
      <a href="/#/service-terms" target="_blank" rel="noreferrer" className={className}>Service Terms</a>
      {' · '}
      <a href="/#/inspection-disclaimer" target="_blank" rel="noreferrer" className={className}>Inspection Disclaimer</a>
    </>
  );
}

function renderLegalContent(type: LegalPageType) {
  switch (type) {
    case 'privacy': return <PrivacyContent />;
    case 'terms': return <TermsContent />;
    case 'service-terms': return <ServiceTermsContent />;
    case 'inspection-disclaimer': return <InspectionDisclaimerContent />;
    case 'emergency-notice': return <EmergencyNoticeContent />;
    case 'communications-consent': return <CommunicationsConsentContent />;
    case 'photo-consent': return <PhotoConsentContent />;
    case 'billing-terms': return <BillingTermsContent />;
    case 'portal-notice': return <PortalNoticeContent />;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-bold text-slate-800 mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return <ul className="list-disc pl-5 space-y-1">{items.map(item => <li key={item}>{item}</li>)}</ul>;
}

function LegalNav() {
  const links: Array<[LegalPageType, string]> = [
    ['privacy', 'Privacy'], ['terms', 'Terms'], ['service-terms', 'Service Terms'], ['inspection-disclaimer', 'Inspection Disclaimer'],
    ['emergency-notice', 'Emergency'], ['communications-consent', 'Communications'], ['photo-consent', 'Photo Consent'], ['billing-terms', 'Billing'], ['portal-notice', 'Portal Notice'],
  ];
  return (
    <div className="pt-4 border-t border-slate-100 space-y-3">
      <div className="flex flex-wrap gap-2">
        {links.map(([type, label]) => <a key={type} href={`/#/${type}`} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700">{label}</a>)}
      </div>
      <div className="flex flex-wrap gap-3">
        <a href="/#/login" className="text-blue-600 font-semibold hover:text-blue-700">Back to sign in</a>
        <a href="https://servsync.app" className="text-slate-500 font-semibold hover:text-slate-700">servsync.app</a>
      </div>
    </div>
  );
}

function PrivacyContent() {
  return <>
    <Section title="1. Information We Collect"><p>We may collect customer information such as name, email address, phone number, property address, account login information, service plan information, customer requests, and notes.</p><p>We may also collect property and home maintenance information such as home details, preferred vendors, checklist items, findings, recommendations, photos, reports, invoices, and appointment history.</p><p>We may collect basic technical information needed to operate and secure the platform, such as login activity, device/browser information, IP address, and usage data.</p></Section>
    <Section title="2. How We Use Information"><p>We use collected information to provide home maintenance inspections and related services, create and store reports, manage customer accounts and portals, schedule inspections, respond to customer requests, prepare invoices, improve our services, maintain security, and communicate about onboarding, appointments, reports, invoices, and service updates.</p></Section>
    <Section title="3. Photos, Reports, and Property Records"><p>Inspection photos, service photos, written findings, reports, invoices, and property history may be stored in your customer record to provide ongoing service and historical maintenance tracking.</p></Section>
    <Section title="4. Sharing of Information"><p>We do not sell customer personal information. We may share information only when necessary to provide requested services, support business operations, comply with legal obligations, or protect our rights, customers, property, or platform.</p></Section>
    <Section title="5. Third-Party Services"><p>Our platform may use trusted third-party providers for hosting, database, storage, authentication, email delivery, accounting, payments, calendars, SMS, and notifications. These providers may process information according to their own privacy policies.</p></Section>
    <Section title="6. Security and Retention"><p>We use reasonable safeguards such as authentication, access controls, and database security rules. No system can be guaranteed completely secure. We retain customer and property records as long as reasonably necessary for services, business records, legal obligations, disputes, and historical maintenance tracking.</p></Section>
    <Section title="7. Contact"><p>ServSync<br />Website: servsync.app<br />App: servsync.app<br />Email: ben@servsync.app</p></Section>
  </>;
}

function TermsContent() {
  return <>
    <Section title="Use of the Platform"><p>The platform helps customers view home maintenance information, inspection reports, invoices, appointments, and submit service requests.</p></Section>
    <Section title="You Agree Not To"><List items={["use the platform for unlawful purposes", "access another customer’s account or information", "upload harmful, offensive, or unrelated content", "interfere with the security or operation of the platform", "share login credentials with unauthorized users"]} /></Section>
    <Section title="Account Responsibility"><p>You are responsible for maintaining the confidentiality of your login information. Contact ServSync immediately if you believe your account has been accessed without permission.</p></Section>
    <Section title="Service Requests"><p>Submitting a request does not guarantee immediate service, emergency response, or approval of a requested appointment time.</p></Section>
    <Section title="Reports and Information"><p>Reports, photos, recommendations, invoices, and service notes are provided for customer convenience and documentation. They are not a full code inspection, engineering report, environmental inspection, mold inspection, pest inspection, or guarantee of hidden conditions unless specifically stated in writing.</p></Section>
    <Section title="Availability and Liability"><p>We may update, modify, suspend, or discontinue parts of the platform at any time. To the fullest extent allowed by law, ServSync is not liable for indirect, incidental, special, or consequential damages related to use of the platform.</p></Section>
  </>;
}

function ServiceTermsContent() {
  return <>
    <Section title="Scope of Service"><p>ServSync provides routine home maintenance inspections, documentation, recommendations, minor maintenance support when appropriate, and service coordination assistance.</p></Section>
    <Section title="Not a Full Home Inspection"><p>The service is not a real estate home inspection, engineering inspection, code compliance inspection, environmental inspection, mold inspection, pest inspection, or guarantee of concealed conditions.</p></Section>
    <Section title="Access to Property"><p>Customer agrees to provide safe and reasonable access to areas intended to be inspected. ServSync is not responsible for areas that are inaccessible, unsafe, locked, concealed, blocked, or not reasonably visible.</p></Section>
    <Section title="Minor On-Site Fixes"><p>ServSync may perform minor on-site fixes when practical, safe, and within the scope of the visit. Some work may require separate approval, additional labor, materials, licensed trades, or third-party vendors.</p></Section>
    <Section title="Excluded Work"><List items={["major repairs", "emergency response", "licensed trade work beyond allowed scope", "structural engineering", "electrical panel repair", "HVAC repair requiring licensed service", "plumbing repairs requiring licensed service", "roofing repairs", "mold remediation", "pest treatment", "hazardous material handling", "work in unsafe or inaccessible areas"]} /></Section>
    <Section title="Scheduling and Payment"><p>Visits are generally recurring unless otherwise agreed. Appointment dates and times may be adjusted. Customer agrees to pay according to the selected plan, invoice, or written agreement.</p></Section>
  </>;
}

function InspectionDisclaimerContent() {
  return <>
    <p>ServSync provides routine visual home maintenance inspections intended to help identify visible maintenance concerns and document the condition of accessible areas at the time of service.</p>
    <p>This inspection is limited to readily accessible and visible areas. It is not technically exhaustive and does not include destructive testing, moving heavy belongings, opening concealed spaces, or evaluating hidden systems.</p>
    <Section title="This inspection is not"><List items={["a real estate home inspection", "a code compliance inspection", "an engineering evaluation", "a mold inspection", "a pest inspection", "an environmental inspection", "a guarantee against future failure", "a guarantee that all defects have been identified"]} /></Section>
    <p>Some issues may not be visible during the inspection. Conditions can change after the visit. Customers should promptly address urgent items and consult licensed specialists when recommended.</p>
  </>;
}

function EmergencyNoticeContent() {
  return <>
    <p>The ServSync customer portal is not an emergency response system and is not monitored 24/7.</p>
    <Section title="For emergencies, contact"><List items={["911 for life safety emergencies", "your utility provider for gas, electrical, or utility emergencies", "a licensed emergency plumber, electrician, HVAC technician, roofer, or other appropriate professional", "local emergency services when necessary"]} /></Section>
    <p>Submitting an “Urgent” request through the portal does not guarantee immediate response.</p>
  </>;
}

function CommunicationsConsentContent() {
  return <>
    <p>By providing your email address, phone number, or using the customer portal, you agree that ServSync may contact you regarding onboarding, appointments, inspection reports, invoices, service requests, account activity, maintenance recommendations, scheduling changes, and customer support.</p>
    <p>Communications may be sent by email, phone, text message, or portal notification. If SMS/text messaging is added, message and data rates may apply.</p>
  </>;
}

function PhotoConsentContent() {
  return <>
    <p>As part of home maintenance inspections and service requests, ServSync may take or receive photos of property conditions.</p>
    <Section title="Photos may be used to"><List items={["document inspection findings", "support written reports", "track maintenance history", "show before-and-after conditions", "communicate recommendations", "maintain customer service records"]} /></Section>
    <p>Photos are intended for service documentation. ServSync will not knowingly use identifiable interior home photos for marketing without separate permission.</p>
  </>;
}

function BillingTermsContent() {
  return <>
    <p>Payment terms depend on the customer’s selected plan, invoice, or written agreement.</p>
    <Section title="Customer agrees to pay for"><List items={["recurring service plans", "approved repairs or additional labor", "materials and parts", "third-party vendor charges", "taxes or fees when applicable"]} /></Section>
    <p>Invoices are due according to the due date shown on the invoice. ServSync may suspend service or portal access for unpaid balances. Plan changes may affect billing amounts, payment timing, and service terms.</p>
  </>;
}

function PortalNoticeContent() {
  return <>
    <p>The ServSync customer portal allows customers to view certain information related to their property, including reports, invoices, appointment information, and service requests.</p>
    <p>Information shown in the portal may not include all internal notes, draft reports, unpublished reports, estimates, administrative records, or contractor-only information.</p>
    <p>Customers are responsible for keeping login credentials secure. If you believe your portal account has been accessed without permission, contact ServSync immediately.</p>
  </>;
}
