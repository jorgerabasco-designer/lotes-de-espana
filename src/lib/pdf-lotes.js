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
    return {
      type: 'pdf',
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
      width: canvas.width,
      height: canvas.height,
    };
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
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      URL.revokeObjectURL(objectUrl);
      resolve({ type: 'image', dataUrl, width: img.naturalWidth, height: img.naturalHeight });
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
// Se sirve desde /public/pdf-header.png. Cacheamos el data-url tras la 1ª carga.
let _headerCache = null;
async function fetchHeaderBandRenderable() {
  if (_headerCache !== null) return _headerCache || null;
  try {
    const r = await fetchAsRenderable('/pdf-header.png');
    _headerCache = r || false;
    return r;
  } catch {
    _headerCache = false;
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
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = 210, H = 297;
  const marginX = 12;

  // Cabecera con logo proporcionado y título del lote.
  const logo = await fetchLogoRenderable();
  const logoTargetH = 12;
  let logoW = 12;
  if (logo?.dataUrl) {
    // Usar aspect ratio real del logo para no estirarlo.
    const ratio = (logo.width || 1) / (logo.height || 1);
    logoW = logoTargetH * ratio;
    try { doc.addImage(logo.dataUrl, 'JPEG', marginX, 8, logoW, logoTargetH); }
    catch { logoW = 12; }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(45, 42, 38);
  const titleX = marginX + logoW + 4;
  doc.text(`Etiquetas · Lote ${loteNumero}`, titleX, 16);

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
    const label = shortProductLabel(p.descripcion);
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

// Del texto largo tipo "1 Whisky Americano JACK DANIEL´S Tennessee Old Nº 7
// Botella 50 Cl. RIOJA" devuelve un nombre corto tipo "JACK DANIEL´S – Whisky".
// Estrategia: si detecta una marca en MAYÚSCULAS de 2+ palabras, la pone
// primera. Si no, coge las 3-4 primeras palabras.
function shortProductLabel(descripcion) {
  const d = String(descripcion || '').trim();
  if (!d) return 'Producto';
  // Quitar prefijo "1 " si viene incluido en la descripción.
  const clean = d.replace(/^\s*\d+\s+/, '');
  // Buscar la primera secuencia de 2+ palabras totalmente en mayúsculas
  // (respetando tildes y letras acentuadas comunes en marcas comerciales).
  const brandMatch = clean.match(/([A-ZÁÉÍÓÚÜÑ0-9´'.-]{2,}(?:\s+[A-ZÁÉÍÓÚÜÑ0-9´'.-]{2,}){0,3})/);
  if (brandMatch) {
    const brand = brandMatch[1].trim();
    // Recortar la marca si es demasiado larga (>30 chars)
    const brandShort = brand.length > 30 ? brand.slice(0, 28) + '…' : brand;
    return brandShort;
  }
  // Fallback: primeras 4 palabras
  const words = clean.split(/\s+/).slice(0, 4).join(' ');
  return words.length > 40 ? words.slice(0, 38) + '…' : words;
}

// ---------- PDF de DESCRIPCIÓN ----------

// PDF del QR — replica el formato oficial de Lotes de España:
//   · Logo verde de cabecera (assets/qr-header.png si existe, o texto placeholder)
//   · Foto grande del lote centrada
//   · Título "TIPO - REF. NNN" (mayúsculas, negrita) a la izquierda + precio a la derecha
//   · Bullets "N producto DESCRIPCIÓN con marca en negrita"
//   · Pie legal en cursiva pequeña (viene del docx que subió Jorge)
//
// Parámetros:
//   loteNumero:  "223"
//   tipoLote:    "LOTES SURTIDOS"           (viene del prefijo de la nomenclatura)
//   loteFotoUrl: URL de la foto del lote (bucket 'lotes')
//   productos:   [{ uds, descripcion }]
//   precio:      número o null            (si null → PDF "sin precio")
//   pieLegal:    string (footer)
export async function generateDescripcionPDF({
  loteNumero,
  tipoLote,
  loteFotoUrl,
  productos,
  precio = null,
  pieLegal = '',
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = 210, H = 297;
  const marginX = 15;

  const INK   = [45, 42, 38];
  const MUTED = [120, 115, 105];
  const GREEN = [64, 116, 66];  // verde del branding "lotesdeespana"

  // ---------- BANDA DECORATIVA (imagen full-width en la parte superior) ----------
  const band = await fetchHeaderBandRenderable();
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
  if (loteFotoUrl) {
    const rendered = await fetchAsRenderable(loteFotoUrl);
    if (rendered) {
      const maxW = W - marginX * 2;
      const maxH = 105;
      const ratio = rendered.width / rendered.height;
      // Contain: encaja dentro de (maxW × maxH) sin distorsionar.
      let drawW = maxW, drawH = maxW / ratio;
      if (drawH > maxH) { drawH = maxH; drawW = maxH * ratio; }
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
  doc.setFontSize(10);
  const lineH = 4.9;
  const bodyMaxY = H - 25;

  // Anchos: bullet, cifra uds, descripción
  const bulletX = marginX;
  const udsX    = marginX + 3;
  const udsMaxW = 6;
  const descX   = udsX + udsMaxW + 1.2;
  const descMaxW = W - marginX - descX;

  for (const p of productos) {
    if (y > bodyMaxY - lineH) { doc.addPage(); y = 22; }

    // Bullet gris
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text('•', bulletX, y);

    // Nº de unidades
    doc.setTextColor(...INK);
    doc.text(`${p.uds || 1}`, udsX, y);

    // Descripción con marcas en negrita (todo lo que esté en MAYÚSCULAS+ se
    // deja tal cual — el ojo ya lo percibe destacado; jsPDF no soporta rangos
    // de bold parcial fácilmente sin fuentes embebidas).
    const desc = (p.descripcion || '(sin descripción)').trim();
    const lines = doc.splitTextToSize(desc, descMaxW);
    for (let li = 0; li < lines.length; li++) {
      if (y > bodyMaxY - lineH) { doc.addPage(); y = 22; }
      doc.setTextColor(...INK);
      doc.text(lines[li], descX, y);
      y += lineH;
    }
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
