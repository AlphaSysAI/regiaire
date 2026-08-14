'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Upload,
  Download,
  Package,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  PrimaryButton,
} from '@/components/ui/orbit';

type ImportResult = {
  ok?: boolean;
  mode?: string;
  imported?: number;
  applied?: { line: number; ean: string; action: string }[];
  errors?: { line: number; message: string }[];
  error?: string;
  issues?: { line: number; message: string }[];
};

export default function InventairePage() {
  const [aireId, setAireId] = useState<string | null>(null);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [defaultExpiry, setDefaultExpiry] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('aire_id')
        .eq('id', user.id)
        .single();
      setAireId(profile?.aire_id ?? null);
    })();
  }, []);

  async function getAccessToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function handleDownloadTemplate() {
    const res = await fetch('/api/stock/import/template');
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-import-stock.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    const input = fileRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setResult({ error: 'Choisis un fichier Excel (.xlsx ou .xls).' });
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setResult({ error: 'Tu dois être connecté pour importer.' });
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', mode);
      if (defaultExpiry.trim()) fd.append('defaultExpiry', defaultExpiry.trim());

      const res = await fetch('/api/stock/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = (await res.json()) as ImportResult;
      setResult(data);
      if (res.ok && input) input.value = '';
    } catch {
      setResult({ error: 'Échec réseau pendant l’import.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Inventaire"
        accent="import"
        subtitle="Fichier Excel → stocks OrbitAire"
        icon={Package}
      />

      <PageBody className="max-w-lg mx-auto">
        {!aireId ? (
          <p className="text-slate-400 text-sm">Chargement du profil…</p>
        ) : (
          <div className="space-y-4">
            <Panel className="space-y-4">
              <p className="text-slate-400 text-sm leading-relaxed">
                Colonnes requises : <strong className="text-slate-200">EAN</strong> (ou code-barres / GTIN) et{' '}
                <strong className="text-slate-200">quantité</strong>. La <strong className="text-slate-200">DLC</strong>{' '}
                peut être dans une colonne ou remplie par la date par défaut ci-dessous pour toutes les lignes.
              </p>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <Download size={16} />
                Télécharger le modèle Excel
              </button>
            </Panel>

            <Panel>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    Mode
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200">
                      <input
                        type="radio"
                        name="mode"
                        checked={mode === 'add'}
                        onChange={() => setMode('add')}
                        className="accent-cyan-400"
                      />
                      Ajouter aux stocks existants
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200">
                      <input
                        type="radio"
                        name="mode"
                        checked={mode === 'replace'}
                        onChange={() => setMode('replace')}
                        className="accent-cyan-400"
                      />
                      Remplacer (réinitialiser puis importer)
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Remplacer : pour chaque EAN déjà en base, les lots actuels sont passés à 0 puis les lignes du fichier
                    sont ajoutées comme nouveaux lots.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    DLC par défaut (optionnel)
                  </label>
                  <input
                    type="date"
                    value={defaultExpiry}
                    onChange={(e) => setDefaultExpiry(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
                  />
                  <p className="text-[11px] text-slate-500">
                    Utilisée si la colonne DLC est vide sur une ligne. Sinon laisse vide et mets une DLC par ligne dans le
                    fichier.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    Fichier
                  </label>
                  <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-700 rounded-2xl py-10 px-4 cursor-pointer hover:border-cyan-500/50 transition-colors">
                    <FileSpreadsheet className="text-slate-500" size={36} />
                    <span className="text-sm text-slate-400">.xlsx, .xls</span>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" />
                  </label>
                </div>

                <PrimaryButton type="submit" disabled={loading} className="w-full py-4 text-sm">
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
                  Importer
                </PrimaryButton>
              </form>
            </Panel>

            {result && (
              <Panel className="space-y-3">
                {result.error && (
                  <div className="flex gap-2 text-red-400 text-sm">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <span>{result.error}</span>
                  </div>
                )}
                {result.issues && result.issues.length > 0 && (
                  <ul className="text-xs text-amber-400/90 space-y-1">
                    {result.issues.map((i) => (
                      <li key={i.line}>
                        Ligne {i.line} : {i.message}
                      </li>
                    ))}
                  </ul>
                )}
                {result.ok && (
                  <div className="flex gap-2 text-emerald-400 text-sm">
                    <CheckCircle2 size={18} className="shrink-0" />
                    <span>
                      {result.imported} ligne(s) importée(s) ({result.mode === 'replace' ? 'remplacement' : 'ajout'}).
                    </span>
                  </div>
                )}
                {result.applied && result.applied.length > 0 && (
                  <ul className="text-[11px] text-slate-400 max-h-40 overflow-y-auto space-y-1 font-mono">
                    {result.applied.map((a) => (
                      <li key={`${a.line}-${a.ean}`}>
                        L{a.line} · {a.ean} · {a.action}
                      </li>
                    ))}
                  </ul>
                )}
                {result.errors && result.errors.length > 0 && (
                  <ul className="text-xs text-red-400/90 space-y-1">
                    {result.errors.map((e) => (
                      <li key={e.line}>
                        Ligne {e.line} : {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </div>
        )}
      </PageBody>
    </PageShell>
  );
}
