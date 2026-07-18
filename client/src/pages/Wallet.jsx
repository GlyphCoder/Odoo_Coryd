import { useEffect, useState } from 'react';
import api, { apiError } from '../api.js';
import { Button, Card, Input, Empty, money } from '../components/ui.jsx';

export default function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.get('/wallet').then(({ data }) => setWallet(data)).catch(() => setWallet({ balance: 0, transactions: [] }));
  useEffect(() => { load(); }, []);

  const recharge = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      await api.post('/wallet/recharge', { amount: +amount });
      setAmount(''); load();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  if (!wallet) return <div className="p-8 text-slate-500">Loading…</div>;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">Wallet</h1>

      <Card className="bg-gradient-to-br from-brand to-brand-dark p-6 text-white">
        <div className="text-sm opacity-80">Available balance</div>
        <div className="mt-1 text-4xl font-bold">{money(wallet.balance)}</div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-slate-700">Recharge (test mode)</h2>
        <form onSubmit={recharge} className="flex items-end gap-3">
          <div className="flex-1"><Input label="Amount (₹)" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" /></div>
          <Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add money'}</Button>
        </form>
        <div className="mt-2 flex gap-2">
          {[100, 200, 500].map((v) => (
            <button key={v} onClick={() => setAmount(String(v))} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">+{v}</button>
          ))}
        </div>
        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-slate-700">Recent transactions</h2>
        {wallet.transactions.length === 0 ? <Empty title="No transactions yet" /> : (
          <div className="divide-y divide-slate-100">
            {wallet.transactions.map((t) => (
              <div key={t.transaction_id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium text-slate-700">{t.transaction_type.replace('_', ' ')}</div>
                  <div className="text-xs text-slate-400">{new Date(t.created_at).toLocaleString()}</div>
                </div>
                <div className={`font-semibold ${t.transaction_type === 'RIDE_PAYMENT' ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {t.transaction_type === 'RIDE_PAYMENT' ? '-' : '+'}{money(t.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
