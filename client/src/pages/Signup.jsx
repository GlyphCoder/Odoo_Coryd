import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiError } from '../api.js';
import Brand from '../components/Brand.jsx';
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
  const [success, setSuccess] = useState('');
  const [busy, setBusy]     = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setBusy(true);
    try {
      const res = await signup(form);
      setSuccess(res.message);
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="glass-card w-full max-w-6xl overflow-hidden">
        <div className="glass-body flex min-h-[40rem] flex-col lg:flex-row">

          {/* ── Left brand panel ── */}
          <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-dark via-brand to-brand-mid p-10 lg:flex lg:w-[38%]">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-brand-light/20 blur-2xl" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />

            <div className="relative">
              <Link to="/">
                <Brand size="md" tone="light" tagline="Ride together" />
              </Link>
            </div>

            <div className="relative">
              <h2 className="text-[2rem] font-extrabold leading-snug tracking-tight text-white">
                Join your team<br />
                <span className="text-brand-light">on the road.</span>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                Create your account using your organization code and start sharing rides with colleagues.
              </p>

              <div className="mt-8 rounded-2xl border border-white/20 bg-white/12 px-5 py-4 text-sm text-white/90 backdrop-blur-md">
                <p className="font-bold">Demo credentials</p>
                <p className="mt-1.5 font-mono text-xs text-brand-light">Org code: <b className="text-white">ACME</b></p>
                <p className="font-mono text-xs text-brand-light">admin@acme.com / admin123</p>
                <p className="font-mono text-xs text-brand-light">ravi@acme.com / password123</p>
              </div>
            </div>

            <p className="relative text-xs text-white/45">© 2026 CoRYD · Enterprise ride sharing</p>
          </div>

          {/* ── Right form panel ── */}
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-12 sm:px-10">
            {/* Mobile logo */}
            <Link to="/" className="mb-6 lg:hidden">
              <Brand size="md" />
            </Link>

            <div className="w-full max-w-lg">
              <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Create your account</h1>
              <p className="mt-1 text-sm text-ink-500">
                Use your organization code to register (try{' '}
                <code className="rounded-md bg-brand/10 px-1.5 py-0.5 font-mono text-xs font-bold text-brand-dark">ACME</code>).
              </p>

              <form onSubmit={submit} className="mt-8 space-y-4">

                {/* Section: Organization */}
                <p className="text-[11px] font-bold uppercase tracking-widest text-brand">Organization</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="Org code" required value={form.orgCode} onChange={set('orgCode')} placeholder="ACME" />
                  <Input label="Employee code" value={form.employeeCode} onChange={set('employeeCode')} placeholder="Optional" />
                </div>

                {/* Section: Personal */}
                <p className="pt-2 text-[11px] font-bold uppercase tracking-widest text-brand">Personal</p>
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
                <p className="pt-2 text-[11px] font-bold uppercase tracking-widest text-brand">Security</p>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-500">Password</span>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      required
                      value={form.password}
                      onChange={set('password')}
                      placeholder="Min. 8 characters"
                      className="glass-input w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm text-ink-800 placeholder:text-ink-400 outline-none transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition hover:text-brand"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>

                {error && <Alert variant="error">{error}</Alert>}

                {success ? (
                  <Alert variant="success" title="Success">
                    <p>{success}</p>
                    <p className="mt-2">
                      <Link to="/login" className="font-semibold text-brand underline">Go to Login</Link>
                    </p>
                  </Alert>
                ) : (
                  <Button type="submit" disabled={busy} size="lg" className="w-full">
                    {busy ? 'Creating account…' : <>Create account <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                )}
              </form>

              <p className="mt-6 text-center text-sm text-ink-500">
                Already have an account?{' '}
                <Link to="/login" className="font-bold text-brand-dark transition hover:text-brand hover:underline">
                  Log in
                </Link>
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
