import * as XLSX from 'xlsx';

export type ParsedStockRow = {
  line: number;
  ean: string;
  quantity: number;
  expiryDate: string;
  name?: string;
  priceHt?: number;
  category?: string;
};

export type StockImportColumn = 'ean' | 'quantity' | 'expiryDate' | 'name' | 'priceHt' | 'category';

export type ParseIssue = { line: number; message: string };

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function slugHeader(h: string): string {
  return stripAccents(h.toString().trim().toLowerCase())
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const EAN_SLUGS = new Set([
  'ean',
  'gtin',
  'code_barres',
  'codebarres',
  'code_barre',
  'barcode',
]);

const QTY_SLUGS = new Set([
  'quantite',
  'quantity',
  'qty',
  'stock',
  'qte',
  'nombre',
]);

const DLC_SLUGS = new Set([
  'dlc',
  'date_peremption',
  'date_de_peremption',
  'peremption',
  'expiry',
  'expiration',
  'date_limite',
  'dluo',
]);

const NAME_SLUGS = new Set(['nom', 'name', 'produit', 'designation', 'libelle', 'libelle_produit']);

const PRICE_SLUGS = new Set(['prix', 'price_ht', 'priceht', 'price', 'prix_ht', 'prixht']);

const CAT_SLUGS = new Set(['categorie', 'category', 'type', 'famille']);

function classifyHeader(slug: string): StockImportColumn | null {
  if (EAN_SLUGS.has(slug) || slug.includes('code_bar')) return 'ean';
  if (QTY_SLUGS.has(slug)) return 'quantity';
  if (DLC_SLUGS.has(slug)) return 'expiryDate';
  if (NAME_SLUGS.has(slug)) return 'name';
  if (PRICE_SLUGS.has(slug)) return 'priceHt';
  if (CAT_SLUGS.has(slug)) return 'category';
  return null;
}

/** Retourne l’index de colonne pour chaque champ sémantique */
export function mapHeaderRow(headerRow: unknown[]): Map<StockImportColumn, number> {
  const fieldToIndex = new Map<StockImportColumn, number>();
  headerRow.forEach((cell, idx) => {
    const slug = slugHeader(String(cell ?? ''));
    if (!slug) return;
    const field = classifyHeader(slug);
    if (field && !fieldToIndex.has(field)) fieldToIndex.set(field, idx);
  });
  return fieldToIndex;
}

export function normalizeEan(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value));
  }
  let s = String(value).trim().replace(/\s+/g, '');
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s.length ? s : null;
}

export function parseQuantity(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseExpiry(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) return formatDateISO(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const utc = new Date((value - 25569) * 86400 * 1000);
    if (!isNaN(utc.getTime())) return formatDateISO(utc);
  }
  const s = String(value).trim();
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(s);
  if (iso) return iso[0];
  const fr = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(s);
  if (fr) {
    const dd = fr[1].padStart(2, '0');
    const mm = fr[2].padStart(2, '0');
    const yyyy = fr[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

export function parseWorksheetToRows(
  buffer: ArrayBuffer,
  defaultExpiry: string | null
): { rows: ParsedStockRow[]; issues: ParseIssue[]; headerError: string | null } {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], issues: [], headerError: 'Fichier vide ou sans feuille.' };
  }
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
  if (!matrix.length) {
    return { rows: [], issues: [], headerError: 'Aucune ligne dans la feuille.' };
  }

  const headerRow = matrix[0];
  const colMap = mapHeaderRow(headerRow);
  if (!colMap.has('ean') || !colMap.has('quantity')) {
    return {
      rows: [],
      issues: [],
      headerError:
        'Colonnes obligatoires manquantes : au moins un en-tête EAN (ean, code_barres, gtin…) et quantité (quantite, qty, stock…).',
    };
  }

  const rows: ParsedStockRow[] = [];
  const issues: ParseIssue[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const line = i + 1;
    const lineArr = matrix[i] as unknown[];
    if (!lineArr || lineArr.every((c) => c === '' || c == null)) continue;

    const eanIdx = colMap.get('ean')!;
    const qtyIdx = colMap.get('quantity')!;
    const ean = normalizeEan(lineArr[eanIdx]);
    const qty = parseQuantity(lineArr[qtyIdx]);

    const dlcIdx = colMap.get('expiryDate');
    let expiry = dlcIdx !== undefined ? parseExpiry(lineArr[dlcIdx]) : null;
    if (!expiry && defaultExpiry) expiry = defaultExpiry;

    const nameIdx = colMap.get('name');
    const priceIdx = colMap.get('priceHt');
    const catIdx = colMap.get('category');
    const name = nameIdx !== undefined && lineArr[nameIdx] ? String(lineArr[nameIdx]).trim() : undefined;
    let priceHt: number | undefined;
    if (priceIdx !== undefined && lineArr[priceIdx] !== '' && lineArr[priceIdx] != null) {
      const p = typeof lineArr[priceIdx] === 'number' ? lineArr[priceIdx] : Number(String(lineArr[priceIdx]).replace(',', '.'));
      if (Number.isFinite(p) && p >= 0) priceHt = p;
    }
    const category =
      catIdx !== undefined && lineArr[catIdx] ? String(lineArr[catIdx]).trim() : undefined;

    if (!ean) {
      issues.push({ line, message: 'EAN / code-barres manquant ou invalide.' });
      continue;
    }
    if (qty == null || qty <= 0) {
      issues.push({ line, message: 'Quantité manquante ou nulle.' });
      continue;
    }
    if (!expiry) {
      issues.push({ line, message: 'DLC manquante (colonne ou date par défaut requise).' });
      continue;
    }

    rows.push({
      line,
      ean,
      quantity: qty,
      expiryDate: expiry,
      name,
      priceHt,
      category,
    });
  }

  return { rows, issues, headerError: null };
}

export function buildTemplateWorkbook(): ArrayBuffer {
  const headers = [
    'ean',
    'quantite',
    'dlc',
    'nom',
    'prix_ht',
    'categorie',
  ];
  const example = ['3309840801008', '24', '2026-12-31', 'Exemple produit', '1.20', 'Boissons'];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
