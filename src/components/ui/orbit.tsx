'use client';

import Link from 'next/link';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative min-h-screen pb-28 text-slate-100 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  accent,
  subtitle,
  icon: Icon,
  backHref,
  onBack,
  actions,
}: {
  title: string;
  accent?: string;
  subtitle?: string;
  icon?: LucideIcon;
  backHref?: string;
  onBack?: () => void;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {(backHref || onBack) && (
            backHref ? (
              <Link
                href={backHref}
                className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300"
              >
                <ArrowLeft size={18} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={onBack}
                className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300"
              >
                <ArrowLeft size={18} />
              </button>
            )
          )}
          {Icon && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2.5 text-cyan-400">
              <Icon size={18} />
            </div>
          )}
          <div className="min-w-0">
            <h1
              className="truncate text-xl font-semibold tracking-tight text-white"
              style={{ fontFamily: 'var(--font-display), system-ui' }}
            >
              {title}
              {accent ? <span className="text-cyan-400"> {accent}</span> : null}
            </h1>
            {subtitle && (
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function PageBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-7xl space-y-4 px-4 py-4 ${className}`}>{children}</div>
  );
}

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl shadow-cyan-950/10 ${className}`}
    >
      {children}
    </section>
  );
}

export function PanelTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <h2
        className="text-base font-semibold text-white"
        style={{ fontFamily: 'var(--font-display), system-ui' }}
      >
        {children}
      </h2>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'cyan' | 'amber' | 'rose' | 'emerald';
}) {
  const tones = {
    default: 'border-slate-800 bg-slate-900/80',
    cyan: 'border-cyan-500/40 bg-cyan-500/10',
    amber: 'border-amber-500/40 bg-amber-500/10',
    rose: 'border-rose-500/40 bg-rose-500/10',
    emerald: 'border-emerald-500/40 bg-emerald-500/10',
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-lg font-bold tabular-nums text-slate-100">{value}</p>
    </div>
  );
}

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
      {options.map((opt) => {
        const active = value === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide transition ${
              active
                ? 'bg-cyan-500/20 text-cyan-300 shadow-sm shadow-cyan-950/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {Icon && <Icon size={14} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function PrimaryButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/25 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-6 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,211,238,0.12),transparent)]" />
      <div className="relative z-10 w-full max-w-sm space-y-8">{children}</div>
    </div>
  );
}

export function AuthBrand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="text-center">
      <h1
        className="text-4xl font-bold tracking-tight text-white"
        style={{ fontFamily: 'var(--font-display), system-ui' }}
      >
        Orbit<span className="text-cyan-400">Aire</span>
      </h1>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
        {subtitle || 'Intelligence opérationnelle autoroutière'}
      </p>
    </div>
  );
}
