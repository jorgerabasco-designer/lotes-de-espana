// Generación de PDFs para la sección "Web".
//
//   · PDF de ETIQUETAS TRASERAS de un lote:
//       - Cabecera con logo y "Lote #NNN — Etiquetas traseras"
//       - Rejilla 2 columnas × 3 filas por página (6 etiquetas por A4)
//       - Cada celda respeta el aspect ratio real de la etiqueta y añade
//         el RP como pie de la celda. Se evita cualquier solape.
//       - Si la etiqueta subida es PDF, se renderiza a canvas con pdf.js.
//
//   · PDF de DESCRIPCIÓN de un lote:
//       - Cabecera con logo y "Lote de Navidad surtido NNN".
//       - Foto del lote (~40% de la altura útil).
//       - Debajo, lista con "N UDS.  DESCRIPCIÓN" resaltando la marca.

import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ---------- helpers ----------

// Calidad JPEG para las imágenes embebidas en el PDF. 0.95 mantiene la nitidez
// original de las fotos (el cliente lo pidió expresamente: "que no tocamos la
// calidad de las imágenes, siempre alta aunque el PDF pese más").
const JPEG_QUALITY = 0.95;

// Máximo de píxeles a lo largo del lado más grande de una imagen embebida.
// Solo se redimensionan imágenes descomunales; una foto 700×800 (o cualquier
// otra por debajo de 2500 px) pasa tal cual sin perder calidad.
const MAX_LONG_SIDE = 2500;

// Toma un canvas y devuelve un {canvas, dataUrl, width, height} con la imagen
// redimensionada si supera MAX_LONG_SIDE. Preserva el aspect ratio.
function encodeCanvas(canvas) {
  const w = canvas.width, h = canvas.height;
  const longSide = Math.max(w, h);
  if (longSide > MAX_LONG_SIDE) {
    const scale = MAX_LONG_SIDE / longSide;
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);
    const out = document.createElement('canvas');
    out.width = dw; out.height = dh;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, dw, dh);
    return { dataUrl: out.toDataURL('image/jpeg', JPEG_QUALITY), width: dw, height: dh };
  }
  return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width: w, height: h };
}

// Descarga una imagen/PDF de una URL, devuelve un objeto con:
//   { type: 'image'|'pdf'|null, dataUrl, width, height }
// Para PDF renderiza la primera página a un canvas.
async function fetchAsRenderable(url) {
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  const ct = (blob.type || '').toLowerCase();

  if (ct.includes('pdf') || /\.pdf(\?|$)/i.test(url)) {
    // Render primera página del PDF a canvas
    const buf = await blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const enc = encodeCanvas(canvas);
    return { type: 'pdf', dataUrl: enc.dataUrl, width: enc.width, height: enc.height };
  }
  // Imagen normal → carga en un Image para saber dimensiones
  return await new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const enc = encodeCanvas(canvas);
      URL.revokeObjectURL(objectUrl);
      resolve({ type: 'image', dataUrl: enc.dataUrl, width: enc.width, height: enc.height });
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
    img.src = objectUrl;
  });
}

// Devuelve el logo como { dataUrl, width, height } para poder respetar su
// aspect ratio al pintarlo. null si no se puede cargar.
async function fetchLogoRenderable() {
  try {
    const r = await fetchAsRenderable('/logo.png');
    return r || null;
  } catch { return null; }
}
// Compat: algunos callers viejos usaban solo el data-url.
async function fetchLogoDataUrl() {
  const r = await fetchLogoRenderable();
  return r?.dataUrl || null;
}

// Banda decorativa que va como header full-width en el PDF de descripción.
// Dos variantes servidas desde /public:
//   · pdf-header.jpg         → CON logo (para el QR con precio)
//   · pdf-header-nologo.jpg  → SIN logo (para el QR sin precio)
// Cacheamos el data-url tras la 1ª carga de cada una para no re-decodificar.
//
// El "?v=<APP_LOAD_ID>" fuerza un cache-bust cada vez que se carga la app: si
// actualizamos la imagen en public/, el próximo usuario que abra la web (sin
// hard refresh) bajará la nueva versión sí o sí. Dentro de la misma sesión el
// data-url se cachea en memoria, así que solo se baja una vez por carga.
const APP_LOAD_ID = Date.now();
const _headerCache = { 'con-precio': null, 'sin-precio': null };
async function fetchHeaderBandRenderable(variant = 'con-precio') {
  if (_headerCache[variant] !== null) return _headerCache[variant] || null;
  const path = variant === 'sin-precio' ? '/pdf-header-nologo.jpg' : '/pdf-header.jpg';
  const file = `${path}?v=${APP_LOAD_ID}`;
  try {
    const r = await fetchAsRenderable(file);
    if (r) { _headerCache[variant] = r; return r; }
    // Fallback: si la variante "sin-logo" no existe todavía, cae a la normal.
    if (variant === 'sin-precio') {
      const r2 = await fetchAsRenderable(`/pdf-header.jpg?v=${APP_LOAD_ID}`);
      _headerCache[variant] = r2 || false;
      return r2;
    }
    _headerCache[variant] = false;
    return null;
  } catch {
    _headerCache[variant] = false;
    return null;
  }
}

