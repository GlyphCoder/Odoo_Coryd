import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  Menu, Bell, LayoutGrid, Search, Plus, Map,
  Car, Wallet, Clock, Bookmark, ShieldCheck,
  X, LogOut, ChevronLeft, ChevronRight, CheckCheck,
  Users, MapPin, Settings as SettingsIcon,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import Brand, { Logo } from './Brand.jsx';
import api from '../api.js';

const employeeNav = [
  { to: '/app',          label: 'Dashboard',    Icon: LayoutGrid, end: true },
  { to: '/app/find',     label: 'Find a Ride',  Icon: Search },
  { to: '/app/offer',    label: 'Offer a Ride', Icon: Plus },
  { to: '/app/trips',    label: 'My Trips',     Icon: Map },
  { to: '/app/vehicles', label: 'My Vehicles',  Icon: Car },
  { to: '/app/wallet',   label: 'Wallet',       Icon: Wallet },
  { to: '/app/history',  label: 'Ride History', Icon: Clock },
  { to: '/app/places',   label: 'Saved Places', Icon: Bookmark },
];

const adminNav = [
  { to: '/app/admin/overview',  label: 'Overview',    Icon: LayoutGrid, end: true },
  { to: '/app/admin/employees', label: 'Employees',   Icon: Users },
  { to: '/app/admin/vehicles',  label: 'Vehicles',    Icon: Car },
  { to: '/app/admin/trips',     label: 'Trips',       Icon: MapPin },
  { to: '/app/admin/settings',  label: 'Settings',    Icon: SettingsIcon },
];

