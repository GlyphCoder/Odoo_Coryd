import { useEffect, useRef, useState } from 'react';
import api from '../api.js';

/**
 * Free address autocomplete backed by the server's Nominatim proxy.
 * onSelect({ address, lat, lng })
 */
export default function AddressInput({ label, value, onSelect, placeholder }) {
  const [q, setQ] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const box = useRef(null);

  useEffect(() => { setQ(value || ''); }, [value]);

  useEffect(() => {
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const search = (text) => {
    clearTimeout(timer.current);
    if (!text || text.length < 3) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/geo/search', { params: { q: text } });
        setResults(data.results || []);
        setOpen(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 350);
  };

  const pick = (r) => {
    setQ(r.label);
    setOpen(false);
    onSelect?.({ address: r.label, lat: r.lat, lng: r.lng });
  };

  return (
    <div className="relative" ref={box}>
      {label && <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>}
      <input
        value={q}
        placeholder={placeholder || 'Search address…'}
        onChange={(e) => { setQ(e.target.value); search(e.target.value); }}
        onFocus={() => results.length && setOpen(true)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />
      {loading && <span className="absolute right-3 top-9 text-xs text-slate-400">…</span>}
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.map((r, i) => (
            <li
              key={i}
              onClick={() => pick(r)}
              className="cursor-pointer px-3 py-2 text-sm text-slate-600 hover:bg-brand/10"
            >
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
