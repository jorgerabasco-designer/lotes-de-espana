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

async function fetchLogoDataUrl() {
  try {
    const r = await fetchAsRenderable('/logo.png');
    return r?.dataUrl || null;
  } catch { return null; }
}

// ---------- PDF de ETIQUETAS TRASERAS ----------

// productos: [{ ref, uds, url }] · url es la de la etiqueta guardada (o null)
// Devuelve un Blob del PDF.
export async function generateEtiquetasPDF({ loteNumero, productos }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = 210, H = 297;
  const marginX = 12;
  const headerH = 22;

  // Cabecera
  const logo = await fetchLogoDataUrl();
  if (logo) {
    try { doc.addImage(logo, 'PNG', marginX, 8, 12, 12); } catch {}
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(45, 42, 38);
  doc.text(`Lote #${loteNumero} · Etiquetas traseras`, marginX + 16, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 115, 105);
  doc.text(`${productos.length} productos · ${new Date().toLocaleDateString('es-ES')}`, marginX + 16, 20);

  // Rejilla 2 × 3
  const cols = 2, rows = 3;
  const gapX = 6, gapY = 8;
  const gridTop = headerH + 6;
  const gridH = H - gridTop - 12;
  const cellW = (W - marginX * 2 - gapX * (cols - 1)) / cols;
  const cellH = (gridH - gapY * (rows - 1)) / rows;

  const withUrl = productos.filter(p => p.url);
  const missing = productos.filter(p => !p.url);

  for (let i = 0; i < withUrl.length; i++) {
    if (i > 0 && i % (cols * rows) === 0) {
      doc.addPage();
    }
    const idxInPage = i % (cols * rows);
    const col = idxInPage % cols;
    const row = Math.floor(idxInPage / cols);
    const cellX = marginX + col * (cellW + gapX);
    const cellY = gridTop + row * (cellH + gapY);

    const p = withUrl[i];
    // Cabecera de celda (RP + uds)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(45, 42, 38);
    doc.text(p.ref, cellX, cellY - 1);
    if (p.uds && p.uds !== 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(120, 115, 105);
      doc.text(`×${p.uds}`, cellX + 22, cellY - 1);
    }

    // Área de la imagen (ligeramente por debajo del pie de cabecera)
    const imgAreaY = cellY + 2;
    const imgAreaH = cellH - 4;
    const rendered = await fetchAsRenderable(p.url);
    if (rendered) {
      // Ajustar al área conservando aspect ratio (contain)
      const ratio = rendered.width / rendered.height;
      let drawW = cellW, drawH = cellW / ratio;
      if (drawH > imgAreaH) { drawH = imgAreaH; drawW = imgAreaH * ratio; }
      const drawX = cellX + (cellW - drawW) / 2;
      const drawY = imgAreaY + (imgAreaH - drawH) / 2;
      try {
        doc.addImage(rendered.dataUrl, 'JPEG', drawX, drawY, drawW, drawH);
      } catch (e) {
        // Fallback: caja gris
        doc.setDrawColor(230); doc.setFillColor(245);
        doc.rect(cellX, imgAreaY, cellW, imgAreaH, 'FD');
        doc.setFontSize(8); doc.setTextColor(150);
        doc.text('No se pudo renderizar', cellX + 2, imgAreaY + 6);
      }
    }
  }

  // Página final con productos sin etiqueta subida (avisando al usuario)
  if (missing.length) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(167, 77, 74);
    doc.text('Productos sin etiqueta subida', marginX, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80, 75, 70);
    let y = 30;
    missing.forEach(p => {
      doc.text(`• ${p.ref}  ${p.uds ? `(×${p.uds})` : ''}`, marginX, y);
      y += 6;
      if (y > H - 15) { doc.addPage(); y = 20; }
    });
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('Sube estas etiquetas desde Web → Subir etiquetas para incluirlas en próximos PDFs.', marginX, H - 12);
  }

  return doc.output('blob');
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

  // ---------- BANDA VERDE DECORATIVA ----------
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 28, 'F');
  const logo = await fetchLogoDataUrl();
  if (logo) {
    try { doc.addImage(logo, 'PNG', W / 2 - 22, 6, 44, 16); }
    catch {}
  } else {
    // Fallback: texto placeholder centrado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text('lotesdeespana', W / 2, 18, { align: 'center' });
  }

  let y = 36;

  // ---------- FOTO DEL LOTE ----------
  if (loteFotoUrl) {
    const rendered = await fetchAsRenderable(loteFotoUrl);
    if (rendered) {
      const maxW = W - marginX * 2 - 20;
      const maxH = 110;
      const ratio = rendered.width / rendered.height;
      let drawW = maxW, drawH = maxW / ratio;
      if (drawH > maxH) { drawH = maxH; drawW = maxH * ratio; }
      const drawX = marginX + ((W - marginX * 2) - drawW) / 2;
      try {
        doc.addImage(rendered.dataUrl, 'JPEG', drawX, y, drawW, drawH);
        y += drawH + 8;
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
