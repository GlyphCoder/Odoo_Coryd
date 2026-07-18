import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiError } from '../api.js';
import { Button, Input, Card } from '../components/ui.jsx';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    orgCode: '', fullName: '', email: '', phoneNumber: '', password: '',
    employeeCode: '', department: '', designation: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await signup(form);
      navigate('/app');
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand/10 to-white px-4 py-10">
      <Card className="w-full max-w-lg p-8">
        <Link to="/" className="text-xl font-extrabold text-brand-dark">🚗 Carpool</Link>
        <h1 className="mt-4 text-2xl font-bold text-slate-800">Create your account</h1>
        <p className="text-sm text-slate-500">Join your organization using its code (try <b>ACME</b>).</p>
        <form onSubmit={submit} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Organization code" required value={form.orgCode} onChange={set('orgCode')} placeholder="ACME" />
          <Input label="Full name" required value={form.fullName} onChange={set('fullName')} />
          <Input label="Email" type="email" required value={form.email} onChange={set('email')} />
          <Input label="Phone" value={form.phoneNumber} onChange={set('phoneNumber')} />
          <Input label="Password" type="password" required value={form.password} onChange={set('password')} />
          <Input label="Employee code" value={form.employeeCode} onChange={set('employeeCode')} />
          <Input label="Department" value={form.department} onChange={set('department')} />
          <Input label="Designation" value={form.designation} onChange={set('designation')} />
          {error && <p className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Creating…' : 'Sign up'}</Button>
          </div>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account? <Link to="/login" className="font-semibold text-brand-dark">Log in</Link>
        </p>
      </Card>
    </div>
  );
}
