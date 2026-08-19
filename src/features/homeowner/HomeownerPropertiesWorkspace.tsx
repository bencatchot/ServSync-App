import {
  ChevronRight,
  ClipboardList,
  Home,
  KeyRound,
  MapPin,
  Plus,
  Receipt,
  Settings,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';

export type HomeownerPropertySection = 'overview' | 'map' | 'access' | 'settings';

type PropertyChoice = {
  id: string;
  label: string;
  address: string;
};

type SetupItem = {
  label: string;
  complete: boolean;
};

type HomeownerPropertiesWorkspaceProps = {
  activeSection: HomeownerPropertySection;
  onSectionChange: (section: HomeownerPropertySection) => void;
  properties: PropertyChoice[];
  selectedPropertyId: string;
  selectedPropertyLabel: string;
  selectedPropertyAddress: string;
  selectedPropertyDetail: string;
  homePhotoUrl: string;
  roomCount: number;
  assetCount: number;
  openRequestCount: number;
  estimateReviewCount: number;
  openInvoiceCount: number;
  setupItems: SetupItem[];
  onSelectProperty: (propertyId: string) => void;
  onAddProperty: () => void;
  onRequestService: () => void;
  onOpenRequests: () => void;
  onOpenFinancialRecords: () => void;
  onOpenHistory: () => void;
  children: {
    map: ReactNode;
    access: ReactNode;
    settings: ReactNode;
  };
};

const SECTIONS: Array<{
  id: HomeownerPropertySection;
  label: string;
  icon: ReactNode;
}> = [
  { id: 'overview', label: 'Overview', icon: <Home size={16} /> },
  { id: 'map', label: 'Home Map', icon: <MapPin size={16} /> },
  { id: 'access', label: 'Access', icon: <KeyRound size={16} /> },
  { id: 'settings', label: 'Property Settings', icon: <Settings size={16} /> },
];

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ContextRow({
  icon,
  title,
  detail,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAction}
      className="flex min-w-0 w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left transition last:border-b-0 hover:bg-slate-50"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-950">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{detail}</span>
      </span>
      <span className="hidden shrink-0 items-center gap-1 text-xs font-bold text-blue-700 sm:inline-flex">
        {actionLabel}
        <ChevronRight size={14} />
      </span>
    </button>
  );
}

