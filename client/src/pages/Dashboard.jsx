import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Card, Spinner, money } from '../components/ui.jsx';

function Stat({ label, value }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
    </Card>
  );
}

const actions = [
  { to: '/app/find', icon: '🔍', title: 'Find a Ride', desc: 'Search matching rides' },
  { to: '/app/offer', icon: '➕', title: 'Offer a Ride', desc: 'Publish your route' },
  { to: '/app/trips', icon: '🧭', title: 'My Trips', desc: 'Track & manage' },
  { to: '/app/wallet', icon: '👛', title: 'Wallet', desc: 'Balance & recharge' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/reports/me').then(({ data }) => setStats(data)).catch(() => setStats({ error: true }));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Hi, {user?.fullName?.split(' ')[0]} 👋</h1>
        <p className="text-slate-500">Where are you headed today?</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {actions.map((a) => (
          <Link key={a.to} to={a.to}>
            <Card className="p-4 transition hover:ring-brand">
              <div className="text-2xl">{a.icon}</div>
              <div className="mt-2 font-semibold text-slate-700">{a.title}</div>
              <div className="text-xs text-slate-400">{a.desc}</div>
            </Card>
          </Link>
        ))}
      </div>

      {!stats ? <Spinner /> : stats.error ? null : (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">As a driver</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Trips" value={stats.asDriver.trips} />
            <Stat label="Distance (km)" value={Number(stats.asDriver.distance).toFixed(0)} />
            <Stat label="Earned" value={money(stats.asDriver.earned)} />
            <Stat label="Fuel cost" value={money(stats.asDriver.fuel_cost)} />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">As a passenger</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Trips" value={stats.asPassenger.trips} />
            <Stat label="Distance (km)" value={Number(stats.asPassenger.distance).toFixed(0)} />
            <Stat label="Spent" value={money(stats.asPassenger.spent)} />
          </div>
        </div>
      )}
    </div>
  );
}
