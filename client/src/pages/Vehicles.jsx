import { useEffect, useState } from 'react';
import api, { apiError } from '../api.js';
import { Button, Card, Input, Select, Empty, Badge } from '../components/ui.jsx';

const empty = { vehicleModel: '', registrationNumber: '', seatingCapacity: 4, fuelType: 'PETROL' };

export default function Vehicles() {
  const [vehicles, setVehicles] = useState(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/vehicles').then(({ data }) => setVehicles(data.vehicles)).catch(() => setVehicles([]));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const add = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      await api.post('/vehicles', { ...form, seatingCapacity: +form.seatingCapacity });
      setForm(empty); load();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!confirm('Remove this vehicle?')) return;
    await api.delete(`/vehicles/${id}`); load();
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">My Vehicles</h1>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-slate-700">Add a vehicle</h2>
        <form onSubmit={add} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Model" required value={form.vehicleModel} onChange={set('vehicleModel')} placeholder="e.g. Maruti Swift" />
          <Input label="Registration number" required value={form.registrationNumber} onChange={set('registrationNumber')} placeholder="KA01AB1234" />
          <Input label="Seating capacity" type="number" min="1" max="8" value={form.seatingCapacity} onChange={set('seatingCapacity')} />
          <Select label="Fuel type" value={form.fuelType} onChange={set('fuelType')}>
            {['PETROL', 'DIESEL', 'CNG', 'EV', 'HYBRID'].map((f) => <option key={f}>{f}</option>)}
          </Select>
          {error && <p className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add vehicle'}</Button></div>
        </form>
      </Card>

      {vehicles === null ? null : vehicles.length === 0 ? (
        <Empty title="No vehicles yet" hint="Add one above to start offering rides." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {vehicles.map((v) => (
            <Card key={v.vehicle_id} className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">{v.vehicle_model}</span>
                  {v.is_verified ? <Badge status="COMPLETED">Verified</Badge> : <Badge status="PENDING">Unverified</Badge>}
                </div>
                <div className="text-sm text-slate-500">{v.registration_number} · {v.seating_capacity} seats · {v.fuel_type}</div>
              </div>
              <Button variant="ghost" onClick={() => remove(v.vehicle_id)}>Remove</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
