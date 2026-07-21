// Parsers para "Pedidos especiales":
//   - parseExcelOrder(file)  → lee el .xlsx, devuelve { title, items: [{ name, qty }] }
//   - parsePdfOrder(file)    → lee el .pdf, devuelve { title, items: [{ ref, qty, raw }] }
//   - resolveOrder(parsed, products) → casa cada item con un producto del catálogo
//
// Estrategia:
//   - El Excel del cliente NO trae referencia. Casamos por nombre con un score
//     tipo Jaccard sobre tokens normalizados.
//   - El PDF SÍ trae referencia (formato 2 dígitos + 2 letras + 3 dígitos, igual
//     que en `products.ref`). Algunas líneas son refs no comerciales (IVA, cajas,
//     regalos): si no aparecen en el catálogo se marcan como "no encontradas".

import * as XLSX from 'xlsx';
// Vite resuelve este import a la URL del worker como recurso estático.
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Formato de referencia obligatorio en el catálogo
const REF_RE = /\b[0-9]{2}[A-Z]{2}[0-9]{3}\b/g;

// Quita tildes, baja a minúsculas y deja solo letras/números/espacios.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Palabras muy genéricas que no aportan a la coincidencia (las quitamos del
// score para no inflar el Jaccard con "de", "la", etc).
const STOPWORDS = new Set([
  'de','del','la','las','el','los','en','con','y','o','a','para','sin',
  'al','un','una','por','su','sus',
  'grs','grms','grams','gr','gram','grms.','grms,', 'g',
  'kgs','kg','kg.','kgs.', 'kilos','kilo',
  'ml','ml.', 'cl','cl.','l','l.','lts','lt','lts.','lt.',
  'und','unds','unidad','unidades','botella','botellas','tarro','tarros',
  'caja','cajas','lata','latas','frasco','frascos','bolsa','bolsas',
  'estuche','estuches','paquete','paquetes','pieza','piezas',
  'aprox','aprox.','cm','cm.','mm','mm.',
]);

function tokens(s) {
  const all = norm(s).split(' ').filter(Boolean);
  return all.filter(t => !STOPWORDS.has(t) && t.length > 1);
}

function similarity(aTok, bTok) {
  if (!aTok.length || !bTok.length) return 0;
  const a = new Set(aTok);
  const b = new Set(bTok);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  if (!inter) return 0;
  // Combinamos Jaccard y coeficiente de solape (overlap). El overlap evita
  // penalizar a productos del catálogo con el nombre corto frente a queries
  // muy descriptivas; el Jaccard frena los falsos positivos cuando las
  // intersecciones son pocas en términos absolutos.
  const union = a.size + b.size - inter;
  const jaccard = inter / union;
  const overlap = inter / Math.min(a.size, b.size);
  return Math.max(jaccard, overlap * 0.8 + jaccard * 0.2);
}

// ============================================================================
// EXCEL
// ============================================================================
// Los Excels del cliente llevan el código RP (formato 00XX000) en alguna
// columna, pero el orden cambia según la plantilla. Dos formatos vistos:
//   · "Datos":  A=Cant.  B=Componente(RP)  C=Concepto(descr.)
//   · "Hoja1":  A=REF(RP) B=Descripción    C=Cantidad
//
// Por eso NO asumimos posiciones: detectamos automáticamente la columna de RP
// (la que más celdas con formato 00XX000 tiene), la de cantidad y la de
// descripción. Casamos por referencia exacta (fiable); si un Excel viniera sin
// ninguna columna de RP, caemos al modo antiguo de coincidencia por nombre.
//
// El nombre del lote NO sale del Excel (sus cabeceras son etiquetas de columna,
// no títulos): lo pone el modal a partir del nombre del fichero.
//
// Devolvemos { title:'', items: [{ ref?, name?, qty }] }
const REF_CELL_RE = /^[0-9]{2}[A-Z]{2}[0-9]{3}$/;
const HEADER_QTY  = /cantidad|cant|uds|unid|qty|umf/i;
const HEADER_DESC = /desc|concepto|articul|art\b|componente|producto|nombre/i;

