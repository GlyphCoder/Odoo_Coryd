import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';

/* ── Icons ─────────────────────────────────────────────── */
const pinIcon = (color) =>
  L.divIcon({
    className: 'custom-pin',
    html: `<div style="background:${color};width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
  });

const pickupIcon = pinIcon('#7c3aed');
const destIcon   = pinIcon('#3b0764');

const carIcon = L.divIcon({
  className: 'car-pin',
  html: `
    <div style="position:relative;width:36px;height:36px">
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(124,58,237,.22);animation:carPing 1.6s ease-out infinite"></div>
      <div style="position:absolute;inset:6px;border-radius:50%;background:rgba(124,58,237,.38);animation:carPing 1.6s ease-out infinite .4s"></div>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5b21b6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2"/>
          <path d="M19 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/>
          <rect x="5" y="7" width="14" height="10" rx="1"/>
          <circle cx="7.5" cy="17" r="1.5"/>
          <circle cx="16.5" cy="17" r="1.5"/>
        </svg>
      </div>
    </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const myLocIcon = L.divIcon({
  className: 'my-loc-pin',
  html: `
    <div style="position:relative;width:24px;height:24px">
      <div style="position:absolute;inset:-4px;border-radius:50%;background:rgba(113,113,138,.28);animation:carPing 2s ease-out infinite"></div>
      <div style="position:absolute;inset:0;border-radius:50%;background:#71718a;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>
    </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

/* ── CSS animation injected once ───────────────────────── */
if (!document.getElementById('map-keyframes')) {
  const style = document.createElement('style');
  style.id = 'map-keyframes';
  style.textContent = `
    @keyframes carPing {
      0%   { transform: scale(1);   opacity: 1; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    .leaflet-container { font-family: inherit; }
  `;
  document.head.appendChild(style);
}

/* ── Internal helpers ───────────────────────────────────── */
function Recenter({ point }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.panTo([point.lat, point.lng], { animate: true, duration: 0.8 });
  }, [point, map]);
  return null;
}

function FitBounds({ points }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    const valid = points.filter(Boolean).map((p) => [p.lat, p.lng]);
    if (valid.length >= 2 && !fitted.current) {
      map.fitBounds(valid, { padding: [50, 50], animate: true });
      fitted.current = true;
    } else if (valid.length === 1 && !fitted.current) {
      map.setView(valid[0], 14, { animate: true });
      fitted.current = true;
    }
  }, [points, map]);
  return null;
}

/* Smoothly animate car marker to new position */
function AnimatedCarMarker({ position }) {
  const markerRef = useRef(null);
  const prev = useRef(position);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !position) return;
    const from = prev.current || position;
    const to   = position;
    prev.current = position;

    const steps = 20;
    let step = 0;
    const dlat = (to.lat - from.lat) / steps;
    const dlng = (to.lng - from.lng) / steps;

    const tick = setInterval(() => {
      step++;
      marker.setLatLng([from.lat + dlat * step, from.lng + dlng * step]);
      if (step >= steps) clearInterval(tick);
    }, 50);
    return () => clearInterval(tick);
  }, [position]);

  if (!position) return null;
  return (
    <Marker
      ref={markerRef}
      position={[position.lat, position.lng]}
      icon={carIcon}
    >
      <Popup>Driver live location</Popup>
    </Marker>
  );
}

/* ── Main component ─────────────────────────────────────── */
/**
 * @param {object}   pickup        { lat, lng, address? }
 * @param {object}   destination   { lat, lng, address? }
 * @param {*}        routeGeometry GeoJSON LineString | encoded string | null
 * @param {object}   vehicle       { lat, lng } — live car position (driver)
 * @param {object}   myLocation    { lat, lng } — logged-in user's live GPS
 * @param {number}   height        px height of the map
 * @param {boolean}  follow        pan map to vehicle when it moves
 * @param {boolean}  liveTrip      if true, use animated dashed polyline style
 * @param {Array}    pickupNodes   [{node_id, lat, lng, address, node_index}] — shared pickup stops
 * @param {string}   selectedNodeId — node_id of the node the passenger selected
 */
export default function MapView({
  pickup,
  destination,
  routeGeometry,
  vehicle,
  myLocation,
  height = 360,
  follow = true,
  liveTrip = false,
  pickupNodes = [],
  selectedNodeId = null,
  riderPickup = null,
}) {
  const center = pickup || destination || myLocation || { lat: 12.9716, lng: 77.5946 };

  const routeLine = useMemo(() => {
    if (!routeGeometry) return null;
    let geo = routeGeometry;
    if (typeof geo === 'string') {
      try { geo = JSON.parse(geo); } catch { return null; }
    }
    if (!geo?.coordinates) return null;
    return geo.coordinates.map(([lng, lat]) => [lat, lng]); // GeoJSON → Leaflet
  }, [routeGeometry]);

  /* Split route into "travelled" (before car) and "ahead" segments */
  const { travelled, ahead } = useMemo(() => {
    if (!routeLine || !vehicle || !liveTrip) return { travelled: null, ahead: routeLine };
    // Find closest point on route to vehicle
    let minDist = Infinity;
    let splitIdx = 0;
    routeLine.forEach(([rlat, rlng], i) => {
      const d = Math.hypot(rlat - vehicle.lat, rlng - vehicle.lng);
      if (d < minDist) { minDist = d; splitIdx = i; }
    });
    return {
      travelled: routeLine.slice(0, splitIdx + 1),
      ahead:     routeLine.slice(splitIdx),
    };
  }, [routeLine, vehicle, liveTrip]);

  /* Calculate the Rider's segment if a pickup is provided */
  const riderSegment = useMemo(() => {
    if (!routeLine || !riderPickup) return null;
    let minDist = Infinity;
    let splitIdx = 0;
    routeLine.forEach(([rlat, rlng], i) => {
      const d = Math.hypot(rlat - riderPickup.lat, rlng - riderPickup.lng);
      if (d < minDist) { minDist = d; splitIdx = i; }
    });
    // Rider segment is from their pickup point to the end of the driver's route
    return routeLine.slice(splitIdx);
  }, [routeLine, riderPickup]);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={13}
      style={{ height, width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Pickup & destination markers */}
      {pickup && (
        <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}>
          <Popup>Pickup: {pickup.address || 'Pickup'}</Popup>
        </Marker>
      )}
      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={destIcon}>
          <Popup>Destination: {destination.address || 'Destination'}</Popup>
        </Marker>
      )}

      {/* Route polyline — split view for live trips */}
      {liveTrip ? (
        <>
          {travelled && travelled.length >= 2 && (
            <Polyline
              positions={travelled}
              pathOptions={{ color: '#94a3b8', weight: 5, opacity: 0.5, dashArray: '6 4' }}
            />
          )}
          {ahead && ahead.length >= 2 && (
            <Polyline
              positions={ahead}
              pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.85 }}
            />
          )}
        </>
      ) : (
        routeLine && routeLine.length >= 2 && (
          <Polyline
            positions={routeLine}
            pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.78, lineJoin: 'round', lineCap: 'round' }}
          />
        )
      )}

      {/* Rider's specific segment (Dotted overlay) */}
      {riderSegment && riderSegment.length >= 2 && (
        <Polyline
          positions={riderSegment}
          pathOptions={{ color: '#0ea5e9', weight: 5, opacity: 1, dashArray: '8 8', lineJoin: 'round', lineCap: 'round' }}
        />
      )}

      {/* Pickup nodes — shared stops along driver route */}
      {pickupNodes.map((node) => {
        const isSelected = node.node_id === selectedNodeId;
        return (
          <CircleMarker
            key={node.node_id}
            center={[+node.lat, +node.lng]}
            radius={isSelected ? 12 : 8}
            pathOptions={{
              color: isSelected ? '#16a34a' : '#f97316',
              fillColor: isSelected ? '#22c55e' : '#fb923c',
              fillOpacity: 0.9,
              weight: isSelected ? 3 : 2,
            }}
          >
            <Popup>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                🚏 Stop #{node.node_index + 1}
                {isSelected && ' ✓ Your pickup'}
              </div>
              {node.address && <div style={{ fontSize: 12, color: '#555' }}>{node.address}</div>}
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                {(+node.lat).toFixed(5)}, {(+node.lng).toFixed(5)}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Animated car (driver live position) */}
      {vehicle && <AnimatedCarMarker position={vehicle} />}

      {/* User's own live location — pulsing blue dot */}
      {myLocation && (
        <Marker position={[myLocation.lat, myLocation.lng]} icon={myLocIcon}>
          <Popup>Your location</Popup>
        </Marker>
      )}

      {/* Map auto-behaviors */}
      {follow && vehicle && <Recenter point={vehicle} />}
      {!vehicle && <FitBounds points={[
        pickup, destination, myLocation, riderPickup,
        ...(pickupNodes.map((n) => ({ lat: +n.lat, lng: +n.lng })))
      ].filter(Boolean)} />}

      {/* Map Legend */}
      <div className="leaflet-bottom leaflet-right">
        <div className="leaflet-control leaflet-bar" style={{ backgroundColor: 'white', padding: '10px', margin: '12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ width: '24px', height: '5px', backgroundColor: '#3b82f6', marginRight: '8px', borderRadius: '2px' }} />
            <span style={{ fontWeight: 600, color: '#334155' }}>Driver Route</span>
          </div>
          {riderPickup && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '24px', height: '0px', borderTop: '5px dashed #0ea5e9', marginRight: '8px' }} />
              <span style={{ fontWeight: 600, color: '#334155' }}>Your Segment</span>
            </div>
          )}
        </div>
      </div>
    </MapContainer>
  );
}
