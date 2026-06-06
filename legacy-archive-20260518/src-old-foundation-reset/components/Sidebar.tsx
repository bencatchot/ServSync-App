import { LayoutDashboard, Users, Settings, LogOut, LucideIcon } from 'lucide-react';
import { Page } from '../types';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onSignOut?: () => void;
}

const NAV_ITEMS: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'connected', label: 'Homeowners', icon: Users },
];

export default function Sidebar({ currentPage, onNavigate, onSignOut }: SidebarProps) {
  return (
    <>
      {/* ── DESKTOP SIDEBAR (hidden on mobile) ── */}
      <aside
        className="hidden md:flex w-60 flex-shrink-0 flex-col"
        style={{ backgroundColor: '#1e293b', minHeight: '100vh' }}
      >
        <div className="px-5 py-6 border-b border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div>
              <div className="text-white font-semibold text-sm leading-tight">ServSync</div>
            </div>
          </div>
          <p className="text-slate-500 text-xs mt-2 leading-snug">Building Trust with Quality Work</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = currentPage === id;
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Icon size={16} className="flex-shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="px-3 pb-3 space-y-1 border-t border-slate-700 pt-3">
          <button
            onClick={() => onNavigate('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              currentPage === 'settings'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <Settings size={16} className="flex-shrink-0" />
            Account
          </button>
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left text-slate-400 hover:text-white hover:bg-slate-700"
            >
              <LogOut size={16} className="flex-shrink-0" />
              Sign Out
            </button>
          )}
          <p className="text-slate-600 text-xs text-center pt-1">servsync.app</p>
        </div>
      </aside>

      {/* ── MOBILE BOTTOM NAV (hidden on desktop) ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-white border-t border-slate-200"
        style={{
          height: '60px',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = currentPage === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full"
              style={{ minWidth: 0 }}
            >
              <Icon
                size={20}
                style={{ color: active ? '#2563eb' : '#94a3b8' }}
              />
              <span
                className="text-center leading-tight font-medium"
                style={{
                  fontSize: '9px',
                  color: active ? '#2563eb' : '#94a3b8',
                  maxWidth: '48px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
            </button>
          );
        })}

        {/* Settings icon at the end */}
        <button
          onClick={() => onNavigate('settings')}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full"
        >
          <Settings
            size={20}
            style={{ color: currentPage === 'settings' ? '#2563eb' : '#94a3b8' }}
          />
          <span
            className="text-center leading-tight font-medium"
            style={{
              fontSize: '9px',
              color: currentPage === 'settings' ? '#2563eb' : '#94a3b8',
            }}
          >
            Account
          </span>
        </button>

        {onSignOut && (
          <button
            onClick={onSignOut}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full"
          >
            <LogOut
              size={20}
              style={{ color: '#94a3b8' }}
            />
            <span
              className="text-center leading-tight font-medium"
              style={{
                fontSize: '9px',
                color: '#94a3b8',
              }}
            >
              Sign Out
            </span>
          </button>
        )}
      </nav>

      {/* ── MOBILE BOTTOM PADDING ── */}
      {/* Pushes page content up so it's not hidden behind the bottom nav */}
      <div className="md:hidden" style={{ height: '60px' }} />
    </>
  );
}
