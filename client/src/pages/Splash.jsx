import { Link } from 'react-router-dom';

export default function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand/10 to-white px-6 text-center">
      <div className="text-6xl">🚗</div>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-800">Carpool</h1>
      <p className="mt-2 max-w-md text-slate-500">
        Enterprise ride sharing for your organization. Find a ride, offer a ride,
        track trips live, and split the cost — all in one place.
      </p>
      <div className="mt-8 flex gap-3">
        <Link to="/login" className="rounded-lg bg-brand px-6 py-2.5 font-semibold text-white hover:bg-brand-dark">Log in</Link>
        <Link to="/signup" className="rounded-lg border border-slate-300 px-6 py-2.5 font-semibold text-slate-700 hover:bg-slate-100">Sign up</Link>
      </div>
      <p className="mt-10 text-xs text-slate-400">Demo org code: <b>ACME</b> · admin@acme.com / admin123 · ravi@acme.com / password123</p>
    </div>
  );
}
