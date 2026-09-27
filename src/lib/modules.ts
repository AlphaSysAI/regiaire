/**
 * Catalogue des modules / add-ons OrbitAire (1 entreprise = 1 user).
 */

export const MODULE_KEYS = [
  'pilotage',
  'stock',
  'antigaspi',
  'equipe',
  'planning',
  'reappro',
  'verdict',
  'livraisons',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  description: string;
  /** Routes accessibles si le module est actif */
  routes: string[];
  /** Affiché dans la barre de navigation basse */
  nav?: { href: string; label: string };
}

export const MODULE_CATALOG: ModuleDefinition[] = [
  {
    key: 'pilotage',
    label: 'Pilotage',
    description: 'Dashboard tour de contrôle, prévisions CA / stock',
    routes: ['/'],
    nav: { href: '/', label: 'Pilotage' },
  },
  {
    key: 'stock',
    label: 'Stock & Scanner',
    description: 'Inventaire, imports stock, scanner EAN',
    routes: ['/inventaire', '/scanner'],
    nav: { href: '/inventaire', label: 'Stock' },
  },
  {
    key: 'antigaspi',
    label: 'Anti-gaspi',
    description: 'Lots périssables, promos et casse',
    routes: ['/antigaspi'],
    nav: { href: '/antigaspi', label: 'AntiGaspi' },
  },
  {
    key: 'equipe',
    label: 'Équipe',
    description: 'Checklists et notes de service',
    routes: ['/equipe'],
    nav: { href: '/equipe', label: 'Équipe' },
  },
  {
    key: 'planning',
    label: 'Planning',
    description: 'Optimisation des plannings employés (Timefold)',
    routes: ['/planning'],
    nav: { href: '/planning', label: 'Planning' },
  },
  {
    key: 'reappro',
    label: 'Réappro',
    description: 'Plan de commande 7 jours',
    routes: ['/reappro'],
  },
  {
    key: 'verdict',
    label: 'Verdict IA',
    description: 'Conseils opérationnels IA',
    routes: ['/verdict'],
  },
  {
    key: 'livraisons',
    label: 'Livraisons',
    description: 'BL, réceptions et journal livraisons',
    routes: ['/livraisons', '/reception-bl'],
  },
];

export function normalizeModules(raw: unknown): ModuleKey[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set(MODULE_KEYS);
  return raw.filter((m): m is ModuleKey => typeof m === 'string' && set.has(m as ModuleKey));
}

export function hasModule(modules: ModuleKey[] | null | undefined, key: ModuleKey): boolean {
  return (modules ?? []).includes(key);
}

/** Module requis pour une pathname donnée (null = route libre / auth). */
export function moduleForPath(pathname: string): ModuleKey | null {
  const path = pathname.split('?')[0] || '/';
  if (
    path.startsWith('/login') ||
    path.startsWith('/auth') ||
    path.startsWith('/invite') ||
    path.startsWith('/admin') ||
    path.startsWith('/api')
  ) {
    return null;
  }
  for (const mod of MODULE_CATALOG) {
    for (const route of mod.routes) {
      if (route === '/' && path === '/') return mod.key;
      if (route !== '/' && (path === route || path.startsWith(`${route}/`))) {
        return mod.key;
      }
    }
  }
  // Scanner lié au stock même s'il a sa propre entrée nav historique
  if (path.startsWith('/scanner')) return 'stock';
  return null;
}

export function defaultLandingPath(modules: ModuleKey[]): string {
  const order: ModuleKey[] = [
    'pilotage',
    'stock',
    'planning',
    'equipe',
    'antigaspi',
    'reappro',
    'verdict',
    'livraisons',
  ];
  for (const key of order) {
    if (!modules.includes(key)) continue;
    const def = MODULE_CATALOG.find((m) => m.key === key);
    if (def?.nav) return def.nav.href;
    if (def?.routes[0]) return def.routes[0];
  }
  return '/login';
}

export function navItemsForModules(modules: ModuleKey[]) {
  const items: Array<{ href: string; label: string; key: ModuleKey }> = [];
  for (const mod of MODULE_CATALOG) {
    if (!mod.nav) continue;
    if (!modules.includes(mod.key)) continue;
    // Scanner séparé si stock actif
    if (mod.key === 'stock') {
      items.push({ href: '/scanner', label: 'Scanner', key: 'stock' });
      items.push({ href: '/inventaire', label: 'Stock', key: 'stock' });
      continue;
    }
    items.push({ href: mod.nav.href, label: mod.nav.label, key: mod.key });
  }
  return items;
}
