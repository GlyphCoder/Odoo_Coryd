import { useEffect, useState } from 'react';
import api, { apiError } from '../api.js';
import AddressInput from '../components/AddressInput.jsx';
import { Button, Card, Input, Empty } from '../components/ui.jsx';

export default function SavedPlaces() {
  const [places, setPlaces] = useState(null);
  const [label, setLabel] = useState('');
  const [picked, setPicked] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/saved-places').then(({ data }) => setPlaces(data.places)).catch(() => setPlaces([]));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault(); setError('');
    if (!label || !picked) return setError('Enter a label and pick an address');
    setBusy(true);
    try {
      await api.post('/saved-places', { label, addressText: picked.address, latitude: picked.lat, longitude: picked.lng });
      setLabel(''); setPicked(null); load();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  const remove = async (id) => { await api.delete(`/saved-places/${id}`); load(); };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">Saved Places</h1>

      <Card className="space-y-4 p-5">
        <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Home, Office…" />
        <AddressInput label="Address" value={picked?.address} onSelect={setPicked} placeholder="Search address…" />
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <Button onClick={add} disabled={busy}>{busy ? 'Saving…' : 'Save place'}</Button>
      </Card>

      {places === null ? null : places.length === 0 ? <Empty title="No saved places yet" /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {places.map((p) => (
            <Card key={p.place_id} className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <div className="font-semibold text-slate-800">📍 {p.label}</div>
                <div className="truncate text-sm text-slate-500">{p.address_text}</div>
              </div>
              <Button variant="ghost" onClick={() => remove(p.place_id)}>Remove</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
