import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api.js';

const employeeNav = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/find', label: 'Find a Ride' },
  { to: '/app/offer', label: 'Offer a Ride' },
  { to: '/app/trips', label: 'My Trips' },
  { to: '/app/vehicles', label: 'My Vehicles' },
  { to: '/app/wallet', label: 'Wallet' },
  { to: '/app/history', label: 'Ride History' },
  { to: '/app/places', label: 'Saved Places' },
];

const adminNav = [
  { to: '/app/admin', label: 'Admin Dashboard' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const nav = user?.isAdmin ? adminNav : employeeNav;

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const { data } = await api.get('/notifications');
        if (alive) setUnread(data.unread);
      } catch { /* ignore */ }
    };
    poll();
    const t = setInterval(poll, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <button className="md:hidden text-slate-600" onClick={() => setOpen((o) => !o)}>☰</button>
            <Link to="/app" className="text-lg font-extrabold tracking-tight text-brand-dark">🚗 Carpool</Link>
            <span className="ml-2 hidden rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 sm:inline">{user?.orgName}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="relative text-slate-500">
              🔔{unread > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
            </span>
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold text-slate-700">{user?.fullName}</div>
              <div className="text-xs text-slate-400">{user?.email}</div>
            </div>
            <button onClick={handleLogout} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Logout</button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <aside className={`${open ? 'block' : 'hidden'} md:block w-full md:w-56 shrink-0`}>
          <nav className="space-y-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
