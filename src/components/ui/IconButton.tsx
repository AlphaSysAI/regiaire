'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type IconButtonVariant =
  | 'validate'
  | 'danger'
  | 'edit'
  | 'neutral'
  | 'download'
  | 'primary';

const variantClasses: Record<IconButtonVariant, string> = {
  validate:
    'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300',
  danger: 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300',
  edit: 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300',
  neutral:
    'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100',
  download:
    'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300',
  primary:
    'bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 hover:text-cyan-200',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: IconButtonVariant;
  loading?: boolean;
  children: ReactNode;
  size?: 'sm' | 'md';
};

/** Bouton icône accessible (title + aria-label). */
export function IconButton({
  label,
  variant = 'neutral',
  loading = false,
  children,
  size = 'sm',
  className = '',
  disabled,
  type = 'button',
  ...rest
}: Props) {
  const dim = size === 'md' ? 'h-9 w-9' : 'h-8 w-8';
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      disabled={disabled || loading}
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : children}
    </button>
  );
}