// ---------- PDF de ETIQUETAS TRASERAS ----------
//
// productos: [{ ref, uds, url, descripcion }]
// Devuelve { blob, missing } donde `missing` es la lista de {ref, uds, descripcion}
// de los productos que no tienen etiqueta subida.
// Los productos sin etiqueta NO se meten en el PDF — el UI los muestra aparte.
//
// Layout: rejilla 2×2 → 4 etiquetas por página, para que se vean grandes y se
// puedan leer. Logo con proporción real (aspect ratio original preservado).
// Cada celda tiene un titulillo con el nombre corto del producto (extraído de
// la descripción, no el RP).
export async function generateEtiquetasPDF({ loteNumero, productos }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const W = 210, H = 297;
  const marginX = 12;

  // Cabecera: título grande "Lote NNN" con el logo proporcionado a la izquierda.
  const logo = await fetchLogoRenderable();
  const logoTargetH = 14;
  let logoW = 14;
  if (logo?.dataUrl) {
    const ratio = (logo.width || 1) / (logo.height || 1);
    logoW = logoTargetH * ratio;
    try { doc.addImage(logo.dataUrl, 'JPEG', marginX, 8, logoW, logoTargetH); }
    catch { logoW = 14; }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(45, 42, 38);
  const titleX = marginX + logoW + 6;
  doc.text(`Lote ${loteNumero}`, titleX, 20);

  // ---- Rejilla 2 × 2 (4 etiquetas por página) ----
  const cols = 2, rows = 2;
  const gapX = 8, gapY = 12;
  const gridTop = 30;
  const gridH = H - gridTop - 14;
  const cellW = (W - marginX * 2 - gapX * (cols - 1)) / cols;
  const cellH = (gridH - gapY * (rows - 1)) / rows;
  // Alto del titulillo de cada celda
  const cellTitleH = 6;
  const imgAreaH = cellH - cellTitleH;

  const withUrl  = productos.filter(p => p.url);
  const missing  = productos
    .filter(p => !p.url)
    .map(p => ({ ref: p.ref, uds: p.uds, descripcion: p.descripcion }));

  for (let i = 0; i < withUrl.length; i++) {
    if (i > 0 && i % (cols * rows) === 0) doc.addPage();
    const idxInPage = i % (cols * rows);
    const col = idxInPage % cols;
    const row = Math.floor(idxInPage / cols);
    const cellX = marginX + col * (cellW + gapX);
    const cellY = gridTop + row * (cellH + gapY);

    const p = withUrl[i];
    // Titulillo: nombre corto del producto (nombre + marca), NO el RP.
    const label = shortProductLabel(p.descripcion, p.runs);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(45, 42, 38);
    const lines = doc.splitTextToSize(label, cellW - 12);
    // Máximo 1 línea para que quede compacto.
    doc.text(lines[0] || `Ref. ${p.ref}`, cellX, cellY + 4);
    if (p.uds && p.uds !== 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(120, 115, 105);
      doc.text(`×${p.uds}`, cellX + cellW, cellY + 4, { align: 'right' });
    }

    // Imagen: ocupa (casi) toda la celda por debajo del titulillo.
    const imgAreaY = cellY + cellTitleH;
    const rendered = await fetchAsRenderable(p.url);
    if (rendered) {
      const ratio = rendered.width / rendered.height;
      let drawW = cellW, drawH = cellW / ratio;
      if (drawH > imgAreaH) { drawH = imgAreaH; drawW = imgAreaH * ratio; }
      const drawX = cellX + (cellW - drawW) / 2;
      const drawY = imgAreaY + (imgAreaH - drawH) / 2;
      try {
        doc.addImage(rendered.dataUrl, 'JPEG', drawX, drawY, drawW, drawH);
      } catch {
        doc.setDrawColor(230); doc.setFillColor(245);
        doc.rect(cellX, imgAreaY, cellW, imgAreaH, 'FD');
        doc.setFontSize(8); doc.setTextColor(150);
        doc.text('No se pudo renderizar', cellX + 2, imgAreaY + 6);
      }
    }
  }

  // NADA de página final con productos sin etiqueta — se avisa desde el UI.
  return { blob: doc.output('blob'), missing };
}

// Título del bloque de una etiqueta trasera en el PDF (2×2).
//
// Estrategia (por orden de preferencia):
//   1. Si tenemos `runs` del Excel: coger TODOS los runs con bold=true, en el
//      orden en que aparecen. Ese es el nombre que Jorge quiere ("las palabras
//      que son marcas en mayúsculas que están en negrita").
//   2. Fallback sin rich text: coger la marca detectada por regex (secuencias
//      de MAYÚSCULAS que empiecen por letra, no dígito).
//   3. Fallback total: primeras 4 palabras de la descripción.
function shortProductLabel(descripcion, runs) {
  // --- 1. Runs del Excel ---
  if (Array.isArray(runs) && runs.length) {
    const boldTexts = runs
      .filter(r => r.bold && String(r.text).trim().length >= 2)
      .map(r => String(r.text).trim());
    if (boldTexts.length) {
      // Concatenar respetando el orden. Ej: "MUCHAS MANOS" ya viene como un
      // run bold único; si hubiera 2 marcas bold separadas por texto normal
      // (raro), las unimos con " · " para mantener las dos visibles.
      const brand = boldTexts.join(' · ');
      return brand.length > 30 ? brand.slice(0, 28) + '…' : brand;
    }
  }
  // --- 2. Regex de MAYÚSCULAS ---
  const d = String(descripcion || '').trim();
  if (!d) return 'Producto';
  const clean = d.replace(/^\s*\d+\s+/, '');
  const candRe = /(?:^|[^A-ZÁÉÍÓÚÜÑ])([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ0-9´'.-]{1,}(?:\s+[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ0-9´'.-]*){0,4})/g;
  const candidates = [];
  let m;
  while ((m = candRe.exec(clean))) candidates.push(m[1].trim());
  if (candidates.length) {
    candidates.sort((a, b) => alphaChars(b) - alphaChars(a));
    const brand = candidates[0];
    return brand.length > 30 ? brand.slice(0, 28) + '…' : brand;
  }
  // --- 3. Últimos recursos ---
  const words = clean.split(/\s+/).slice(0, 4).join(' ');
  return words.length > 40 ? words.slice(0, 38) + '…' : words;
}
function alphaChars(s) { return (s.match(/[A-ZÁÉÍÓÚÜÑ]/g) || []).length; }

