import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { useEffect, useMemo } from 'react';
import L from 'leaflet';

// Fix default marker icons when bundling (Leaflet expects local asset paths).
const icon = (color) => L.divIcon({
  className: 'custom-pin',
  html: `<div style="background:${color};width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 18],
});
const pickupIcon = icon('#0d9488');
const destIcon = icon('#e11d48');
const carIcon = L.divIcon({
  className: 'car-pin',
  html: '<div style="font-size:22px;line-height:22px">🚗</div>',
  iconSize: [22, 22], iconAnchor: [11, 11],
});

function Recenter({ point }) {
  const map = useMap();
  useEffect(() => { if (point) map.panTo([point.lat, point.lng], { animate: true }); }, [point, map]);
  return null;
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    const valid = points.filter(Boolean).map((p) => [p.lat, p.lng]);
    if (valid.length >= 2) map.fitBounds(valid, { padding: [40, 40] });
    else if (valid.length === 1) map.setView(valid[0], 13);
  }, [points, map]);
  return null;
}

export default function MapView({ pickup, destination, routeGeometry, vehicle, height = 360, follow = true }) {
  const center = pickup || destination || { lat: 12.9716, lng: 77.5946 }; // Bengaluru fallback

  const routeLine = useMemo(() => {
    if (!routeGeometry) return null;
    let geo = routeGeometry;
    if (typeof geo === 'string') { try { geo = JSON.parse(geo); } catch { return null; } }
    if (!geo?.coordinates) return null;
    return geo.coordinates.map(([lng, lat]) => [lat, lng]); // GeoJSON -> Leaflet
  }, [routeGeometry]);

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={12} style={{ height, width: '100%', borderRadius: 16 }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}><Popup>Pickup</Popup></Marker>}
      {destination && <Marker position={[destination.lat, destination.lng]} icon={destIcon}><Popup>Destination</Popup></Marker>}
      {routeLine && <Polyline positions={routeLine} pathOptions={{ color: '#0d9488', weight: 5, opacity: 0.75 }} />}
      {vehicle && <Marker position={[vehicle.lat, vehicle.lng]} icon={carIcon}><Popup>Vehicle</Popup></Marker>}
      {follow && vehicle && <Recenter point={vehicle} />}
      {!vehicle && <FitBounds points={[pickup, destination]} />}
    </MapContainer>
  );
}
