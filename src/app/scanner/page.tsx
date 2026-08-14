'use client';

import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from '@/lib/supabase';
import {
  RefreshCw,
  ScanLine,
  PlusCircle,
  Minus,
  Calendar,
  ListFilter,
  Save,
  Tag,
  Euro,
  Package,
  Loader2,
  Hammer,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';
import { fetchGlobalProduct } from '@/lib/products';
import {
  PageShell,
  PageHeader,
  PageBody,
  Panel,
  PrimaryButton,
} from '@/components/ui/orbit';

export default function ScannerPage() {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [product, setProduct] = useState<any>(null);
  const [detailedStocks, setDetailedStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);

  const [userAireId, setUserAireId] = useState<string | null>(null);

  // États pour le nouveau produit
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState<string>('0');
  const [newCategory, setNewCategory] = useState('Boissons');

  // États pour l'action de stock
  const [quantity, setQuantity] = useState<number | string>(1);
  const [expiryDate, setExpiryDate] = useState('');

  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    async function getAire() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('aire_id')
          .eq('id', user.id)
          .single();
        setUserAireId(profile?.aire_id);
      }
    }
    getAire();
  }, []);

  const handleReset = () => {
    setScanResult(null);
    setProduct(null);
    setDetailedStocks([]);
    setQuantity(1);
    setExpiryDate('');
    setLoading(false);
    setIsNewProduct(false);
    setNewName('');
    setNewPrice('0');
    setNewCategory('Boissons');
  };

  useEffect(() => {
    if (!scanResult && document.getElementById('reader') && userAireId) {
      const scanner = new Html5QrcodeScanner(
        'reader',
        {
          fps: 15,
          qrbox: { width: 350, height: 200 },
          aspectRatio: 1.0,
        },
        false
      );
      scanner.render(
        async (decodedText) => {
          setScanResult(decodedText);
          setLoading(true);
          scanner.clear().catch(() => {});

          const { data: prod } = await supabase
            .from('products')
            .select('*')
            .eq('ean', decodedText)
            .eq('aire_id', userAireId)
            .single();

          if (prod) {
            setProduct(prod);
            const { data: stocks } = await supabase
              .from('product_stocks')
              .select('*')
              .eq('product_id', prod.id)
              .gt('quantity', 0)
              .order('expiry_date', { ascending: true });

            setDetailedStocks(stocks || []);
            setIsNewProduct(false);
            setLoading(false);
          } else {
            setIsSearchingGlobal(true);
            const globalData = await fetchGlobalProduct(decodedText);

            if (globalData.success) {
              setNewName(`${globalData.brand ? globalData.brand + ' ' : ''}${globalData.name}`);
              if (globalData.category.toLowerCase().includes('bev')) setNewCategory('Boissons');
              if (globalData.category.toLowerCase().includes('snack')) setNewCategory('Snacking');
            }

            setIsNewProduct(true);
            setIsSearchingGlobal(false);
            setLoading(false);
          }
        },
        () => {}
      );
      scannerRef.current = scanner;
      return () => {
        scanner.clear().catch(() => {});
      };
    }
  }, [scanResult, userAireId]);

  async function handleCreateAndAdd() {
    if (!newName || !expiryDate || !userAireId) {
      alert('⚠️ Nom, DLC et Aire obligatoires !');
      return;
    }
    setLoading(true);

    const { data: newProd, error: prodError } = await supabase
      .from('products')
      .insert([
        {
          ean: scanResult,
          name: newName,
          price_ht: Number(newPrice),
          category: newCategory,
          current_stock: Number(quantity),
          aire_id: userAireId,
        },
      ])
      .select()
      .single();

    if (prodError) {
      alert('Erreur création produit');
      setLoading(false);
      return;
    }

    await supabase.from('product_stocks').insert([
      {
        product_id: newProd.id,
        quantity: Number(quantity),
        expiry_date: expiryDate,
        aire_id: userAireId,
      },
    ]);

    handleReset();
  }

  // --- NOUVELLE FONCTION VENDU / ABSENT ---
  async function handleMarkAsSold() {
    if (!product || !userAireId) return;
    setLoading(true);

    // 1. On remet le stock global à zéro
    await supabase.from('products').update({ current_stock: 0 }).eq('id', product.id);
    // 2. On vide les lignes de stock (DLC) pour cette aire
    await supabase
      .from('product_stocks')
      .update({ quantity: 0 })
      .eq('product_id', product.id)
      .eq('aire_id', userAireId);

    handleReset();
  }

  async function handleAction(type: 'waste' | 'add' | 'damage') {
    if (!product || !userAireId) return;
    setLoading(true);
    const qtyNum = Number(quantity);

    if (type === 'add') {
      if (!expiryDate) {
        alert('DLC obligatoire !');
        setLoading(false);
        return;
      }

      await supabase.from('product_stocks').insert([
        {
          product_id: product.id,
          quantity: qtyNum,
          expiry_date: expiryDate,
          aire_id: userAireId,
        },
      ]);

      const newTotal = (product.current_stock || 0) + qtyNum;
      await supabase.from('products').update({ current_stock: newTotal }).eq('id', product.id);
    } else {
      const newTotal = Math.max(0, (product.current_stock || 0) - qtyNum);
      await supabase.from('products').update({ current_stock: newTotal }).eq('id', product.id);

      await supabase.from('waste_logs').insert([
        {
          product_id: product.id,
          aire_id: userAireId,
          quantity: qtyNum,
          reason: type === 'damage' ? 'Casse' : 'Périmé',
          cost_loss: product.price_ht * qtyNum,
        },
      ]);
    }
    handleReset();
  }

  const fieldClass =
    'w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pl-12 text-sm outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 text-white';

  return (
    <PageShell>
      <PageHeader title="Scanner" accent="OrbitAire" subtitle="Stocks" icon={ScanLine} />

      <PageBody className="max-w-md mx-auto">
        {!scanResult ? (
          <div className="relative w-full">
            <div
              id="reader"
              className="overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 shadow-xl shadow-cyan-950/10"
            />
            <div className="absolute top-1/2 left-0 w-full h-[2px] bg-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.6)] animate-pulse pointer-events-none" />
          </div>
        ) : (
          <div className="space-y-4 animate-in zoom-in-95 duration-200">
            {isNewProduct ? (
              <Panel className="p-6 border-cyan-500/30">
                <div className="flex flex-col items-center mb-6 text-center">
                  <div className="bg-cyan-500/10 border border-cyan-500/30 p-3 rounded-2xl mb-3 relative text-cyan-400">
                    <PlusCircle size={32} />
                    {isSearchingGlobal && (
                      <div className="absolute -top-1 -right-1 bg-cyan-500 rounded-full p-1 animate-bounce">
                        <Sparkles size={10} className="text-slate-950" />
                      </div>
                    )}
                  </div>
                  <h2
                    className="text-xl font-semibold tracking-tight text-white"
                    style={{ fontFamily: 'var(--font-display), system-ui' }}
                  >
                    {isSearchingGlobal ? 'Analyse mondiale...' : 'Nouveau Produit'}
                  </h2>
                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-[0.2em] mt-2 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                    EAN: {scanResult}
                  </p>
                </div>

                <div className="space-y-5">
                  <div className="space-y-3">
                    <div className="relative">
                      <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={isSearchingGlobal ? 'Récupération IA...' : "Nom de l'article"}
                        className={fieldClass}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative">
                        <Euro className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                        <input
                          type="number"
                          value={newPrice}
                          onChange={(e) => setNewPrice(e.target.value)}
                          placeholder="Prix HT"
                          className={fieldClass}
                        />
                      </div>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 appearance-none text-white font-semibold"
                      >
                        <option value="Boissons">🥤 Boissons</option>
                        <option value="Snacking">🥪 Snacking</option>
                        <option value="Frais">🥗 Frais</option>
                        <option value="Boutique">🛒 Boutique</option>
                        <option value="Zone Café">☕ Zone Café</option>
                        <option value="Tabac/Presse">📰 Tabac</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-cyan-500/5 p-5 rounded-2xl border border-cyan-500/20">
                    <p className="text-[9px] font-semibold text-cyan-400 uppercase mb-4 text-center tracking-[0.2em]">
                      Entrée du premier stock
                    </p>
                    <div className="grid grid-cols-5 gap-3">
                      <div className="col-span-3">
                        <label className="text-[8px] font-semibold text-slate-500 uppercase ml-1 mb-1 block tracking-widest">
                          DLC
                        </label>
                        <div className="relative">
                          <Calendar
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"
                            size={14}
                          />
                          <input
                            type="date"
                            value={expiryDate}
                            onChange={(e) => setExpiryDate(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 pl-9 text-xs color-scheme-dark text-white font-medium outline-none focus:border-cyan-400"
                          />
                        </div>
                      </div>
                      <div className="col-span-2">
                        <label className="text-[8px] font-semibold text-slate-500 uppercase ml-1 mb-1 block tracking-widest text-center">
                          Quantité
                        </label>
                        <div className="relative">
                          <Package
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"
                            size={14}
                          />
                          <input
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 pl-9 text-center font-medium text-xs text-white outline-none focus:border-cyan-400"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <PrimaryButton
                    onClick={handleCreateAndAdd}
                    disabled={loading}
                    className="w-full h-14 text-sm"
                  >
                    {loading ? <RefreshCw className="animate-spin" /> : <Save size={18} />}
                    Valider la création
                  </PrimaryButton>
                  <button
                    onClick={handleReset}
                    className="w-full text-slate-500 text-[10px] font-semibold uppercase py-2 tracking-[0.2em] hover:text-slate-300"
                  >
                    Annuler
                  </button>
                </div>
              </Panel>
            ) : product ? (
              <Panel className="p-6">
                <h2
                  className="text-2xl font-semibold text-center tracking-tight text-white leading-tight"
                  style={{ fontFamily: 'var(--font-display), system-ui' }}
                >
                  {product.name}
                </h2>
                <p className="text-cyan-400 text-center text-[10px] font-semibold uppercase tracking-[0.2em] mb-6">
                  {product.category}
                </p>

                <div className="mt-6 mb-6">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <ListFilter size={12} /> État des lots
                  </p>
                  <div className="space-y-2">
                    {detailedStocks.length > 0 ? (
                      detailedStocks.map((s, i) => (
                        <div
                          key={i}
                          className="flex justify-between items-center bg-slate-950 p-3 rounded-2xl border border-slate-800"
                        >
                          <span className="text-xs font-medium text-slate-400 font-mono">
                            {new Date(s.expiry_date).toLocaleDateString()}
                          </span>
                          <span
                            className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                              i === 0
                                ? 'bg-cyan-500/20 text-cyan-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {s.quantity} pces
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-600 text-center">Aucun lot en stock</p>
                    )}
                  </div>
                </div>

                <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-800 mb-6">
                  <div className="flex items-center justify-between mb-4 gap-4">
                    <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                      <button
                        onClick={() => setQuantity(Math.max(1, Number(quantity) - 1))}
                        className="w-8 h-8 flex items-center justify-center hover:text-cyan-400"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-10 bg-transparent text-center font-semibold outline-none text-sm text-white"
                      />
                      <button
                        onClick={() => setQuantity(Number(quantity) + 1)}
                        className="w-8 h-8 flex items-center justify-center hover:text-cyan-400"
                      >
                        <PlusCircle size={14} />
                      </button>
                    </div>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-[10px] font-medium color-scheme-dark h-10 flex-1 text-white outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <PrimaryButton
                      onClick={() => handleAction('add')}
                      className="w-full h-14 text-[10px]"
                    >
                      Arrivage (Nouveau Stock)
                    </PrimaryButton>

                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={() => handleAction('waste')}
                        className="bg-red-600/90 hover:bg-red-600 h-14 rounded-xl font-semibold uppercase text-[8px] flex flex-col items-center justify-center gap-1 active:scale-95 transition-all text-white"
                      >
                        <RefreshCw size={14} /> Périmé
                      </button>
                      <button
                        onClick={() => handleAction('damage')}
                        className="bg-amber-600/90 hover:bg-amber-600 h-14 rounded-xl font-semibold uppercase text-[8px] flex flex-col items-center justify-center gap-1 active:scale-95 transition-all text-white"
                      >
                        <Hammer size={14} /> Casse
                      </button>
                      <button
                        onClick={handleMarkAsSold}
                        className="bg-emerald-600/90 hover:bg-emerald-600 h-14 rounded-xl font-semibold uppercase text-[8px] flex flex-col items-center justify-center gap-1 active:scale-95 transition-all text-white"
                      >
                        <ShoppingBag size={14} /> Vendu / Absent
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleReset}
                  className="w-full py-2 text-slate-500 font-semibold text-[10px] uppercase tracking-[0.2em] hover:text-white text-center"
                >
                  Scanner un autre article
                </button>
              </Panel>
            ) : (
              <Panel className="flex flex-col items-center justify-center p-20">
                <Loader2 className="animate-spin text-cyan-400 mb-4" size={32} />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  Recherche base mondiale...
                </p>
              </Panel>
            )}
          </div>
        )}
      </PageBody>
    </PageShell>
  );
}
