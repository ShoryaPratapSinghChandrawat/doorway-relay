import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DoorOpen, LayoutDashboard, ListChecks, Radio, Settings, Menu, X, Plus, LogOut, BellRing } from 'lucide-react';
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { apiGet } from './api';
import { useAuth } from './auth';
import type { User } from './types';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { HandoffsPage } from './pages/HandoffsPage';
import { HandoffDetailPage } from './pages/HandoffDetailPage';
import { ManualHandoffPage } from './pages/ManualHandoffPage';
import { InboxPage } from './pages/InboxPage';
import { IntegrationPage } from './pages/IntegrationPage';
import { SettingsPage } from './pages/SettingsPage';
import { AccountLinkPage } from './pages/AccountLinkPage';
import { LoadingState } from './components/DataState';

interface Preferences {
  displayName: string;
  largerText: boolean;
  reducedMotion: boolean;
}
interface PreferencesContextValue {
  preferences: Preferences;
  setPreferences: (value: Preferences) => void;
}
const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside the workspace.');
  return context;
}

function Workspace({ user }: { user: User }) {
  const [preferences, setPreferences] = useState<Preferences>({ displayName: user.displayName, largerText: false, reducedMotion: false });
  useEffect(() => {
    let alive = true;
    void apiGet<Preferences>('/api/settings').then((result) => {
      if (alive) setPreferences(result);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const contextValue = useMemo(() => ({ preferences, setPreferences }), [preferences]);
  const preferenceClass = `${preferences.largerText ? 'larger-text' : ''} ${preferences.reducedMotion ? 'reduced-motion' : ''}`.trim();
  return (
    <PreferencesContext.Provider value={contextValue}>
      <div className={`app-frame ${preferenceClass}`}><Outlet /></div>
    </PreferencesContext.Provider>
  );
}

function AppShell({ user }: { user: User }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuWasOpen = useRef(false);
  const location = useLocation();
  const auth = useAuth();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (menuOpen) {
      menuWasOpen.current = true;
      closeButtonRef.current?.focus();
      const manageNavigationDialog = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setMenuOpen(false);
          return;
        }
        if (event.key !== 'Tab') return;
        const sidebar = document.getElementById('main-sidebar');
        const focusable = sidebar?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      };
      document.addEventListener('keydown', manageNavigationDialog);
      return () => document.removeEventListener('keydown', manageNavigationDialog);
    }
    if (menuWasOpen.current) {
      menuWasOpen.current = false;
      menuButtonRef.current?.focus();
    }
    return undefined;
  }, [menuOpen]);

  async function handleLogout() {
    setLogoutError(null);
    try { await auth.logout(); }
    catch (error) { setLogoutError(error instanceof Error ? error.message : 'Could not sign out.'); }
  }

  const navigation = [
    { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/handoffs', label: 'Handoffs', icon: ListChecks, end: false },
    { to: '/inbox', label: 'Event inbox', icon: BellRing, end: false },
    { to: '/integrations', label: 'Integrations', icon: Radio, end: false },
    { to: '/settings', label: 'Settings', icon: Settings, end: false },
  ];

  return (
    <div className="workspace-layout">
      <a className="skip-link" href="#main-content" inert={menuOpen}>Skip to main content</a>
      {menuOpen && <div className="mobile-scrim" aria-hidden="true" onClick={() => setMenuOpen(false)} />}
      <aside id="main-sidebar" className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Main navigation" role={menuOpen ? 'dialog' : undefined} aria-modal={menuOpen || undefined}>
        <div className="brand">
          <span className="brand-mark"><DoorOpen size={22} strokeWidth={1.8} aria-hidden="true" /></span>
          <span><strong>Doorway Relay</strong><small>Shared-space handoffs</small></span>
          <button ref={closeButtonRef} className="icon-button close-menu" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><X size={19} /></button>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav className="primary-nav">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <span className="note-icon"><DoorOpen size={16} aria-hidden="true" /></span>
          <p><strong>Detected isn’t resolved.</strong><br />Every handoff keeps its owner and history.</p>
        </div>
        <div className="sidebar-footer">
          <div className="avatar" aria-hidden="true">{user.displayName.trim().slice(0, 1).toUpperCase()}</div>
          <div className="user-summary"><strong>{user.displayName}</strong><span>{user.email}</span></div>
          <button className="icon-button logout-button" onClick={() => void handleLogout()} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
        </div>
      </aside>
      <div className="main-column" inert={menuOpen}>
        <header className="topbar">
          <button ref={menuButtonRef} className="icon-button mobile-menu" aria-label="Open navigation" aria-controls="main-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21} /></button>
          <div className="topbar-context"><span className="topbar-kicker">CARE, COORDINATED</span><span className="topbar-workspace">One shared view for what happens next</span></div>
          <div className="topbar-actions">
            <Link to="/handoffs/new" className="button button-primary button-small"><Plus size={16} aria-hidden="true" /><span>New handoff</span></Link>
          </div>
        </header>
        {logoutError && <div className="inline-alert" role="alert">{logoutError}</div>}
        <main id="main-content" className="page-content" tabIndex={-1}><Outlet /></main>
        <footer className="app-footer"><span>Doorway Relay</span><span>Private workspace · no media stored</span></footer>
      </div>
    </div>
  );
}

export function AppRouter() {
  const { user, registrationOpen, loading, error } = useAuth();
  if (loading) return <div className="screen-loading"><LoadingState label="Preparing your workspace…" /></div>;
  if (!user) return <LoginPage initialError={error} registrationOpen={registrationOpen} />;
  return (
    <Routes>
      <Route element={<Workspace user={user} />}>
        <Route element={<AppShell user={user} />}>
          <Route index element={<OverviewPage />} />
          <Route path="handoffs" element={<HandoffsPage />} />
          <Route path="handoffs/new" element={<ManualHandoffPage />} />
          <Route path="handoffs/:id" element={<HandoffDetailPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="integrations" element={<IntegrationPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="account-link" element={<AccountLinkPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
