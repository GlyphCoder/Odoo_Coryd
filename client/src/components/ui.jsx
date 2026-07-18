// Small styled primitives (Tailwind classes) shared across pages.

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-brand text-white hover:bg-brand-dark',
    outline: 'border border-slate-300 text-slate-700 hover:bg-slate-100',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    subtle: 'bg-brand/10 text-brand-dark hover:bg-brand/20',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

export function Card({ children, className = '' }) {
  return <div className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

export function Input({ label, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>}
      <input
        className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand ${className}`}
        {...props}
      />
    </label>
  );
}

export function Select({ label, children, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>}
      <select
        className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

const badgeColors = {
  OPEN: 'bg-emerald-100 text-emerald-700', FULL: 'bg-amber-100 text-amber-700',
  BOOKED: 'bg-sky-100 text-sky-700', STARTED: 'bg-indigo-100 text-indigo-700',
  IN_PROGRESS: 'bg-violet-100 text-violet-700', COMPLETED: 'bg-slate-200 text-slate-700',
  CANCELLED: 'bg-rose-100 text-rose-700', PENDING: 'bg-amber-100 text-amber-700',
  PAYMENT_PENDING: 'bg-amber-100 text-amber-700',
};
export function Badge({ status, children }) {
  const cls = badgeColors[status] || 'bg-slate-100 text-slate-600';
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children || status}</span>;
}

export function Spinner({ label = 'Loading…' }) {
  return <div className="flex items-center justify-center gap-2 p-8 text-slate-500 text-sm">{label}</div>;
}

export function Empty({ title, hint }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
      <p className="font-medium text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}
    </div>
  );
}

export function money(n) {
  const v = Number(n || 0);
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
