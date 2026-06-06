import { ArrowRight, Briefcase, Home, ShieldCheck } from 'lucide-react';

interface LandingPageProps {
  onHomeownerLogin: () => void;
  onHomeownerSignup: () => void;
  onContractorLogin: () => void;
}

export default function LandingPage({ onHomeownerLogin, onHomeownerSignup, onContractorLogin }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
              <ShieldCheck size={24} />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">ServSync</p>
              <p className="text-xs text-slate-400">Home maintenance platform</p>
            </div>
          </div>
        </header>

        <main className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1fr_420px]">
          <section>
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-blue-300">For service businesses and homeowners</p>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
              A cleaner way to manage home maintenance inspections, reports, and service requests.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
              Contractors manage inspections and homeowner relationships. Homeowners get a simple portal for reports,
              appointments, invoices, and requests.
            </p>
          </section>

          <section className="space-y-3">
            <button
              onClick={onHomeownerLogin}
              className="group flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white p-5 text-left text-slate-900 shadow-2xl transition-colors hover:bg-blue-50"
            >
              <span className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Home size={24} />
                </span>
                <span>
                  <span className="block font-bold">Homeowner Login</span>
                  <span className="text-sm text-slate-500">View your home profile, reports, requests, and appointments.</span>
                </span>
              </span>
              <ArrowRight className="text-slate-400 transition-transform group-hover:translate-x-1" size={20} />
            </button>

            <button
              onClick={onHomeownerSignup}
              className="group flex w-full items-center justify-between rounded-2xl border border-white/10 bg-blue-600 p-5 text-left text-white shadow-2xl transition-colors hover:bg-blue-500"
            >
              <span className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-white">
                  <Home size={24} />
                </span>
                <span>
                  <span className="block font-bold">Create Homeowner Account</span>
                  <span className="text-sm text-blue-100">Start your own home profile without a contractor invite.</span>
                </span>
              </span>
              <ArrowRight className="text-blue-100 transition-transform group-hover:translate-x-1" size={20} />
            </button>

            <button
              onClick={onContractorLogin}
              className="group flex w-full items-center justify-between rounded-2xl border border-white/10 bg-slate-900 p-5 text-left text-white shadow-2xl transition-colors hover:bg-slate-800"
            >
              <span className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                  <Briefcase size={24} />
                </span>
                <span>
                  <span className="block font-bold">Contractor Login</span>
                  <span className="text-sm text-slate-400">Manage homeowners, inspections, calendars, and reports.</span>
                </span>
              </span>
              <ArrowRight className="text-slate-500 transition-transform group-hover:translate-x-1" size={20} />
            </button>
          </section>
        </main>
      </div>
    </div>
  );
}