export async function parseExcelOrder(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  if (!rows.length) throw new Error('El Excel está vacío.');
  const maxCols = rows.reduce((m, r) => Math.max(m, r ? r.length : 0), 0);

  // 1. Columna de referencias RP: la que más celdas con formato 00XX000 tenga.
  let refCol = -1, refHits = 0;
  for (let c = 0; c < maxCols; c++) {
    let hits = 0;
    for (const r of rows) {
      const v = r && r[c] != null ? String(r[c]).trim().toUpperCase() : '';
      if (REF_CELL_RE.test(v)) hits++;
    }
    if (hits > refHits) { refHits = hits; refCol = c; }
  }

  // Sin columna de RP → modo antiguo: col A = nombre, col B = cantidad.
  if (refCol < 0 || refHits === 0) {
    const items = [];
    const start = /cantidad|cant\b|qty|unidades/i.test(String(rows[0]?.[1] || '')) ? 1 : 0;
    for (let i = start; i < rows.length; i++) {
      const name = rows[i]?.[0] ? String(rows[i][0]).trim() : '';
      if (!name) continue;
      const qty = Math.max(1, Math.round(Number(rows[i][1]) || 1));
      items.push({ name, qty });
    }
    return { title: '', items };
  }

  // 2. Fila de cabecera: primera fila cuyo refCol NO es una RP (son etiquetas).
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i]?.[refCol] != null ? String(rows[i][refCol]).trim().toUpperCase() : '';
    if (!REF_CELL_RE.test(v) && rows[i]?.some(c => c != null && String(c).trim())) { headerRow = i; break; }
  }
  const hdr = headerRow >= 0 ? rows[headerRow].map(c => String(c ?? '')) : [];

  // 3. Columna de cantidad: por etiqueta de cabecera; si no, la de enteros pequeños.
  let qtyCol = -1;
  for (let c = 0; c < maxCols; c++) {
    if (c !== refCol && HEADER_QTY.test(hdr[c] || '')) { qtyCol = c; break; }
  }
  if (qtyCol < 0) {
    let bestInt = 0;
    for (let c = 0; c < maxCols; c++) {
      if (c === refCol) continue;
      let ints = 0;
      for (let i = 0; i < rows.length; i++) {
        if (i === headerRow) continue;
        const n = Number(rows[i]?.[c]);
        if (Number.isInteger(n) && n >= 1 && n <= 99) ints++;
      }
      if (ints > bestInt) { bestInt = ints; qtyCol = c; }
    }
  }

  // 4. Columna de descripción: por etiqueta; si no, la de texto más largo restante.
  let descCol = -1;
  for (let c = 0; c < maxCols; c++) {
    if (c !== refCol && c !== qtyCol && HEADER_DESC.test(hdr[c] || '')) { descCol = c; break; }
  }
  if (descCol < 0) {
    let bestLen = 0;
    for (let c = 0; c < maxCols; c++) {
      if (c === refCol || c === qtyCol) continue;
      let len = 0, n = 0;
      for (let i = 0; i < rows.length; i++) {
        if (i === headerRow) continue;
        const s = rows[i]?.[c] != null ? String(rows[i][c]).trim() : '';
        if (s) { len += s.length; n++; }
      }
      const avg = n ? len / n : 0;
      if (avg > bestLen) { bestLen = avg; descCol = c; }
    }
  }

  const items = [];
  for (let i = 0; i < rows.length; i++) {
    if (i === headerRow) continue;
    const r = rows[i];
    if (!r) continue;
    const refVal = r[refCol] != null ? String(r[refCol]).trim().toUpperCase() : '';
    const name = descCol >= 0 && r[descCol] != null ? String(r[descCol]).trim() : '';
    const qty = Math.max(1, Math.round(Number(qtyCol >= 0 ? r[qtyCol] : 1) || 1));
    if (REF_CELL_RE.test(refVal)) items.push({ ref: refVal, qty, name });
    else if (name) items.push({ qty, name }); // fila sin RP (caja/estuche): reserva por nombre
  }

  return { title: '', items };
}

