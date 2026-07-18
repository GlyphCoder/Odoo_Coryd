import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiError } from '../api.js';
import { Button, Input, Alert } from '../components/ui.jsx';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    orgCode: '', fullName: '', email: '', phoneNumber: '',
    password: '', employeeCode: '', department: '', designation: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [error, setError]   = useState('');
  const [busy, setBusy]     = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await signup(form); navigate('/app'); }
    catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen bg-white">

      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex lg:w-[38%] flex-col justify-between bg-gradient-to-br from-brand-dark to-brand p-12">
        <Link to="/" className="inline-flex items-center gap-2 text-xl font-extrabold text-white">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 font-black text-sm backdrop-blur-sm">
            Cr
          </span>
          CoRYD
        </Link>

        <div>
          <h2 className="text-3xl font-bold leading-snug text-white">
            Join your team<br />
            <span className="text-green-200">on the road.</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-green-100/80">
            Create your account using your organization code and start sharing rides with colleagues.
          </p>
          <div className="mt-8 rounded-2xl bg-white/10 px-5 py-4 text-sm text-green-50 backdrop-blur-sm">
            <p className="font-semibold">Demo credentials</p>
            <p className="mt-1 font-mono text-xs text-green-200">Org code: <b>ACME</b></p>
            <p className="font-mono text-xs text-green-200">admin@acme.com / admin123</p>
            <p className="font-mono text-xs text-green-200">ravi@acme.com / password123</p>
          </div>
        </div>

        <p className="text-xs text-green-200/60">© 2026 CoRYD · Enterprise ride sharing</p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        {/* Mobile logo */}
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-xl font-extrabold text-brand-dark lg:hidden">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-brand font-black text-sm text-white">Cr</span>
          CoRYD
        </Link>

        <div className="w-full max-w-lg">
          <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">
            Use your organization code to register (try <code className="rounded bg-slate-100 px-1 font-mono">ACME</code>).
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">

            {/* Section: Organization */}
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Organization</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Org code" required value={form.orgCode} onChange={set('orgCode')} placeholder="ACME" />
              <Input label="Employee code" value={form.employeeCode} onChange={set('employeeCode')} placeholder="Optional" />
            </div>

            {/* Section: Personal */}
            <p className="pt-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Personal</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Full name" required value={form.fullName} onChange={set('fullName')} />
              <Input label="Email" type="email" required value={form.email} onChange={set('email')} />
              <Input label="Phone" value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="Optional" />
              <Input label="Department" value={form.department} onChange={set('department')} placeholder="Optional" />
              <div className="sm:col-span-2">
                <Input label="Designation" value={form.designation} onChange={set('designation')} placeholder="Optional" />
              </div>
            </div>

            {/* Section: Security */}
            <p className="pt-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Security</p>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</span>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={set('password')}
                  placeholder="Min. 8 characters"
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
              {busy ? 'Creating account…' : <>Create account <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-brand-dark hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