export function HomeownerPropertiesWorkspace({
  activeSection,
  onSectionChange,
  properties,
  selectedPropertyId,
  selectedPropertyLabel,
  selectedPropertyAddress,
  selectedPropertyDetail,
  homePhotoUrl,
  roomCount,
  assetCount,
  openRequestCount,
  estimateReviewCount,
  openInvoiceCount,
  setupItems,
  onSelectProperty,
  onAddProperty,
  onRequestService,
  onOpenRequests,
  onOpenFinancialRecords,
  onOpenHistory,
  children,
}: HomeownerPropertiesWorkspaceProps) {
  const hasProperty = properties.length > 0 && Boolean(selectedPropertyId);
  const completedSetupItems = setupItems.filter(item => item.complete).length;

  return (
    <section className="min-w-0 max-w-full space-y-4" data-testid="homeowner-properties-workspace">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Properties</p>
          <h2 className="mt-1 truncate text-xl font-bold text-slate-950" data-testid="property-workspace-title">
            {hasProperty ? selectedPropertyLabel : 'Your home'}
          </h2>
          <p className="mt-1 truncate text-sm text-slate-500">
            {hasProperty ? selectedPropertyAddress || selectedPropertyDetail || 'Property details not added yet' : 'Add a property to organize service around the right home.'}
          </p>
        </div>
        {properties.length > 1 ? (
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center">
            <label htmlFor="homeowner-property-selector" className="text-xs font-bold text-slate-500">Property</label>
            <select
              id="homeowner-property-selector"
              className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:min-w-[240px]"
              value={selectedPropertyId}
              onChange={event => onSelectProperty(event.target.value)}
            >
              {properties.map(property => <option key={property.id} value={property.id}>{property.label}</option>)}
            </select>
          </div>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Property sections"
        className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-white p-1 sm:grid-cols-4"
        data-testid="property-section-navigation"
      >
        {SECTIONS.map(section => {
          const active = section.id === activeSection;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`property-section-${section.id}`}
              onClick={() => onSectionChange(section.id)}
              className={`flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-md px-2 py-2 text-sm font-bold transition ${
                active ? 'bg-[#02132D] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
              }`}
            >
              {section.icon}
              <span className="min-w-0 truncate">{section.label}</span>
            </button>
          );
        })}
      </div>

      {activeSection === 'overview' && (
        <div id="property-section-overview" role="tabpanel" className="space-y-4" data-testid="property-overview-section">
          {!hasProperty ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5">
              <h3 className="text-base font-bold text-slate-950">Add your first property</h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">A property gives requests, records, Home Map details, and household access one clear home.</p>
              <button type="button" onClick={onAddProperty} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0078FF] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#005FD6]">
                <Plus size={16} />
                Add property
              </button>
            </div>
          ) : (
            <>
              <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
                <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="grid min-w-0 gap-4 p-4 sm:grid-cols-[112px_minmax(0,1fr)]">
                    <div className="flex aspect-square w-full max-w-28 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                      {homePhotoUrl ? <img src={homePhotoUrl} alt="" className="h-full w-full object-cover" /> : <Home size={30} className="text-slate-400" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-950">Property overview</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{selectedPropertyDetail || 'Add property details when they are useful.'}</p>
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <SummaryMetric label="Rooms" value={roomCount} />
                        <SummaryMetric label="Systems" value={assetCount} />
                        <SummaryMetric label="Open requests" value={openRequestCount} />
                        <SummaryMetric label="Open invoices" value={openInvoiceCount} />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                    <button type="button" onClick={onRequestService} className="inline-flex items-center gap-2 rounded-lg bg-[#0078FF] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#005FD6]">
                      <Wrench size={16} />
                      Request service
                    </button>
                    <button type="button" onClick={() => onSectionChange('map')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      <MapPin size={16} />
                      Open Home Map
                    </button>
                    <button type="button" onClick={onOpenHistory} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      <ClipboardList size={16} />
                      Home History
                    </button>
                  </div>
                </div>

                <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <h3 className="text-sm font-bold text-slate-950">Current service</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Active items for this property only.</p>
                  </div>
                  {openRequestCount + estimateReviewCount + openInvoiceCount === 0 ? (
                    <div className="px-4 py-5">
                      <p className="text-sm font-semibold text-slate-700">Nothing needs attention right now.</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">New requests, estimates, and open invoices will appear here.</p>
                    </div>
                  ) : (
                    <>
                      {openRequestCount > 0 && <ContextRow icon={<Wrench size={17} />} title={`${openRequestCount} open request${openRequestCount === 1 ? '' : 's'}`} detail="Service requests still in progress." actionLabel="View" onAction={onOpenRequests} />}
                      {estimateReviewCount > 0 && <ContextRow icon={<ClipboardList size={17} />} title={`${estimateReviewCount} estimate${estimateReviewCount === 1 ? '' : 's'} to review`} detail="Sent estimates waiting for your response." actionLabel="Review" onAction={onOpenFinancialRecords} />}
                      {openInvoiceCount > 0 && <ContextRow icon={<Receipt size={17} />} title={`${openInvoiceCount} open invoice${openInvoiceCount === 1 ? '' : 's'}`} detail="Current billing records for this home." actionLabel="View" onAction={onOpenFinancialRecords} />}
                    </>
                  )}
                </div>
              </div>

              {properties.length > 1 && (
                <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid="property-collection">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-950">Your properties</h3>
                      <p className="mt-0.5 text-xs text-slate-500">Switch only when you need another home.</p>
                    </div>
                    <button type="button" onClick={onAddProperty} className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 hover:text-blue-800"><Plus size={15} /> Add</button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {properties.map(property => (
                      <button key={property.id} type="button" onClick={() => onSelectProperty(property.id)} className={`rounded-lg border p-3 text-left ${property.id === selectedPropertyId ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-blue-200'}`}>
                        <p className="truncate text-sm font-bold text-slate-950">{property.label}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{property.address || 'No address added yet'}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeSection === 'map' && <div id="property-section-map" role="tabpanel" className="space-y-4" data-testid="property-map-section">{children.map}</div>}
      {activeSection === 'access' && <div id="property-section-access" role="tabpanel" className="space-y-4" data-testid="property-access-section">{children.access}</div>}
      {activeSection === 'settings' && (
        <div id="property-section-settings" role="tabpanel" className="space-y-4" data-testid="property-settings-section">
          {hasProperty && (
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-950">Property management</h3>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">Edit this property below or add another home when you need one.</p>
              </div>
              <button type="button" onClick={onAddProperty} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Plus size={16} />
                Add another property
              </button>
            </div>
          )}
          {hasProperty && setupItems.length > 0 && (
            <details className="rounded-lg border border-slate-200 bg-white p-4" data-testid="property-setup-progress">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-950">Property setup</p>
                    <p className="mt-0.5 text-xs text-slate-500">{completedSetupItems} of {setupItems.length} optional details added</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Optional</span>
                </div>
              </summary>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {setupItems.map(item => (
                  <div key={item.label} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${item.complete ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    {item.label}
                  </div>
                ))}
              </div>
            </details>
          )}
          {children.settings}
        </div>
      )}
    </section>
  );
}
