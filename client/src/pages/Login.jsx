import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Search, Map, Shield } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiError } from '../api.js';
import { Button, Input, Alert } from '../components/ui.jsx';

const perks = [
  { Icon: Search, text: 'Find rides matching your route' },
  { Icon: Map,    text: 'Live GPS tracking during trips' },
  { Icon: Shield, text: 'Secure UPI & wallet payments' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await login(form.email, form.password);
      const next = new URLSearchParams(location.search).get('next');
      navigate(next?.startsWith('/app') ? next : '/app');
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen bg-white">

      {/* ── Left brand panel (hidden on mobile) ── */}
      <div className="hidden lg:flex lg:w-[42%] flex-col justify-between bg-gradient-to-br from-brand-dark to-brand p-12">
        <Link to="/" className="inline-flex items-center gap-2 text-xl font-extrabold text-white">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 font-black text-sm backdrop-blur-sm">
            Cr
          </span>
          CoRYD
        </Link>

        <div>
          <h2 className="text-3xl font-bold leading-snug text-white">
            Your daily commute,<br />
            <span className="text-green-200">simplified.</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-green-100/80">
            Connect with colleagues, share rides, and make every journey count.
          </p>
          <ul className="mt-8 space-y-4">
            {perks.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-green-50">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-green-200/60">© 2026 CoRYD · Enterprise ride sharing</p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-xl font-extrabold text-brand-dark lg:hidden">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-brand font-black text-sm text-white">Cr</span>
          CoRYD
        </Link>

        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Log in to your organization account.</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <Input
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@company.com"
            />

            {/* Password with show/hide */}
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</span>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-800 placeholder:text-slate-400 shadow-input outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error && <Alert variant="error">{error}</Alert>}

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Signing in…' : <>Log in <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            New here?{' '}
            <Link to="/signup" className="font-semibold text-brand-dark hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
