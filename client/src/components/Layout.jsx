import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Menu, Bell, LayoutGrid, Search, Plus, Map,
  Car, Wallet, Clock, Bookmark, ShieldCheck,
  X, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
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
  { to: '/app/admin', label: 'Admin Dashboard', Icon: ShieldCheck, end: true },
];

/* ── User avatar (initials) ─────────────── */
function Avatar({ name, size = 'sm' }) {
  const initials = (name || 'U')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const sz = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  return (
    <div className={`${sz} inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-dark font-bold text-white shadow-sm`}>
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100">

      {/* ── Desktop Left Sidebar (hidden on mobile) ───────────────────────── */}
      <aside
        className={[
          'hidden md:flex flex-col shrink-0 h-full border-r border-slate-200 bg-white transition-all duration-300 ease-in-out z-20',
          collapsed ? 'w-[76px]' : 'w-64',
        ].join(' ')}
      >
        {/* Sidebar Header: Brand Logo */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-slate-100">
          <Link to="/app" className="flex items-center gap-2.5 overflow-hidden">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-dark font-black text-sm text-white shadow-sm">
              Cr
            </span>
            {!collapsed && (
              <span className="font-extrabold text-lg tracking-tight text-slate-900 animate-fadeIn">
                Co<span className="text-brand">RYD</span>
              </span>
            )}
          </Link>

          {/* Collapse toggle button */}
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          {nav.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-xl py-2.5 transition-all duration-150',
                  collapsed ? 'justify-center px-0' : 'px-3',
                  isActive
                    ? 'bg-brand/10 text-brand-dark font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800',
                ].join(' ')
              }
              title={collapsed ? label : undefined}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`h-5 w-5 shrink-0 transition-colors ${isActive ? 'text-brand' : 'text-slate-400'}`}
                    strokeWidth={isActive ? 2.25 : 1.75}
                  />
                  {!collapsed && <span className="text-sm truncate animate-fadeIn">{label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar Footer: User profile info + Collapse/Expand + Logout */}
        <div className="border-t border-slate-100 p-3 space-y-1.5">
          {/* User profile capsule */}
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-2 py-1.5'}`}>
            <Avatar name={user?.fullName} />
            {!collapsed && (
              <div className="min-w-0 leading-tight animate-fadeIn">
                <div className="text-sm font-semibold text-slate-800 truncate">{user?.fullName}</div>
                <div className="text-xs text-slate-400 truncate">{user?.email}</div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-50 my-1.5 pt-1.5" />

          {/* Expand trigger when collapsed */}
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="flex w-full items-center justify-center rounded-xl py-2.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              title="Expand sidebar"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {/* Logout button */}
          <button
            onClick={handleLogout}
            className={[
              'flex items-center rounded-xl py-2.5 font-semibold transition duration-150 w-full',
              collapsed
                ? 'justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                : 'px-3 gap-3 text-slate-500 hover:bg-rose-50 hover:text-rose-600',
            ].join(' ')}
          >
            <LogOut className="h-5 w-5" strokeWidth={1.75} />
            {!collapsed && <span className="text-sm">Log out</span>}
          </button>
        </div>
      </aside>

      {/* ── Mobile Sidebar Drawer/Overlay (hidden on desktop) ───────────────── */}
      {open && (
        <div className="fixed inset-0 z-30 flex md:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          
          <aside className="relative flex w-64 max-w-xs flex-col bg-white h-full shadow-xl">
            <div className="flex h-16 items-center justify-between px-4 border-b border-slate-100">
              <Link to="/app" className="flex items-center gap-2" onClick={() => setOpen(false)}>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-dark font-black text-xs text-white">Cr</span>
                <span className="font-extrabold text-slate-900">Co<span className="text-brand">RYD</span></span>
              </Link>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
              {nav.map(({ to, label, Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                      isActive ? 'bg-brand/10 text-brand-dark' : 'text-slate-600 hover:bg-slate-50'
                    }`
                  }
                >
                  <Icon className="h-5 w-5 text-slate-400" />
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="border-t border-slate-100 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar name={user?.fullName} />
                <div className="min-w-0 leading-tight">
                  <div className="text-sm font-semibold text-slate-800 truncate">{user?.fullName}</div>
                  <div className="text-xs text-slate-400 truncate">{user?.email}</div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-600"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Content Area ──────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        
        {/* Top Header Bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-6">
          
          {/* Mobile hamburger menu toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            
            <h2 className="hidden md:block text-xs font-semibold uppercase tracking-widest text-slate-400">
              {user?.orgName}
            </h2>
          </div>

          {/* Right Header items */}
          <div className="flex items-center gap-4">
            
            {/* Notification bell */}
            <div className="relative">
              <button
                onClick={toggleNotifications}
                className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-elevated z-30">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Notifications</div>
                      <div className="text-xs text-slate-400">{unread > 0 ? `${unread} unread` : 'All caught up'}</div>
                    </div>
                    <button onClick={markAllRead} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-dark hover:bg-brand/10">
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {loadingNotifications ? (
                      <div className="px-4 py-6 text-center text-sm text-slate-400">Loading…</div>
                    ) : notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet.</div>
                    ) : (
                      notifications.map((item) => (
                        <div key={item.notification_id} className={`border-b border-slate-50 px-4 py-3 last:border-0 ${!item.is_read ? 'bg-brand/5' : ''}`}>
                          <div className="flex items-start gap-2">
                            {!item.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                            <div className={!item.is_read ? '' : 'pl-4'}>
                              <div className="text-sm font-medium text-slate-700">{item.title}</div>
                              <div className="mt-0.5 text-xs text-slate-500">{item.body}</div>
                              <div className="mt-1 text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="h-6 w-px bg-slate-200" />

            {/* Profile info block */}
            <div className="flex items-center gap-2">
              <Avatar name={user?.fullName} />
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-sm font-semibold text-slate-800">{user?.fullName}</div>
                <span className="text-[11px] text-slate-400 uppercase tracking-wider">{user?.orgName}</span>
              </div>
            </div>

          </div>
        </header>

        {/* Scrollable Main Content Container — utilizing full available screen size */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10 pb-24 md:pb-10">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile persistent bottom tab bar (hidden on desktop) ─────────────── */}
      {!user?.isAdmin && (
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-slate-200/80 bg-white/95 backdrop-blur-md md:hidden">
          {bottomTabs.map(({ to, Icon, label, end }) => {
            const active = isTabActive({ to, end });
            return (
              <Link
                key={to}
                to={to}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
                style={{ color: active ? '#15803d' : '#94a3b8' }}
              >
                <div
                  className="relative flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150"
                  style={active ? { background: 'rgba(22,163,74,0.12)' } : {}}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 1.75} />
                  {!active && to === '/app/offer' && (
                    <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-white" />
                  )}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