// ---------- PDF de DESCRIPCIÓN ----------

// PDF del QR — replica el formato oficial de Lotes de España:
//   · Logo verde de cabecera (assets/qr-header.png si existe, o texto placeholder)
//   · Foto grande del lote centrada
//   · Título "TIPO - REF. NNN" (mayúsculas, negrita) a la izquierda + precio a la derecha
//   · Bullets "N producto DESCRIPCIÓN con marca en negrita"
//   · Pie legal en cursiva pequeña (viene del docx que subió Jorge)
//
// Parámetros:
//   loteNumero:    "223"
//   tipoLote:      "LOTES SURTIDOS"           (viene del prefijo de la nomenclatura)
//   loteFotoUrl:   URL de la foto del lote (bucket 'lotes')
//   productos:     [{ uds, descripcion }]
//   precio:        número o null              (si null → PDF "sin precio")
//   pieLegal:      string (footer)
//   headerVariant: 'con-precio' (por defecto) → banda decorativa con logo
//                  'sin-precio'               → banda decorativa SIN logo
export async function generateDescripcionPDF({
  loteNumero,
  tipoLote,
  loteFotoUrl,
  productos,
  precio = null,
  pieLegal = '',
  headerVariant = 'con-precio',
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const W = 210, H = 297;
  const marginX = 15;

  const INK   = [45, 42, 38];
  const MUTED = [120, 115, 105];
  const GREEN = [64, 116, 66];  // verde del branding "lotesdeespana"

  // ---------- BANDA DECORATIVA (imagen full-width en la parte superior) ----------
  const band = await fetchHeaderBandRenderable(headerVariant);
  let headerH = 28;
  if (band) {
    const ratio = band.width / band.height;
    headerH = W / ratio;
    try { doc.addImage(band.dataUrl, 'JPEG', 0, 0, W, headerH); }
    catch { headerH = 28; }
  } else {
    // Fallback si la imagen no está disponible
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, W, 28, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text('lotesdeespana', W / 2, 18, { align: 'center' });
  }

  let y = headerH + 8;

  // ---------- FOTO DEL LOTE (respetando proporción original) ----------
  // Reglas:
  //   · Contain dentro de (maxW × maxH). Nunca distorsionar.
  //   · Si el "contain" natural deja la foto demasiado estrecha (típico de
  //     fotos verticales o cuadradas 700×800), forzamos un ancho mínimo y
  //     dejamos crecer el alto — con un tope duro para no comernos el papel.
  //   · Así el 802 (foto cuadrada) usa un tamaño parecido al 513 (horizontal).
  if (loteFotoUrl) {
    const rendered = await fetchAsRenderable(loteFotoUrl);
    if (rendered) {
      const maxW    = W - marginX * 2;   // ~180 mm de ancho útil
      const maxH    = 95;                // caja "normal" (fotos horizontales)
      const minW    = 130;               // ancho mínimo si la foto es cuadrada/vertical
      const maxH_abs = 125;              // tope duro de alto (foto muy vertical)
      const ratio = rendered.width / rendered.height;

      let drawW = maxW;
      let drawH = drawW / ratio;
      if (drawH > maxH) {
        // Contain estándar
        drawH = maxH;
        drawW = drawH * ratio;
        // Si al contener por alto la foto se hace demasiado estrecha,
        // ampliamos ancho al mínimo (con cap absoluto de altura).
        if (drawW < minW) {
          drawW = minW;
          drawH = drawW / ratio;
          if (drawH > maxH_abs) {
            drawH = maxH_abs;
            drawW = drawH * ratio;
          }
        }
      }
      const drawX = (W - drawW) / 2;
      try {
        doc.addImage(rendered.dataUrl, 'JPEG', drawX, y, drawW, drawH);
        y += drawH + 6;
      } catch {}
    }
  }

  // ---------- TÍTULO + PRECIO ----------
  const titulo = `${(tipoLote || 'LOTE').toUpperCase()} - REF. ${loteNumero}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(...INK);
  doc.text(titulo, marginX, y);
  if (precio != null && !isNaN(precio)) {
    const precioStr = `${Number(precio).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€ + IVA`;
    doc.text(precioStr, W - marginX, y, { align: 'right' });
  }
  y += 4;

  // Línea gruesa separadora
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.8);
  doc.line(marginX, y, W - marginX, y);
  doc.setLineWidth(0.2);
  y += 6;

  // ---------- LISTADO DE PRODUCTOS ----------
  // Sin bullet: solo nº de unidades + descripción.
  const udsX    = marginX;
  const udsMaxW = 6;
  const descX   = udsX + udsMaxW + 1.5;
  const descMaxW = W - marginX - descX;
  const bodyStartY = y;
  const bodyMaxY = H - 25; // deja espacio abajo para línea + pie legal

  // Cada producto trae `runs` desde el Excel (rich text bold parcial). Para el
  // wrapping tokenizamos a nivel de palabra respetando el weight de cada palabra.
  const productWords = productos.map(p => runsToWords(p.runs, p.descripcion));

  // Shrink-to-fit: probamos tamaños de letra hasta que todo quepa en 1 página.
  const FS_MAX = 10.5, FS_MIN = 6.5, FS_STEP = 0.25;
  let chosenSize = FS_MIN;
  for (let fs = FS_MAX; fs >= FS_MIN - 0.001; fs -= FS_STEP) {
    doc.setFontSize(fs);
    const lineH = fs * 0.48;
    let totalLines = 0;
    for (const words of productWords) {
      totalLines += countWrappedLines(doc, words, descMaxW);
    }
    if (bodyStartY + totalLines * lineH <= bodyMaxY) {
      chosenSize = fs;
      break;
    }
    chosenSize = fs;
  }
  const lineH = chosenSize * 0.48;
  doc.setFontSize(chosenSize);

  for (let pi = 0; pi < productos.length; pi++) {
    const p = productos[pi];
    const words = productWords[pi];

    // Nº de unidades (fila de arranque)
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...INK);
    doc.text(`${p.uds || 1}`, udsX, y);

    // Descripción con bold parcial exacto al del Excel (runs). Devuelve el
    // nuevo y tras pintar todas las líneas de este producto.
    y = renderWordsWrapped(doc, words, descX, y, descMaxW, lineH);
  }

  // Línea gruesa antes del pie legal
  y += 2;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.8);
  doc.line(marginX, y, W - marginX, y);
  doc.setLineWidth(0.2);

  // ---------- PIE LEGAL (última página, cursiva pequeña) ----------
  if (pieLegal) {
    const pageCount = doc.internal.getNumberOfPages();
    doc.setPage(pageCount);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const pieLines = doc.splitTextToSize(pieLegal, W - marginX * 2);
    let py = H - 12 - (pieLines.length - 1) * 3.2;
    for (const line of pieLines) {
      doc.text(line, W / 2, py, { align: 'center' });
      py += 3.2;
    }
  }

  return doc.output('blob');
}

// Pinta una línea de texto alternando entre 'normal' y 'bold' según detecte
// secuencias de MAYÚSCULAS (marcas comerciales). Respeta la fuente y tamaño
// que ya estén activos en el documento; solo cambia el weight.
//
// Ejemplo: "1 Cava Brut FREIXENET Botella 75 Cl." →
//   "1 Cava Brut " (normal) + "FREIXENET" (bold) + " Botella 75 Cl." (normal)
//
// La marca debe empezar por letra mayúscula (no dígito) para no cazar cosas
// como "100%".
function renderMixedBoldLine(doc, line, x, y) {
  const re = /([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ0-9´'.-]*(?:\s+[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ0-9´'.-]*)*)/g;
  let cursor = 0, tx = x, m;
  const parts = [];
  while ((m = re.exec(line))) {
    if (m.index > cursor) parts.push({ text: line.slice(cursor, m.index), bold: false });
    parts.push({ text: m[0], bold: true });
    cursor = m.index + m[0].length;
  }
  if (cursor < line.length) parts.push({ text: line.slice(cursor), bold: false });

  for (const part of parts) {
    if (!part.text) continue;
    doc.setFont('helvetica', part.bold ? 'bold' : 'normal');
    doc.text(part.text, tx, y);
    tx += doc.getTextWidth(part.text);
  }
}

// ---------- WRAPPING RESPETANDO NEGRITAS DEL EXCEL ----------
//
// `runs` = [{ text, bold }] con el formato real del Excel. Los partimos en
// "palabras" (tokens no-espacio) preservando el weight de cada una. El
// wrapping se hace midiendo el ancho con la fuente correcta.
//
// Si `runs` viene vacío (caso legacy sin rich text), caemos a un único run
// normal con la descripción completa.
function runsToWords(runs, fallbackText) {
  const src = (runs && runs.length) ? runs : [{ text: fallbackText || '', bold: false }];
  const words = [];
  for (const run of src) {
    const parts = String(run.text).split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      words.push({ text: part, bold: !!run.bold, ws: /^\s+$/.test(part) });
    }
  }
  return words;
}

// Cuenta cuántas líneas ocupará el listado de `words` dentro de `maxW` con la
// fuente/tamaño activos en `doc`. Usa el mismo algoritmo que renderWordsWrapped
// pero sin pintar.
function countWrappedLines(doc, words, maxW) {
  let x = 0, lines = 1;
  for (const w of words) {
    doc.setFont('helvetica', w.bold ? 'bold' : 'normal');
    const ww = doc.getTextWidth(w.text);
    if (w.ws) {
      if (x === 0) continue; // ignorar espacio al inicio de línea
      x += ww;
      continue;
    }
    if (x + ww > maxW && x > 0) { lines++; x = 0; }
    x += ww;
  }
  return lines;
}

// Pinta `words` a partir de (x, y) haciendo wrap en `maxW`. Cada palabra usa
// su weight (bold del Excel). Devuelve el nuevo `y` tras pintar todas las
// líneas (para que el caller siga desde ahí).
function renderWordsWrapped(doc, words, x, y, maxW, lineH) {
  let cx = x;
  for (const w of words) {
    doc.setFont('helvetica', w.bold ? 'bold' : 'normal');
    const ww = doc.getTextWidth(w.text);
    if (w.ws) {
      if (cx === x) continue;
      doc.text(w.text, cx, y);
      cx += ww;
      continue;
    }
    if (cx + ww > x + maxW && cx > x) {
      cx = x;
      y += lineH;
    }
    doc.text(w.text, cx, y);
    cx += ww;
  }
  return y + lineH;
}