// ============================================================================
// PDF
// ============================================================================
// Extrae todo el texto del PDF, identifica:
//   - Nombre del cliente / lote (para sugerir título del bodegón)
//   - Lista de referencias (formato `ref_format`)
//
// PDFs probados (Lotes de España "PRESUPUESTO"):
//   - El bloque del cliente empieza con `PRESUPUESTO:` y la siguiente línea
//     suele ser "NNNN - NOMBRE DEL CLIENTE".
//   - La línea `LOTE ESP. ALTADIA-X ( NOMBRE )` da el nombre del lote.
//   - Las refs aparecen en el bloque de COMPOSICIÓN como tokens sueltos.
export async function parsePdfOrder(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  // Concatenamos el texto manteniendo saltos cuando cambia la Y.
  let fullText = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let lastY = null;
    for (const it of content.items) {
      const y = it.transform ? Math.round(it.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) fullText += '\n';
      else fullText += ' ';
      fullText += it.str || '';
      lastY = y;
    }
    fullText += '\n';
  }

  // Nombre del cliente: línea "NNNN - NOMBRE" tras "PRESUPUESTO:".
  // Caemos atrás a buscar la primera línea con ese formato si no se encuentra.
  let cliente = '';
  const presup = fullText.match(/PRESUPUESTO:?\s*\n?\s*(\d{2,6}\s*-\s*[^\n]+)/i);
  if (presup) cliente = presup[1].trim();
  if (!cliente) {
    const any = fullText.match(/^\s*\d{2,6}\s*-\s*[A-ZÁÉÍÓÚÑÇ][^\n]{3,}$/m);
    if (any) cliente = any[0].trim();
  }
  // Limpia el código numérico inicial: "2124 - ITACA, S.A.U. -INNOV..." → "ITACA, S.A.U. -INNOV..."
  let clienteShort = cliente;
  const dash = cliente.indexOf(' - ');
  if (dash >= 0) clienteShort = cliente.slice(dash + 3).trim();
  // Recorta tras el primer ',' o '-' largo para tener algo manejable.
  if (clienteShort.length > 60) clienteShort = clienteShort.split(/[,]/)[0].trim();

  // Nombre del lote: "LOTE ESP. ALTADIA-X ( NOMBRE )" o similar.
  let lote = '';
  const loteMatch = fullText.match(/LOTE[^\n]*?\(\s*([^)]+?)\s*\)/i);
  if (loteMatch) lote = loteMatch[1].trim();
  // Variante: a veces aparece "ALTADIA-3 ( GOURMET )" como referencia del producto cabecera.
  if (!lote) {
    const alt = fullText.match(/[A-Z]{3,}-\d+\s*\(\s*([^)]+?)\s*\)/);
    if (alt) lote = alt[1].trim();
  }

  // Título sugerido: combina cliente + lote cuando hay ambos.
  let title = '';
  if (clienteShort && lote) title = `${clienteShort} — ${lote}`;
  else title = clienteShort || lote || '';

  // Extracción de referencias: regex global. Importante: deduplicamos por ref,
  // sumando cantidades cuando una ref aparece varias veces.
  const matches = fullText.match(REF_RE) || [];
  const counts = new Map();
  for (const m of matches) counts.set(m, (counts.get(m) || 0) + 1);

  const items = [];
  for (const [ref, qty] of counts) {
    items.push({ ref, qty, raw: '' });
  }

  return { title, items, rawText: fullText, cliente, lote };
}

// ============================================================================
// RESOLUCIÓN contra el catálogo
// ============================================================================
// Devuelve:
//   matched: [{ sku, name, qty, source: 'ref' | 'name', score, original }]
//   unmatched: [{ original, reason }]
//
// `original` mantiene el dato crudo del fichero para que el modal pueda
// mostrarlo en la lista de "no encontrados".
export function resolveOrder(parsed, products) {
  const matched = [];
  const unmatched = [];

  // Pre-tokenizamos productos una vez. Incluimos también la descripción
  // libre (`desc`) y la categoría: en muchos catálogos el nombre es corto
  // ("AOVE NOS Everyday") y la descripción completa la información que
  // luego aparece en el Excel del cliente.
  const productIndex = (products || []).map(p => ({
    p,
    tokens: tokens([
      p.name,
      p.brand || '',
      p.desc || '',
      p.descripcion_visual || '',
    ].join(' ')),
  }));

  for (const it of parsed.items || []) {
    if (it.ref) {
      const found = (products || []).find(p => p.sku === it.ref);
      if (found) {
        matched.push({
          sku: found.sku,
          name: found.name,
          qty: it.qty || 1,
          source: 'ref',
          score: 1,
          original: { ref: it.ref },
        });
      } else {
        unmatched.push({
          original: { ref: it.ref, name: it.name || it.raw || '' },
          reason: 'Referencia no encontrada en el catálogo.',
        });
      }
      continue;
    }

    // Match por nombre
    const queryTokens = tokens(it.name);
    if (!queryTokens.length) {
      unmatched.push({ original: { name: it.name }, reason: 'Nombre vacío o no descifrable.' });
      continue;
    }

    let best = null;
    let bestScore = 0;
    for (const { p, tokens: pt } of productIndex) {
      const s = similarity(queryTokens, pt);
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }

    // Umbral: 0.5 es bastante conservador con la fórmula híbrida (Jaccard +
    // overlap). Funciona bien con nombres reales que incluyen marca.
    if (best && bestScore >= 0.5) {
      matched.push({
        sku: best.sku,
        name: best.name,
        qty: it.qty || 1,
        source: 'name',
        score: Math.round(bestScore * 100) / 100,
        original: { name: it.name },
      });
    } else {
      unmatched.push({
        original: { name: it.name },
        reason: 'Referencia no encontrada en el catálogo.',
      });
    }
  }

  return { matched, unmatched };
}
