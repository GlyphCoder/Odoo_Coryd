import { useEffect, useState } from 'react';
import { MapPin, ArrowRight, Loader2 } from 'lucide-react';
import api from '../api.js';
import { Card, Badge, Empty, Spinner, money } from '../components/ui.jsx';
import MapView from '../components/MapView.jsx';

export default function RideHistory() {
  const [history,    setHistory]    = useState(null);
  const [expanded,   setExpanded]   = useState(null); // history_id of expanded card
  const [routeCache, setRouteCache] = useState({});   // history_id → route data
  const [loadingRoute, setLoadingRoute] = useState(null);

  useEffect(() => {
    api
      .get('/reports/history')
      .then(({ data }) => setHistory(data.history))
      .catch(() => setHistory([]));
  }, []);

  const toggleExpand = async (h) => {
    const hid = h.history_id;

    // Collapse if already open
    if (expanded === hid) { setExpanded(null); return; }

    setExpanded(hid);

    // Fetch route polyline if not already cached
    if (!routeCache[hid] && h.pickup_lat && h.pickup_lng && h.destination_lat && h.destination_lng) {
      setLoadingRoute(hid);
      try {
        const { data } = await api.post('/geo/route', {
          pickup:      { lat: +h.pickup_lat,      lng: +h.pickup_lng },
          destination: { lat: +h.destination_lat, lng: +h.destination_lng },
        });
        setRouteCache((c) => ({ ...c, [hid]: data }));
      } catch {
        setRouteCache((c) => ({ ...c, [hid]: null })); // mark as tried
      } finally {
        setLoadingRoute(null);
      }
    }
  };

  if (history === null) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Ride History</h1>
        {history.length > 0 && (
          <span className="text-sm text-slate-400">{history.length} ride(s) completed</span>
        )}
      </div>

      {history.length === 0 ? (
        <Empty title="No completed rides yet" hint="Completed trips will appear here." />
      ) : (
        <div className="space-y-3">
          {history.map((h) => {
            const isOpen = expanded === h.history_id;
            const route  = routeCache[h.history_id];
            const loading = loadingRoute === h.history_id;

            return (
              <Card
                key={h.history_id}
                className="overflow-hidden transition-shadow hover:shadow-md"
              >
                {/* ── Summary row (always visible) ── */}
                <button
                  onClick={() => toggleExpand(h)}
                  className="flex w-full flex-wrap items-start justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge status={h.final_status} />
                      <span className="text-xs text-slate-400">{h.trip_date}</span>
                    </div>
                    {/* Route: pickup → destination in one line */}
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-sm text-slate-600">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-brand" />
                      <span className="flex-1 min-w-0 truncate">{h.pickup_address}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                      <span className="flex-1 min-w-0 truncate">{h.destination_address}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {h.driver_name} → {h.passenger_name}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="font-bold text-brand-dark">{money(h.fare_amount)}</div>
                    <div className="text-xs text-slate-400">
                      {h.distance_km} km · fuel {money(h.fuel_cost)}
                    </div>
                    <span className="mt-1 text-xs text-slate-400">
                      {isOpen ? '▲ Hide map' : '▼ Show route'}
                    </span>
                  </div>
                </button>

                {/* ── Expanded: stats + mini map ── */}
                {isOpen && (
                  <div className="border-t border-slate-100">
                    {/* Stats strip */}
                    <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50 text-center text-xs">
                      <StatCell label="Distance" value={`${h.distance_km} km`} />
                      <StatCell label="Fare"     value={money(h.fare_amount)} />
                      <StatCell label="Fuel cost" value={money(h.fuel_cost)} />
                    </div>

                    {/* Mini Leaflet map */}
                    {loading ? (
                      <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading route…
                      </div>
                    ) : (
                      <MapView
                        pickup={{
                          lat: +h.pickup_lat,
                          lng: +h.pickup_lng,
                          address: h.pickup_address,
                        }}
                        destination={{
                          lat: +h.destination_lat,
                          lng: +h.destination_lng,
                          address: h.destination_address,
                        }}
                        routeGeometry={route?.geometry || null}
                        height={240}
                        follow={false}
                        liveTrip={false}
                      />
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value }) {
  return (
    <div className="py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-semibold text-slate-700">{value}</div>
    </div>
  );
}