/* ── User avatar (initials) ─────────────── */
function Avatar({ name, size = 'sm' }) {
  const initials = (name || 'U')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const sz = size === 'sm' ? 'h-9 w-9 text-xs' : 'h-10 w-10 text-sm';
  return (
    <div
      className={`${sz} inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-dark font-bold text-white ring-1 ring-white/40 shadow-[0_4px_14px_-2px_rgba(124,58,237,0.5),inset_0_1px_0_rgba(255,255,255,0.35)]`}
    >
      {initials}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);             // mobile drawer toggle
  const [collapsed, setCollapsed] = useState(false);   // desktop sidebar collapse state
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const notifRef = useRef(null);

  const nav = user?.isAdmin ? adminNav : employeeNav;

  /* ── bottom tab bar ── */
  const bottomTabs = [
    { to: '/app',       Icon: LayoutGrid, label: 'Home',       end: true },
    { to: '/app/find',  Icon: Search,     label: 'Find Ride',  end: false },
    { to: '/app/offer', Icon: Plus,       label: 'Offer Ride', end: false },
    { to: '/app/trips', Icon: Map,        label: 'My Trips',   end: false },
  ];

  const isTabActive = (tab) =>
    tab.end ? location.pathname === tab.to : location.pathname.startsWith(tab.to);

  /* ── notification polling ── */
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const { data } = await api.get('/notifications');
        if (alive) { setNotifications(data.notifications || []); setUnread(data.unread || 0); }
      } catch { /* ignore */ }
    };
    poll();
    const t = setInterval(poll, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  /* Close the notification popover on outside click / Escape */
  useEffect(() => {
    if (!notifOpen) return;
    const onClick = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setNotifOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [notifOpen]);

  /* Close the mobile drawer on navigation */
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const loadNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications || []);
      setUnread(data.unread || 0);
    } catch { setNotifications([]); }
    finally { setLoadingNotifications(false); }
  };

  const toggleNotifications = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) await loadNotifications();
  };

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read');
      setNotifications((items) => items.map((i) => ({ ...i, is_read: true })));
      setUnread(0);
    } catch { /* ignore */ }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  /* Shared nav-item classes */
  const navItemCls = ({ isActive }, isCollapsed = false) =>
    [
      'group relative flex items-center gap-3 rounded-xl py-2.5 transition-all duration-200',
      isCollapsed ? 'justify-center px-0' : 'px-3',
      isActive
        ? 'bg-gradient-to-r from-brand/18 to-brand/5 font-bold text-brand-dark ring-1 ring-brand/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
        : 'font-medium text-ink-600 hover:bg-white/60 hover:text-brand-dark',
    ].join(' ');

  return (
    <div className="flex h-screen w-screen overflow-hidden">

      {/* ── Desktop Left Sidebar (hidden on mobile) ───────────────────────── */}
      <aside
        className={[
          'glass-chrome relative z-20 hidden h-full shrink-0 flex-col border-r md:flex',
          'transition-[width] duration-300 ease-in-out',
          collapsed ? 'w-[80px]' : 'w-64',
        ].join(' ')}
      >
        {/* Sidebar Header: Brand Logo */}
        <div className="flex h-20 items-center justify-between border-b border-white/50 px-4">
          <Link to="/app" className="flex items-center gap-2.5 overflow-hidden">
            {collapsed ? (
              <Logo size="sm" />
            ) : (
              <Brand size="sm" className="animate-fadeIn" />
            )}
          </Link>

          {/* Collapse toggle button */}
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="rounded-lg p-1.5 text-ink-400 transition hover:bg-white/70 hover:text-brand"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={(state) => navItemCls(state, collapsed)}
              title={collapsed ? label : undefined}
            >
              {({ isActive }) => (
                <>
                  {/* active left rail */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand to-brand-dark" />
                  )}
                  <Icon
                    className={`h-5 w-5 shrink-0 transition-colors ${isActive ? 'text-brand' : 'text-ink-400 group-hover:text-brand'}`}
                    strokeWidth={isActive ? 2.25 : 1.75}
                  />
                  {!collapsed && <span className="animate-fadeIn truncate text-sm">{label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar Footer: User profile info + Collapse/Expand + Logout */}
        <div className="space-y-1.5 border-t border-white/50 p-3">
          {/* User profile capsule */}
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 rounded-xl bg-white/45 px-2.5 py-2 ring-1 ring-white/60'}`}>
            <Avatar name={user?.fullName} />
            {!collapsed && (
              <div className="min-w-0 animate-fadeIn leading-tight">
                <div className="truncate text-sm font-bold text-ink-800">{user?.fullName}</div>
                <div className="truncate text-xs text-ink-400">{user?.email}</div>
              </div>
            )}
          </div>

          {/* Expand trigger when collapsed */}
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="flex w-full items-center justify-center rounded-xl py-2.5 text-ink-400 transition hover:bg-white/70 hover:text-brand"
              title="Expand sidebar"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {/* Logout button */}
          <button
            onClick={handleLogout}
            className={[
              'flex w-full items-center rounded-xl py-2.5 font-semibold transition-all duration-200',
              collapsed
                ? 'justify-center text-ink-400 hover:bg-rose-50/80 hover:text-rose-600'
                : 'gap-3 px-3 text-ink-500 hover:bg-rose-50/80 hover:text-rose-600',
            ].join(' ')}
          >
            <LogOut className="h-5 w-5" strokeWidth={1.75} />
            {!collapsed && <span className="text-sm">Log out</span>}
          </button>
        </div>
      </aside>

      {/* ── Mobile Sidebar Drawer/Overlay (hidden on desktop) ───────────────── */}
      {open && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-brand-deep/35 backdrop-blur-sm animate-fadeIn"
            onClick={() => setOpen(false)}
          />

          <aside className="glass-panel relative flex h-full w-64 max-w-xs animate-riseIn flex-col rounded-r-3xl">
            <div className="flex h-20 items-center justify-between border-b border-white/50 px-4">
              <Link to="/app" onClick={() => setOpen(false)}>
                <Brand size="sm" />
              </Link>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-ink-500 transition hover:bg-white/70 hover:text-brand">
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {nav.map(({ to, label, Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setOpen(false)}
                  className={(state) => navItemCls(state, false)}
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`h-5 w-5 ${isActive ? 'text-brand' : 'text-ink-400'}`} strokeWidth={isActive ? 2.25 : 1.75} />
                      <span className="text-sm">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="space-y-3 border-t border-white/50 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={user?.fullName} />
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-sm font-bold text-ink-800">{user?.fullName}</div>
                  <div className="truncate text-xs text-ink-400">{user?.email}</div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-xl bg-rose-50/80 px-3 py-2.5 text-sm font-bold text-rose-600 ring-1 ring-rose-200/70 transition active:scale-95"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Content Area ──────────────────────────────────────────────── */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">

        {/* Top Header Bar */}
        <header className="glass-chrome z-30 flex h-20 shrink-0 items-center justify-between border-b px-4 sm:px-6">

          {/* Mobile hamburger menu toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg p-1.5 text-ink-500 transition hover:bg-white/70 hover:text-brand md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Mobile brand mark */}
            <Link to="/app" className="md:hidden">
              <Logo size="xs" />
            </Link>

            <h2 className="hidden text-xs font-bold uppercase tracking-[0.18em] text-ink-400 md:block">
              {user?.orgName}
            </h2>
          </div>

          {/* Right Header items */}
          <div className="flex items-center gap-3 sm:gap-4">

            {/* Notification bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={toggleNotifications}
                className={`relative rounded-xl p-2 transition ${
                  notifOpen ? 'bg-brand/15 text-brand-dark' : 'text-ink-500 hover:bg-white/70 hover:text-brand'
                }`}
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-dark px-1 text-[10px] font-bold text-white ring-2 ring-white/80">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="glass-panel absolute right-0 z-40 mt-2 w-[20rem] animate-riseIn overflow-hidden rounded-2xl">
                  <div className="flex items-center justify-between border-b border-white/60 px-4 py-3">
                    <div>
                      <div className="text-sm font-bold text-ink-800">Notifications</div>
                      <div className="text-xs text-ink-400">{unread > 0 ? `${unread} unread` : 'All caught up'}</div>
                    </div>
                    <button
                      onClick={markAllRead}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-brand-dark transition hover:bg-brand/12"
                    >
                      <CheckCheck className="h-3.5 w-3.5" /> Mark all
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {loadingNotifications ? (
                      <div className="px-4 py-8 text-center text-sm text-ink-400">Loading…</div>
                    ) : notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-ink-400">No notifications yet.</div>
                    ) : (
                      notifications.map((item) => (
                        <div
                          key={item.notification_id}
                          className={`border-b border-white/50 px-4 py-3 transition last:border-0 hover:bg-white/50 ${!item.is_read ? 'bg-brand/[0.07]' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            {!item.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand ring-2 ring-brand/25" />}
                            <div className={!item.is_read ? 'min-w-0' : 'min-w-0 pl-4'}>
                              <div className="text-sm font-semibold text-ink-700">{item.title}</div>
                              <div className="mt-0.5 text-xs text-ink-500">{item.body}</div>
                              <div className="mt-1 text-[10px] text-ink-400">{new Date(item.created_at).toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden h-6 w-px bg-white/70 sm:block" />

            {/* Profile info block */}
            <div className="flex items-center gap-2.5">
              <Avatar name={user?.fullName} />
              <div className="hidden text-left leading-tight sm:block">
                <div className="text-sm font-bold text-ink-800">{user?.fullName}</div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-ink-400">{user?.orgName}</span>
              </div>
            </div>

          </div>
        </header>

        {/* Scrollable Main Content Container */}
        <main className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 md:p-8 md:pb-10 lg:p-10">
          <div className="mx-auto max-w-7xl animate-fadeIn">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Mobile persistent bottom tab bar (hidden on desktop) ─────────────── */}
      {!user?.isAdmin && (
        <nav className="glass-chrome fixed bottom-0 left-0 right-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden">
          {bottomTabs.map(({ to, Icon, label, end }) => {
            const active = isTabActive({ to, end });
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
                  active ? 'text-brand-dark' : 'text-ink-400'
                }`}
              >
                <div
                  className={`relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 ${
                    active
                      ? 'bg-gradient-to-br from-brand to-brand-dark text-white shadow-glow ring-1 ring-white/30'
                      : ''
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 1.75} />
                  {!active && to === '/app/offer' && (
                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand ring-2 ring-white" />
                  )}
                </div>
                <span className="text-[10px] font-semibold">{label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
