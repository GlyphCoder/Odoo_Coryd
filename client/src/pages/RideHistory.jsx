import { useEffect, useState } from 'react';
import api from '../api.js';
import { Card, Badge, Empty, Spinner, money } from '../components/ui.jsx';

export default function RideHistory() {
  const [history, setHistory] = useState(null);

  useEffect(() => {
    api.get('/reports/history').then(({ data }) => setHistory(data.history)).catch(() => setHistory([]));
  }, []);

  if (history === null) return <Spinner />;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">Ride History</h1>
      {history.length === 0 ? <Empty title="No completed rides yet" /> : (
        <div className="space-y-3">
          {history.map((h) => (
            <Card key={h.history_id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge status={h.final_status} />
                    <span className="text-xs text-slate-400">{h.trip_date}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600"><span className="text-brand-dark">●</span> {h.pickup_address}</p>
                  <p className="text-sm text-slate-600"><span className="text-rose-500">●</span> {h.destination_address}</p>
                  <p className="mt-1 text-xs text-slate-400">{h.driver_name} → {h.passenger_name}</p>
                </div>
                <div className="text-right">
                  <div className="font-bold text-brand-dark">{money(h.fare_amount)}</div>
                  <div className="text-xs text-slate-400">{h.distance_km} km · fuel {money(h.fuel_cost)}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
