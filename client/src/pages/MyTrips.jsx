import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Card, Badge, Empty, Spinner, money } from '../components/ui.jsx';

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'driver', label: 'As driver' },
  { key: 'passenger', label: 'As passenger' },
];

export default function MyTrips() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const role = params.get('role') || 'all';
  const [trips, setTrips] = useState(null);

  useEffect(() => {
    setTrips(null);
    api.get('/trips', { params: { role } }).then(({ data }) => setTrips(data.trips)).catch(() => setTrips([]));
  }, [role]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">My Trips</h1>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams(t.key === 'all' ? {} : { role: t.key })}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${role === t.key ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {trips === null ? <Spinner /> : trips.length === 0 ? (
        <Empty title="No trips yet" hint="Book a ride or publish one to see it here." />
      ) : (
        <div className="space-y-3">
          {trips.map((t) => {
            const iAmDriver = t.driver_employee_id === user.employeeId;
            return (
              <Link key={t.trip_id} to={`/app/trips/${t.trip_id}`}>
                <Card className="p-4 transition hover:ring-brand">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge status={t.status} />
                        <span className="text-xs font-medium text-slate-400">{iAmDriver ? 'You drive' : `Driver: ${t.driver_name}`}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600"><span className="text-brand-dark">●</span> {t.pickup_address}</p>
                      <p className="text-sm text-slate-600"><span className="text-rose-500">●</span> {t.destination_address}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {new Date(t.departure_datetime).toLocaleString()} · {iAmDriver ? `Passenger: ${t.passenger_name}` : t.vehicle_model}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-brand-dark">{money(t.fare_amount)}</div>
                      <div className="text-xs text-slate-400">{t.distance_km} km</div>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
