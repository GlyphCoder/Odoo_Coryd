import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiError } from '../api.js';
import { Button, Input, Card } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await login(form.email, form.password);
      navigate('/app');
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand/10 to-white px-4">
      <Card className="w-full max-w-md p-8">
        <Link to="/" className="text-xl font-extrabold text-brand-dark">🚗 Carpool</Link>
        <h1 className="mt-4 text-2xl font-bold text-slate-800">Welcome back</h1>
        <p className="text-sm text-slate-500">Log in to your organization account.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Input label="Email" type="email" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" />
          <Input label="Password" type="password" required value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Log in'}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          New here? <Link to="/signup" className="font-semibold text-brand-dark">Create an account</Link>
        </p>
      </Card>
    </div>
  );
}
