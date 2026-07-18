import { useEffect, useState } from 'react';
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, PlusCircle, History } from 'lucide-react';
import api, { apiError } from '../api.js';
import { Button, Card, Input, Empty, Alert, money } from '../components/ui.jsx';

export default function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () =>
    api
      .get('/wallet')
      .then(({ data }) => setWallet(data))
      .catch(() => setWallet({ balance: 0, transactions: [] }));

  useEffect(() => {
    load();
  }, []);

  const recharge = async (e) => {
    e.preventDefault();
    setError('');
    if (!amount || Number(amount) <= 0) return setError('Please enter a valid amount');
    setBusy(true);
    try {
      await api.post('/wallet/recharge', { amount: +amount });
      setAmount('');
      load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!wallet) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="h-5 w-5 animate-spin text-brand" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-medium">Loading wallet…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Wallet</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your balance and view transaction history.</p>
      </div>

      {/* Two-column layout grid on desktop */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        
        {/* Left Column: Balance & Recharge (takes 5/12) */}
        <div className="space-y-6 lg:col-span-5">
          
          {/* Card 1: Available Balance */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-brand to-brand-dark p-6 text-white shadow-card">
            {/* Background design accents */}
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -bottom-8 right-12 h-20 w-20 rounded-full bg-white/10" />
            
            <div className="flex items-center gap-2 text-sm font-medium opacity-90">
              <WalletIcon className="h-4 w-4" />
              <span>Available Balance</span>
            </div>
            <div className="mt-2 text-4xl font-extrabold tracking-tight">{money(wallet.balance)}</div>
            <div className="mt-4 text-xs text-white/70">Verified & secured by organization portal</div>
          </Card>

          {/* Card 2: Recharge form */}
          <Card className="p-6 shadow-card">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <PlusCircle className="h-4.5 w-4.5 text-brand" />
              <h2 className="font-semibold text-slate-800">Recharge (Test Mode)</h2>
            </div>
            
            <form onSubmit={recharge} className="mt-4 space-y-4">
              <Input
                label="Amount (₹)"
                type="number"
                min="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount to add"
              />
              
              <div className="flex flex-wrap gap-2">
                {[100, 200, 500, 1000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(String(v))}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 active:scale-95"
                  >
                    +{v}
                  </button>
                ))}
              </div>

              {error && <Alert variant="error">{error}</Alert>}

              <Button type="submit" disabled={busy} className="w-full">
                {busy ? 'Processing…' : 'Add money'}
              </Button>
            </form>
          </Card>
        </div>

        {/* Right Column: Transactions (takes 7/12) */}
        <div className="lg:col-span-7">
          
          {/* Card 3: Recent Transactions */}
          <Card className="flex h-full flex-col p-6 shadow-card">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <History className="h-4.5 w-4.5 text-slate-400" />
              <h2 className="font-semibold text-slate-800">Recent Transactions</h2>
            </div>

            <div className="flex-1 mt-4">
              {wallet.transactions.length === 0 ? (
                <Empty icon={History} title="No transactions yet" hint="Your financial logs will appear here." />
              ) : (
                <div className="divide-y divide-slate-100">
                  {wallet.transactions.map((t) => {
                    const isDebit = t.transaction_type === 'RIDE_PAYMENT';
                    return (
                      <div key={t.transaction_id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDebit ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {isDebit ? <ArrowDownLeft className="h-4.5 w-4.5" /> : <ArrowUpRight className="h-4.5 w-4.5" />}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-800 capitalize">
                              {t.transaction_type.toLowerCase().replace('_', ' ')}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {new Date(t.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className={`text-sm font-bold ${isDebit ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {isDebit ? '-' : '+'}{money(t.amount)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
