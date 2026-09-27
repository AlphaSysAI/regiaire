'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Calendar,
  LayoutDashboard,
  Package,
  ScanLine,
  TrendingDown,
  Users,
  Shield,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  defaultLandingPath,
  moduleForPath,
  navItemsForModules,
  normalizeModules,
  type ModuleKey,
} from '@/lib/modules';
import { isAdminEmail } from '@/lib/admin-emails';

const ICONS: Record<string, typeof LayoutDashboard> = {
  '/': LayoutDashboard,
  '/scanner': ScanLine,
  '/inventaire': Package,
  '/antigaspi': TrendingDown,
  '/equipe': Users,
  '/planning': Calendar,
};

/**
 * Navigation basse filtrée par modules du profil.
 * Masquée sur login / invite / auth.
 */
export default function AppNav() {
  const pathname = usePathname() || '/';
  const [modules, setModules] = useState<ModuleKey[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  const hideNav =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/invite') ||
    pathname.startsWith('/admin');

  useEffect(() => {
    if (hideNav) {
      setChecked(true);
      return;
    }

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setModules([]);
        setChecked(true);
        return;
      }

      const adminByEmail = isAdminEmail(user.email);
      setIsAdmin(adminByEmail);

      const { data: profile } = await supabase
        .from('profiles')
        .select('enabled_modules, role, profile_completed')
        .eq('id', user.id)
        .maybeSingle();

      const mods =
        profile?.role === 'admin' || adminByEmail
          ? normalizeModules([
              'pilotage',
              'stock',
              'antigaspi',
              'equipe',
              'planning',
              'reappro',
              'verdict',
              'livraisons',
            ])
          : normalizeModules(profile?.enabled_modules);

      setModules(mods);
      setIsAdmin(adminByEmail || profile?.role === 'admin');

      // Gate module : rediriger si page non autorisée
      const needed = moduleForPath(pathname);
      if (needed && mods.length > 0 && !mods.includes(needed)) {
        window.location.href = defaultLandingPath(mods);
        return;
      }
      setChecked(true);
    })();
  }, [pathname, hideNav]);

  if (hideNav || !checked || !modules || modules.length === 0) {
    return null;
  }

  const items = navItemsForModules(modules);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-[4.5rem] items-center justify-around border-t border-slate-800/80 bg-slate-950/95 px-1 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md">
      {items.map((item) => {
        const Icon = ICONS[item.href] || LayoutDashboard;
        const active =
          item.href === '/'
            ? pathname === '/'
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={`${item.key}-${item.href}`}
            href={item.href}
            className={`flex flex-col items-center gap-1 transition-colors ${
              active ? 'text-cyan-400' : 'text-slate-500 hover:text-cyan-300'
            }`}
          >
            <Icon size={22} />
            <span className="text-[9px] font-semibold uppercase tracking-wide">
              {item.label}
            </span>
          </Link>
        );
      })}
      {isAdmin && (
        <Link
          href="/admin"
          className={`flex flex-col items-center gap-1 transition-colors ${
            pathname.startsWith('/admin')
              ? 'text-cyan-400'
              : 'text-slate-500 hover:text-cyan-300'
          }`}
        >
          <Shield size={22} />
          <span className="text-[9px] font-semibold uppercase tracking-wide">Admin</span>
        </Link>
      )}
    </nav>
  );
}
