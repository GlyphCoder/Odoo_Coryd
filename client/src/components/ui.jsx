// ui.jsx — Industry-grade component system for CoRYD

/* ── Button ─────────────────────────────────────────────── */
export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = [
    'inline-flex items-center justify-center gap-2',
    'rounded-xl px-4 py-2.5 text-sm font-semibold',
    'transition-all duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'active:scale-[0.97]',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
  ].join(' ');

  const variants = {
    primary: 'bg-brand text-white hover:bg-brand-dark shadow-sm focus-visible:ring-brand',
    outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-input focus-visible:ring-brand',
    ghost:   'text-slate-600 hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-slate-400',
    danger:  'bg-rose-600 text-white hover:bg-rose-700 shadow-sm focus-visible:ring-rose-500',
    subtle:  'bg-brand/10 text-brand-dark hover:bg-brand/15 focus-visible:ring-brand',
  };

  return (
    <button className={`${base} ${variants[variant] ?? variants.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}

/* ── Card ───────────────────────────────────────────────── */
export function Card({ children, className = '', hover = false }) {
  return (
    <div
      className={[
        'rounded-2xl bg-white ring-1 ring-black/[0.06]',
        hover ? 'shadow-card transition-shadow duration-200 hover:shadow-card-hover' : 'shadow-card',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

/* ── Input ──────────────────────────────────────────────── */
export function Input({ label, className = '', error, ...props }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
      )}
      <input
        className={[
          'w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-800',
          'placeholder:text-slate-400 shadow-input',
          'outline-none transition-all duration-150',
          error
            ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-200'
            : 'border-slate-200 focus:border-brand focus:ring-2 focus:ring-brand/20',
          className,
        ].join(' ')}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </label>
  );
}

/* ── Select ─────────────────────────────────────────────── */
export function Select({ label, children, className = '', ...props }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
      )}
      <select
        className={[
          'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5',
          'text-sm text-slate-800 shadow-input',
          'outline-none transition-all duration-150',
          'focus:border-brand focus:ring-2 focus:ring-brand/20',
          className,
        ].join(' ')}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

/* ── Badge ──────────────────────────────────────────────── */
const badgeMap = {
  OPEN:            'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80',
  FULL:            'bg-amber-50   text-amber-700   ring-1 ring-amber-200/80',
  BOOKED:          'bg-sky-50     text-sky-700     ring-1 ring-sky-200/80',
  STARTED:         'bg-indigo-50  text-indigo-700  ring-1 ring-indigo-200/80',
  IN_PROGRESS:     'bg-violet-50  text-violet-700  ring-1 ring-violet-200/80',
  COMPLETED:       'bg-slate-100  text-slate-600   ring-1 ring-slate-200/80',
  CANCELLED:       'bg-rose-50    text-rose-700    ring-1 ring-rose-200/80',
  PENDING:         'bg-amber-50   text-amber-700   ring-1 ring-amber-200/80',
  PAYMENT_PENDING: 'bg-orange-50  text-orange-700  ring-1 ring-orange-200/80',
  ACTIVE:          'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80',
  INACTIVE:        'bg-slate-100  text-slate-500   ring-1 ring-slate-200/80',
  SUSPENDED:       'bg-rose-50    text-rose-700    ring-1 ring-rose-200/80',
};

export function Badge({ status, children }) {
  const cls = badgeMap[status] ?? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/80';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {children ?? status}
    </span>
  );
}

/* ── Spinner ────────────────────────────────────────────── */
export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-slate-400">
      <svg
        className="h-8 w-8 animate-spin text-brand"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path
          className="opacity-80"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────── */
export function Empty({ title, hint, icon: Icon, children }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Icon className="h-7 w-7 text-slate-400" strokeWidth={1.5} />
        </div>
      )}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/* ── Alert ──────────────────────────────────────────────── */
const alertStyles = {
  error:   { wrap: 'bg-rose-50    border-rose-200   text-rose-700',   icon: 'text-rose-500',   d: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z' },
  warning: { wrap: 'bg-amber-50   border-amber-200  text-amber-700',  icon: 'text-amber-500',  d: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z' },
  info:    { wrap: 'bg-sky-50     border-sky-200    text-sky-700',    icon: 'text-sky-500',    d: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z' },
  success: { wrap: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: 'text-emerald-500', d: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
};

export function Alert({ variant = 'error', children }) {
  const s = alertStyles[variant] ?? alertStyles.error;
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${s.wrap}`}>
      <svg className={`mt-0.5 h-4 w-4 shrink-0 ${s.icon}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={s.d} />
      </svg>
      <span>{children}</span>
    </div>
  );
}

/* ── money formatter ────────────────────────────────────── */
export function money(n) {
  const v = Number(n || 0);
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
