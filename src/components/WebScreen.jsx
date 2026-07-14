import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { I } from './icons.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import FilesGridModal from './FilesGridModal.jsx';
import {
  uploadEtiqueta, uploadLotePhoto, uploadMasterExcel,
  listEtiquetas, listLotePhotos, deleteEtiqueta, deleteLotePhoto,
  getMasterExcelInfo, fetchMasterExcelBuffer,
  uploadTarifasExcel, getTarifasExcelInfo, fetchTarifasExcelBuffer,
  uploadNomenclaturaExcel, getNomenclaturaExcelInfo, fetchNomenclaturaExcelBuffer,
  getEtiquetaUrlByRef, getLotePhotoUrl,
  ALLOWED_LABEL_EXTS, ALLOWED_LOTE_EXTS, ALLOWED_EXCEL_EXTS,
} from '../lib/web-files.js';
import { generateEtiquetasPDF, generateDescripcionPDF } from '../lib/pdf-lotes.js';
import { SUPABASE_READY } from '../lib/supabase.js';

// Helpers de formato
function formatDate(iso) {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

// Parsea "104, 105, 200-205, 300" → ['104','105','200','201','202','203','204','205','300']
function parseLoteInput(str) {
  if (!str) return [];
  const out = [];
  const seen = new Set();
  for (const raw of String(str).split(/[,;\s]+/)) {
    const s = raw.trim();
    if (!s) continue;
    const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      if (isFinite(a) && isFinite(b) && a <= b && b - a <= 200) {
        for (let n = a; n <= b; n++) {
          const key = String(n);
          if (!seen.has(key)) { seen.add(key); out.push(key); }
        }
      }
    } else if (/^\d+$/.test(s)) {
      if (!seen.has(s)) { seen.add(s); out.push(s); }
    }
  }
  return out;
}

// Del sheet de un lote saca [{ ref, uds, descripcion, runs }].
//
// `descripcion` es el texto plano de la col C (para búsquedas, fallback de
// nombre, etc.). `runs` es un array [{ text, bold }] con el formato REAL del
// Excel (bold parcial de las marcas), listo para pintar en el PDF preservando
// el mismo formato que ve el usuario en el Excel.
function readLoteSheet(workbook, loteNum) {
  const name = String(loteNum);
  const ws = workbook.Sheets[name];
  if (!ws) return null;
  const ref = ws['!ref'];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);

  const productos = [];
  // Fila 0 = cabecera → arrancamos en +1.
  for (let R = range.s.r + 1; R <= range.e.r; R++) {
    const refCell  = ws[XLSX.utils.encode_cell({ c: 0, r: R })];
    const udsCell  = ws[XLSX.utils.encode_cell({ c: 1, r: R })];
    const descCell = ws[XLSX.utils.encode_cell({ c: 2, r: R })];

    const refVal = refCell?.v != null ? String(refCell.v).trim().toUpperCase() : '';
    const uds    = Number(udsCell?.v) || 1;
    const descripcion = descCell?.v != null ? String(descCell.v).trim() : '';
    if (!refVal && !descripcion) continue;

    productos.push({
      ref: refVal,
      uds,
      descripcion,
      runs: cellToRuns(descCell),
    });
  }
  return productos;
}

// De una celda de xlsx saca los runs [{ text, bold }].
// SheetJS pone en cell.h el HTML con <b>…</b> cuando la celda tiene rich text
// (siempre que hayamos leído con cellStyles+cellHTML). Si no hay rich text,
// devuelve un único run normal con el valor.
function cellToRuns(cell) {
  if (!cell) return [{ text: '', bold: false }];
  const value = String(cell.v ?? '').trim();
  const html = cell.h && typeof cell.h === 'string' ? cell.h : '';
  // Sin marcadores de bold → un run plano
  if (!html || !/<(b|strong)[\s>]/i.test(html)) {
    return [{ text: value, bold: false }];
  }
  return parseHtmlToRuns(html);
}

// Parser tag-por-tag del HTML de una celda con rich text (cell.h de SheetJS).
// Mantiene una pila de "estaba bold" por cada tag abierto, así al cerrar un
// tag recupera el estado anterior — funciona con <b>, <strong>, y <span>
// con font-weight:bold (o 600-900), aunque estén anidados o mezclados con
// otros <span> normales que SheetJS mete para preservar el tamaño de fuente.
function parseHtmlToRuns(html) {
  const runs = [];
  const stack = [];
  let bold = false;
  let buf = '';
  const s = String(html);
  let i = 0;
  const flush = () => {
    if (!buf) return;
    runs.push({ text: decodeEntities(buf).replace(/\s+/g, ' '), bold });
    buf = '';
  };
  while (i < s.length) {
    const ch = s[i];
    if (ch !== '<') { buf += ch; i++; continue; }
    // Tag encontrado
    flush();
    const end = s.indexOf('>', i);
    if (end < 0) { i++; continue; }
    const tag = s.slice(i + 1, end);
    i = end + 1;
    if (tag.startsWith('!') || tag.startsWith('?')) continue; // comment/doctype
    const isClose = tag[0] === '/';
    if (isClose) {
      const prev = stack.pop();
      if (prev !== undefined) bold = prev;
    } else {
      // Self-closing tag (ej. <br/>) → tratar como texto y no apilar
      const selfClose = /\/\s*$/.test(tag);
      const tagName = tag.split(/[\s/>]/)[0].toLowerCase();
      if (!selfClose) stack.push(bold);
      if (tagName === 'b' || tagName === 'strong') bold = true;
      else if (tagName === 'span') {
        if (/font-weight\s*:\s*(?:bold|[6-9]00)/i.test(tag)) bold = true;
        // Sin font-weight: se mantiene el bold actual (no lo apagamos).
      }
      // Cualquier otro tag: mantiene el bold actual.
      if (selfClose) {
        // <br/> añade un espacio para que no se pegue el texto
        if (tagName === 'br') buf += ' ';
      }
    }
  }
  flush();

  // Compactar runs vacíos y consecutivos del mismo tipo.
  const out = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && last.bold === r.bold) last.text += r.text;
    else out.push({ ...r });
  }
  return out.length ? out : [{ text: '', bold: false }];
}
function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

// Pie de página que va al final de los PDFs de QR (viene del docx que Jorge nos pasó).
const PIE_LEGAL = 'En caso de que se produzca rotura de stock de algún componente de nuestras referencias, nuestra empresa se reserva el derecho de sustituir cualquier producto por otro de igual o superior valor sin coste adicional. Se atienden reclamaciones hasta el 10 de enero.';

// De la fila de tarifas saca { precio, titulo } por referencia:
//   · precio = col D "B.Imp" (base imponible; el IVA no se suma, en el PDF
//     se muestra "{precio}€ + IVA" indicando que el importe final lo incluirá
//     aparte).
//   · titulo = col C "Nombre Artículo" limpio de "REF. NNN" del final.
//     Fuente principal para el título del PDF ("PEQUEÑOS MOMENTOS - REF. 100").
// Formato Excel esperado: Ref | Pag | Nombre Artículo | B.Imp | Iva.
function readTarifas(workbook) {
  if (!workbook) return new Map();
  const m = new Map();
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false });
    for (const r of rows) {
      const ref = r[0];
      const nombre = r[2];
      const base = Number(r[3]);
      if (ref == null || !isFinite(base)) continue;
      const titulo = nombre
        ? String(nombre).trim().replace(/\s+REF\.?\s*\d+\s*$/i, '').trim() || null
        : null;
      m.set(String(ref).trim(), {
        precio: Math.round(base * 100) / 100,
        titulo,
      });
    }
  }
  return m;
}

// De la fila de nomenclatura saca:
//   { nombre } = "Cestas - Baúles y Lotes Sorteo 513.pdf"  (col B, nombre del fichero)
//   { titulo } = "Cestas y Baúles"                        (col C, opcional,
//                título a mostrar DENTRO del PDF; si no hay, se deriva del
//                nombre del fichero por compatibilidad)
function readNomenclatura(workbook) {
  if (!workbook) return new Map();
  const m = new Map();
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false });
    for (const r of rows) {
      const ref = r[0];
      const nombre = r[1];
      const titulo = r[2];
      if (ref == null || !nombre) continue;
      m.set(String(ref).trim(), {
        nombre: String(nombre).trim(),
        titulo: titulo ? String(titulo).trim() : null,
      });
    }
  }
  return m;
}

// De "Lotes Surtidos 223.pdf" extrae el "tipo" para el titulillo del QR:
// "LOTES SURTIDOS". Quita ".pdf" y el número del final.
function tipoFromNomenclatura(nombrePdf) {
  if (!nombrePdf) return null;
  return nombrePdf
    .replace(/\.pdf$/i, '')
    .replace(/\s+\d+\s*$/, '')
    .replace(/\s+REF\.?\s*\d+\s*$/i, '')
    .trim()
    .toUpperCase() || null;
}

export default function WebScreen({ showInfo }) {
  // ---- Excel maestro (catálogo con productos por lote) ----
  const [excel, setExcel] = useState(null);       // { path, url, size, updatedAt }
  const [excelBuffer, setExcelBuffer] = useState(null);
  const [excelWorkbook, setExcelWorkbook] = useState(null);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [dragOverExcel, setDragOverExcel] = useState(false);

  // ---- Excel de tarifas (precios por RP/lote) ----
  const [tarifas, setTarifas] = useState(null);        // info del fichero
  const [tarifasWorkbook, setTarifasWorkbook] = useState(null);
  const [uploadingTarifas, setUploadingTarifas] = useState(false);
  const [dragOverTarifas, setDragOverTarifas] = useState(false);

  // ---- Excel de nomenclatura (nombre exacto de cada PDF QR) ----
  const [nomencl, setNomencl] = useState(null);
  const [nomenclWorkbook, setNomenclWorkbook] = useState(null);
  const [uploadingNomencl, setUploadingNomencl] = useState(false);
  const [dragOverNomencl, setDragOverNomencl] = useState(false);

  // ---- Etiquetas ----
  const [etiquetas, setEtiquetas] = useState([]);
  const [dragOverEt, setDragOverEt] = useState(false);
  const [uploadingEt, setUploadingEt] = useState({ total: 0, done: 0, errors: [] });

  // ---- Fotos de lotes ----
  const [lotePhotos, setLotePhotos] = useState([]);
  const [dragOverLo, setDragOverLo] = useState(false);
  const [uploadingLo, setUploadingLo] = useState({ total: 0, done: 0, errors: [] });

  // ---- Generación de PDF ----
  const [loteInput, setLoteInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
  const [lastZip, setLastZip] = useState(null);       // { url, filename, size, count, missingByLote }
  const [showMissing, setShowMissing] = useState(false);

  // ---- Listado ampliado (modales) ----
  const [showEtiquetasList, setShowEtiquetasList] = useState(false);
  const [showLotesList, setShowLotesList] = useState(false);

  // ---- Carga inicial ----
  useEffect(() => {
    (async () => {
      try {
        const info = await getMasterExcelInfo();
        setExcel(info);
        if (info) {
          const buf = await fetchMasterExcelBuffer();
          setExcelBuffer(buf);
          // cellStyles + cellHTML: para preservar rich text runs (bold parcial
          // en la descripción de cada producto) — necesario para pintar la
          // marca en negrita en el PDF como está en el Excel.
          setExcelWorkbook(XLSX.read(buf, { type: 'array', cellStyles: true, cellHTML: true }));
        }
      } catch (e) { console.warn('Excel maestro no disponible:', e); }
      try {
        const info = await getTarifasExcelInfo();
        setTarifas(info);
        if (info) {
          const buf = await fetchTarifasExcelBuffer();
          setTarifasWorkbook(XLSX.read(buf, { type: 'array' }));
        }
      } catch (e) { console.warn('Tarifas no disponibles:', e); }
      try {
        const info = await getNomenclaturaExcelInfo();
        setNomencl(info);
        if (info) {
          const buf = await fetchNomenclaturaExcelBuffer();
          setNomenclWorkbook(XLSX.read(buf, { type: 'array' }));
        }
      } catch (e) { console.warn('Nomenclatura no disponible:', e); }
      try {
        setEtiquetas(await listEtiquetas());
        setLotePhotos(await listLotePhotos());
      } catch (e) { console.warn(e); }
    })();
  }, []);

  const excelSheetsSet   = useMemo(() => new Set(excelWorkbook?.SheetNames || []), [excelWorkbook]);
  const tarifasMap       = useMemo(() => readTarifas(tarifasWorkbook), [tarifasWorkbook]);
  const nomenclaturaMap  = useMemo(() => readNomenclatura(nomenclWorkbook), [nomenclWorkbook]);

  // ---- Subida Excel (helper genérico para los 3 Excels de "documents") ----
  const handleExcelUpload = async (file, kind) => {
    if (!file) return;
    const cfg = {
      catalogo: {
        upload: uploadMasterExcel, getInfo: getMasterExcelInfo,
        setBusy: setUploadingExcel, setInfo: setExcel,
        setWorkbook: (wb) => { setExcelWorkbook(wb); },
        onBuffer: (buf) => setExcelBuffer(buf),
        title: 'Excel del catálogo actualizado',
      },
      tarifas: {
        upload: uploadTarifasExcel, getInfo: getTarifasExcelInfo,
        setBusy: setUploadingTarifas, setInfo: setTarifas,
        setWorkbook: setTarifasWorkbook,
        title: 'Tarifas actualizadas',
      },
      nomenclatura: {
        upload: uploadNomenclaturaExcel, getInfo: getNomenclaturaExcelInfo,
        setBusy: setUploadingNomencl, setInfo: setNomencl,
        setWorkbook: setNomenclWorkbook,
        title: 'Nomenclatura actualizada',
      },
    }[kind];
    cfg.setBusy(true);
    try {
      const res = await cfg.upload(file);
      if (!res.ok) throw new Error(res.error);
      const info = await cfg.getInfo();
      cfg.setInfo(info);
      const buf = await file.arrayBuffer();
      cfg.onBuffer?.(buf);
      // cellStyles+cellHTML solo importan para el master del catálogo (col
      // C con marcas en negrita). Los otros dos no tienen rich text pero no
      // pasa nada por pedirlo — es un no-op.
      cfg.setWorkbook(XLSX.read(buf, { type: 'array', cellStyles: true, cellHTML: true }));
      showInfo?.({
        icon: 'check', tone: 'info',
        title: cfg.title,
        description: `Se ha sustituido el fichero (${res.originalName || file.name}).`,
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
    } catch (e) {
      showInfo?.({
        icon: 'trash', tone: 'danger',
        title: 'Error subiendo el Excel',
        description: e.message,
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
    } finally { cfg.setBusy(false); }
  };

  // ---- Subida Etiquetas (batch) ----
  const handleEtiquetasFiles = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    setUploadingEt({ total: list.length, done: 0, errors: [] });
    const errors = [];
    for (let i = 0; i < list.length; i++) {
      try {
        const res = await uploadEtiqueta(list[i]);
        if (!res.ok) errors.push({ name: list[i].name, error: res.error });
      } catch (e) {
        errors.push({ name: list[i].name, error: e.message });
      }
      setUploadingEt(s => ({ ...s, done: i + 1 }));
    }
    setUploadingEt({ total: 0, done: 0, errors });
    try { setEtiquetas(await listEtiquetas()); } catch {}
    if (errors.length) {
      showInfo?.({
        icon: 'trash', tone: 'danger',
        title: `Se subieron ${list.length - errors.length}/${list.length} etiquetas`,
        description: (
          <>
            No se pudieron subir <strong>{errors.length}</strong>. Los primeros:
            <br/>{errors.slice(0, 5).map((e, i) => <span key={i}>· {e.name}: {e.error}<br/></span>)}
          </>
        ),
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
    }
  };

  // ---- Subida Fotos de Lotes (batch) ----
  const handleLotePhotosFiles = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    setUploadingLo({ total: list.length, done: 0, errors: [] });
    const errors = [];
    for (let i = 0; i < list.length; i++) {
      try {
        const res = await uploadLotePhoto(list[i]);
        if (!res.ok) errors.push({ name: list[i].name, error: res.error });
      } catch (e) {
        errors.push({ name: list[i].name, error: e.message });
      }
      setUploadingLo(s => ({ ...s, done: i + 1 }));
    }
    setUploadingLo({ total: 0, done: 0, errors });
    try { setLotePhotos(await listLotePhotos()); } catch {}
    if (errors.length) {
      showInfo?.({
        icon: 'trash', tone: 'danger',
        title: `Se subieron ${list.length - errors.length}/${list.length} fotos`,
        description: (
          <>
            No se pudieron subir <strong>{errors.length}</strong>.
            <br/>{errors.slice(0, 5).map((e, i) => <span key={i}>· {e.name}: {e.error}<br/></span>)}
          </>
        ),
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
    }
  };

  // ---- Generar ZIP con 3 PDFs por lote ----
  // Estructura del ZIP:
  //   <nombre> - Etiquetas.pdf                (rejilla 2×3 de traseras)
  //   QR CON PRECIO/<nombre>.pdf              (foto + productos + precio con IVA)
  //   QR SIN PRECIO/<nombre>.pdf              (foto + productos, sin precio)
  const doGenerate = async () => {
    if (!excelWorkbook) {
      showInfo?.({
        icon: 'excel', tone: 'info',
        title: 'Falta el Excel del catálogo',
        description: 'Sube primero el Excel con los productos por lote.',
        confirmLabel: 'Entendido', confirmTone: 'neutral',
      });
      return;
    }
    const numeros = parseLoteInput(loteInput);
    if (!numeros.length) {
      showInfo?.({
        icon: 'sparkle', tone: 'info',
        title: 'Introduce un número de lote',
        description: 'Ejemplos: 104   ·   104, 105   ·   200-205, 300',
        confirmLabel: 'Entendido', confirmTone: 'neutral',
      });
      return;
    }
    const validos = numeros.filter(n => excelSheetsSet.has(n));
    const invalidos = numeros.filter(n => !excelSheetsSet.has(n));

    if (!validos.length) {
      showInfo?.({
        icon: 'excel', tone: 'info',
        title: 'Ninguno de los números está en el Excel del catálogo',
        description: `No se encontraron pestañas para: ${invalidos.join(', ')}`,
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
      return;
    }

    if (lastZip?.url) { try { URL.revokeObjectURL(lastZip.url); } catch {} }
    setLastZip(null);
    setGenerating(true);
    setGenProgress({ current: 0, total: validos.length });

    const zip = new JSZip();
    const carpetaConPrecio = zip.folder('QR CON PRECIO');
    const carpetaSinPrecio = zip.folder('QR SIN PRECIO');
    const errores = [];
    const missingByLote = {}; // { num: [{ ref, uds, descripcion }] }

    for (let i = 0; i < validos.length; i++) {
      const num = validos[i];
      setGenProgress({ current: i, total: validos.length });
      const productos = readLoteSheet(excelWorkbook, num) || [];
      const entry      = nomenclaturaMap.get(num);
      const tarifa     = tarifasMap.get(num);
      const nombrePdf  = entry?.nombre || `Lote ${num}.pdf`;
      const nombreBase = nombrePdf.replace(/\.pdf$/i, '');
      // Título dentro del PDF. Orden de prioridad:
      //   1. col C "Nombre Artículo" del Excel de Tarifas (fuente principal)
      //   2. col C del Excel de nomenclatura (fallback opcional)
      //   3. derivar del nombre del fichero
      const tipoLote   = tarifa?.titulo || entry?.titulo || tipoFromNomenclatura(nombrePdf) || 'LOTE';
      const precio     = tarifa?.precio ?? null;
      const fotoUrl    = await getLotePhotoUrl(num);

      try {
        const withUrls = await Promise.all(productos.map(async (p) => ({
          ...p,
          url: p.ref ? await getEtiquetaUrlByRef(p.ref) : null,
        })));
        const etiquetasResult = await generateEtiquetasPDF({ loteNumero: num, productos: withUrls });
        zip.file(`${nombreBase} - Etiquetas.pdf`, etiquetasResult.blob);
        if (etiquetasResult.missing?.length) {
          missingByLote[num] = etiquetasResult.missing;
        }

        const conPrecioBlob = await generateDescripcionPDF({
          loteNumero: num, tipoLote, loteFotoUrl: fotoUrl, productos, precio,
          pieLegal: PIE_LEGAL,
          headerVariant: 'con-precio',
        });
        carpetaConPrecio.file(nombrePdf, conPrecioBlob);

        const sinPrecioBlob = await generateDescripcionPDF({
          loteNumero: num, tipoLote, loteFotoUrl: fotoUrl, productos, precio: null,
          pieLegal: PIE_LEGAL,
          headerVariant: 'sin-precio',
        });
        carpetaSinPrecio.file(nombrePdf, sinPrecioBlob);
      } catch (e) {
        console.error('PDF gen error lote', num, e);
        errores.push({ numero: num, error: e.message });
      }
    }

    setGenProgress({ current: validos.length, total: validos.length });
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const filename = validos.length === 1
      ? `Lote ${validos[0]}.zip`
      : `Lotes ${validos.length} (${new Date().toISOString().slice(0,10)}).zip`;
    setLastZip({ url, filename, size: content.size, count: validos.length, errores, missingByLote });
    setGenerating(false);
    setGenProgress({ current: 0, total: 0 });

    if (invalidos.length || errores.length) {
      showInfo?.({
        icon: 'excel', tone: 'info',
        title: `${validos.length - errores.length}/${validos.length} lotes generados`,
        description: (
          <>
            {invalidos.length > 0 && <>No están en el Excel: <strong>{invalidos.join(', ')}</strong>.<br/></>}
            {errores.length > 0 && <>Errores generando: <strong>{errores.map(e => e.numero).join(', ')}</strong>.</>}
          </>
        ),
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
    }
  };

  const downloadZip = () => {
    if (!lastZip?.url) return;
    const a = document.createElement('a');
    a.href = lastZip.url; a.download = lastZip.filename;
    document.body.appendChild(a); a.click(); a.remove();
  };

  // ---- Borrado desde el listado modal ----
  const handleDeleteEtiqueta = async (item) => {
    const res = await deleteEtiqueta(item.path);
    if (!res.ok) throw new Error(res.error || 'Error borrando la etiqueta.');
    setEtiquetas(await listEtiquetas());
  };
  const handleDeleteLotePhoto = async (item) => {
    const res = await deleteLotePhoto(item.path);
    if (!res.ok) throw new Error(res.error || 'Error borrando la foto.');
    setLotePhotos(await listLotePhotos());
  };

  // ---- Render ----
  return (
    <section className="screen wide web-screen">
      <header className="cat-head">
        <div>
          <h1 className="cat-title">PDFs Web</h1>
          <p className="cat-sub">Genera los PDFs de las fichas de lote — etiquetas traseras y QR con o sin precio — a partir del Excel del catálogo.</p>
        </div>
      </header>

      {!SUPABASE_READY && (
        <div className="web-warn">
          Supabase no está conectado. En modo demo la subida de ficheros no persiste.
        </div>
      )}

      {/* ---- 1. Generar PDFs (arriba del todo) ---- */}
      <div className="web-block">
        <div className="web-blockh">
          <h3>Generar PDFs</h3>
          <p>Introduce el número (o varios) de lote. Se descarga un ZIP con 3 PDFs por lote: etiquetas traseras, QR con precio y QR sin precio. Puedes usar comas, espacios y rangos.</p>
        </div>
        <div className="lote-input-row">
          <input
            className="lote-input"
            type="text"
            placeholder="Ej: 104   ·   104, 105   ·   200-205, 300"
            value={loteInput}
            onChange={(e) => setLoteInput(e.target.value)}
            disabled={generating}
          />
          <button
            className="btn btn-primary"
            onClick={doGenerate}
            disabled={!excelWorkbook || generating || !loteInput.trim()}
          >
            {I.download({ size: 14 })}
            {generating
              ? `Generando ${genProgress.current + 1}/${genProgress.total}…`
              : 'Generar'}
          </button>
        </div>

        {lastZip && (
          <div className="zip-out">
            <div className="zip-info">
              <div className="zip-name">
                {I.download({ size: 16 })}
                <span>{lastZip.filename}</span>
              </div>
              <div className="zip-meta">
                {lastZip.count} lote{lastZip.count === 1 ? '' : 's'} · {formatBytes(lastZip.size)} · {lastZip.count * 3} PDFs (etiquetas + QR con precio + QR sin precio)
              </div>
            </div>
            <button className="btn btn-primary" onClick={downloadZip}>
              {I.download({ size: 14 })} Descargar ZIP
            </button>
          </div>
        )}

        {lastZip && Object.keys(lastZip.missingByLote || {}).length > 0 && (
          <button
            className="missing-banner"
            onClick={() => setShowMissing(true)}
            title="Ver referencias sin etiqueta"
          >
            <span className="missing-dot"/>
            {(() => {
              const totalRefs = new Set();
              for (const list of Object.values(lastZip.missingByLote)) {
                for (const m of list) totalRefs.add(m.ref || m.descripcion);
              }
              const nLotes = Object.keys(lastZip.missingByLote).length;
              return <>Faltan {totalRefs.size} etiqueta{totalRefs.size === 1 ? '' : 's'} en {nLotes} lote{nLotes === 1 ? '' : 's'}. Toca para ver el detalle.</>;
            })()}
          </button>
        )}
      </div>

      {/* ---- 2. Etiquetas & Fotos de lotes (2 columnas) ---- */}
      <div className="web-two-col">
        <div className="web-block">
          <div className="web-blockh">
            <h3>Etiquetas traseras</h3>
            <p>Fotos PNG/JPG/WEBP/PDF nombradas por la referencia del producto (ej. <code>06AC044.png</code>). Al subir otra con la misma referencia se reescribe.</p>
          </div>
          <UploadDrop
            label="Arrastra aquí etiquetas o pulsa para seleccionar"
            hint="Formato admitido: PNG · JPG · WEBP · PDF"
            accept={ALLOWED_LABEL_EXTS.map(e => '.' + e).join(',')}
            onFiles={handleEtiquetasFiles}
            multiple
            dragOver={dragOverEt}
            setDragOver={setDragOverEt}
            progress={uploadingEt}
          />
          <div className="web-count-row">
            <span>{etiquetas.length} etiqueta{etiquetas.length === 1 ? '' : 's'} guardada{etiquetas.length === 1 ? '' : 's'}</span>
            {etiquetas.length > 0 && (
              <button className="btn btn-ghost" onClick={() => setShowEtiquetasList(true)}>
                {I.catalog({ size: 14 })} Ver listado
              </button>
            )}
          </div>
        </div>

        <div className="web-block">
          <div className="web-blockh">
            <h3>Fotos de lotes</h3>
            <p>Fotos de los lotes ya montados. El número se extrae del nombre del fichero (ej. <code>lote-de-navidad-surtido-<b>216</b>.jpg</code>) y se renombra a <code>216.jpg</code>.</p>
          </div>
          <UploadDrop
            label="Arrastra aquí fotos de lotes o pulsa para seleccionar"
            hint="Formato admitido: PNG · JPG · WEBP · PDF"
            accept={ALLOWED_LOTE_EXTS.map(e => '.' + e).join(',')}
            onFiles={handleLotePhotosFiles}
            multiple
            dragOver={dragOverLo}
            setDragOver={setDragOverLo}
            progress={uploadingLo}
          />
          <div className="web-count-row">
            <span>{lotePhotos.length} foto{lotePhotos.length === 1 ? '' : 's'} guardada{lotePhotos.length === 1 ? '' : 's'}</span>
            {lotePhotos.length > 0 && (
              <button className="btn btn-ghost" onClick={() => setShowLotesList(true)}>
                {I.catalog({ size: 14 })} Ver listado
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- 3. Tres Excels en la misma fila (abajo) ---- */}
      <div className="web-three-col">
        <ExcelBlock
          title="Excel del catálogo"
          subtitle="Textos y productos por lote. Al subir uno nuevo, se sustituye al anterior."
          info={excel}
          extraMeta={excelWorkbook && ` · ${excelWorkbook.SheetNames.length} hojas (lotes)`}
          emptyMeta="Sube el Excel para poder generar PDFs."
          uploading={uploadingExcel}
          dragOver={dragOverExcel}
          setDragOver={setDragOverExcel}
          onFile={(f) => handleExcelUpload(f, 'catalogo')}
          filenameLabel="master-catalog.xlsx"
          compact
        />
        <ExcelBlock
          title="Tarifas nacionales"
          subtitle="Precio (base + IVA) por referencia. Se usa en el QR con precio."
          info={tarifas}
          extraMeta={tarifasMap.size > 0 && ` · ${tarifasMap.size} referencias`}
          emptyMeta="Sin tarifas → los PDFs QR se generan sin precio."
          uploading={uploadingTarifas}
          dragOver={dragOverTarifas}
          setDragOver={setDragOverTarifas}
          onFile={(f) => handleExcelUpload(f, 'tarifas')}
          filenameLabel="tarifa-nacional.xlsx"
          compact
        />
        <ExcelBlock
          title="Nomenclatura QR"
          subtitle="Nombre exacto de cada PDF (ej. 'Lotes Surtidos 223.pdf')."
          info={nomencl}
          extraMeta={nomenclaturaMap.size > 0 && ` · ${nomenclaturaMap.size} referencias`}
          emptyMeta="Sin nomenclatura → los PDFs se llamarán 'Lote NNN.pdf'."
          uploading={uploadingNomencl}
          dragOver={dragOverNomencl}
          setDragOver={setDragOverNomencl}
          onFile={(f) => handleExcelUpload(f, 'nomenclatura')}
          filenameLabel="nomenclatura-qr.xlsx"
          compact
        />
      </div>

      {/* Modales de listado */}
      <FilesGridModal
        open={showEtiquetasList}
        onClose={() => setShowEtiquetasList(false)}
        title="Etiquetas guardadas"
        items={etiquetas.map(e => ({
          id: e.path,
          label: e.ref,
          url: e.url,
          size: e.size,
          updatedAt: e.updatedAt,
          path: e.path,
          isPdf: /\.pdf$/i.test(e.path),
        }))}
        onDelete={handleDeleteEtiqueta}
        searchPlaceholder="Buscar por referencia…"
        emptyText="Aún no has subido ninguna etiqueta."
        zipBaseName="etiquetas"
      />
      <FilesGridModal
        open={showLotesList}
        onClose={() => setShowLotesList(false)}
        title="Fotos de lotes guardadas"
        items={lotePhotos.map(p => ({
          id: p.path,
          label: `Lote ${p.numero}`,
          url: p.url,
          size: p.size,
          updatedAt: p.updatedAt,
          path: p.path,
          isPdf: /\.pdf$/i.test(p.path),
        }))}
        onDelete={handleDeleteLotePhoto}
        searchPlaceholder="Buscar por nº de lote…"
        emptyText="Aún no has subido ninguna foto de lote."
        zipBaseName="fotos-lotes"
      />

      {/* Modal de referencias sin etiqueta */}
      {showMissing && lastZip?.missingByLote && (
        <MissingRefsModal
          missingByLote={lastZip.missingByLote}
          onClose={() => setShowMissing(false)}
        />
      )}

      <style>{`
        .screen{flex:1;min-width:0;padding:38px 56px 56px 64px;display:flex;flex-direction:column;gap:22px;overflow-y:auto;height:100vh;width:100%}
        .web-screen .cat-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap}
        .cat-title{font-family:'Fraunces',serif;font-weight:400;font-size:46px;line-height:1;letter-spacing:-.02em;color:var(--ink);margin:0}
        .cat-sub{margin:12px 0 0;color:var(--muted);font-size:14px;line-height:1.55}

        .web-warn{padding:12px 16px;background:rgba(167,77,74,.08);border:1px solid var(--accent);color:var(--accent);font-size:12.5px;border-radius:12px;font-weight:600}

        .web-block{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px 26px;display:flex;flex-direction:column;gap:14px}
        .web-block-compact{padding:18px 20px;gap:10px}
        .web-two-col{display:grid;grid-template-columns:1fr 1fr;gap:22px}
        .web-three-col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:stretch}
        .web-three-col > .web-block{height:100%}
        @media (max-width:1180px){ .web-three-col{grid-template-columns:1fr 1fr} }
        @media (max-width:820px){ .web-three-col{grid-template-columns:1fr} .web-two-col{grid-template-columns:1fr} }
        @media (max-width:1100px){ .web-two-col{grid-template-columns:1fr} }
        .web-block-compact .web-blockh h3{font-size:18px}
        .web-block-compact .web-blockh p{font-size:12px;line-height:1.45}
        .excel-info-compact{display:flex;flex-direction:column;gap:10px}
        .excel-info-compact .excel-drop{align-self:flex-start}
        .web-blockh h3{font-family:'Fraunces',serif;font-weight:500;font-size:22px;color:var(--ink);letter-spacing:-.01em;margin:0 0 4px}
        .web-blockh p{margin:0;font-size:13px;color:var(--muted);line-height:1.5;max-width:820px}
        .web-blockh code{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:12px;background:var(--bg);padding:1px 6px;border-radius:5px;color:var(--ink-2)}

        .excel-row{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}
        .excel-info{flex:1;min-width:220px}
        .excel-name{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:600;color:var(--ink)}
        .excel-name.empty{color:var(--muted);font-weight:500}
        .excel-meta{font-size:12px;color:var(--muted);margin-top:4px}
        .excel-drop{display:inline-flex;align-items:center;gap:7px;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;background:var(--accent);color:#fff;border:1px solid var(--accent);transition:all .15s;box-shadow:0 1px 2px rgba(167,77,74,.2)}
        .excel-drop:hover{background:var(--accent-2);transform:translateY(-1px)}
        .excel-drop.over{outline:2px dashed #fff;outline-offset:-4px}
        .excel-drop.busy{opacity:.7;cursor:progress}

        .web-count{font-size:12px;color:var(--muted);text-align:right}
        .web-count-row{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px;color:var(--muted);flex-wrap:wrap}
        .web-count-row .btn{padding:7px 12px;font-size:12px}

        .lote-input-row{display:flex;gap:10px;flex-wrap:wrap}
        .lote-input{flex:1;font-family:inherit;font-size:14px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 14px;outline:none;transition:all .15s;min-width:260px}
        .lote-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .lote-input-row .btn{min-width:160px;justify-content:center}

        .zip-out{margin-top:12px;padding:16px 18px;background:var(--bg);border:1px solid var(--line);border-radius:12px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}
        .zip-info{flex:1;min-width:220px}
        .zip-name{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;color:var(--ink)}
        .zip-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .zip-meta{font-size:12px;color:var(--muted);margin-top:4px;font-variant-numeric:tabular-nums}

        .missing-banner{margin-top:4px;padding:12px 16px;background:rgba(217,145,64,.08);border:1px solid rgba(217,145,64,.4);border-radius:12px;font-size:13px;font-weight:600;color:#8a5a1c;display:flex;align-items:center;gap:10px;cursor:pointer;transition:all .15s;font-family:inherit;text-align:left;width:100%}
        .missing-banner:hover{background:rgba(217,145,64,.14);border-color:rgba(217,145,64,.6)}
        .missing-dot{width:8px;height:8px;border-radius:50%;background:#d99140;flex-shrink:0;box-shadow:0 0 0 3px rgba(217,145,64,.25)}

        .btn{display:inline-flex;align-items:center;gap:7px;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;letter-spacing:-.005em;transition:all .15s;border:1px solid transparent;cursor:pointer;font-family:inherit;white-space:nowrap}
        .btn:disabled{opacity:.5;cursor:not-allowed}
        .btn-primary{background:var(--accent);color:#fff;box-shadow:0 1px 2px rgba(167,77,74,.3),0 4px 14px -4px rgba(167,77,74,.4)}
        .btn-primary:hover:not(:disabled){background:var(--accent-2);transform:translateY(-1px)}
        .btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink-2)}
        .btn-ghost:hover:not(:disabled){border-color:var(--ink-2);color:var(--ink)}

        .pdfs-section{margin-top:8px;padding-top:16px;border-top:1px solid var(--line)}
        .pdfs-header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap}
        .pdfs-header h4{font-family:'Fraunces',serif;font-weight:500;font-size:16px;color:var(--ink);margin:0}
        .pdfs-actions{display:flex;gap:6px;flex-wrap:wrap}
        .pdfs-list{display:flex;flex-direction:column;gap:6px}
        .pdf-row{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border:1px solid var(--line);border-radius:10px;gap:10px}
        .pdf-row.err{background:rgba(167,77,74,.05);border-color:rgba(167,77,74,.2)}
        .pdf-name{font-size:13px;font-weight:600;color:var(--ink)}
        .pdf-meta{font-size:11px;color:var(--muted);margin-top:2px}
      `}</style>
    </section>
  );
}

// --------- Bloque genérico de subida de Excel (catálogo / tarifas / nomenclatura) ---------
function ExcelBlock({ title, subtitle, info, extraMeta, emptyMeta, uploading, dragOver, setDragOver, onFile, filenameLabel, compact }) {
  return (
    <div className={`web-block ${compact ? 'web-block-compact' : ''}`}>
      <div className="web-blockh">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <div className={compact ? 'excel-info-compact' : 'excel-row'}>
        <div className="excel-info">
          {info ? (
            <>
              <div className="excel-name">
                {I.excel({ size: 18 })}
                <span>{filenameLabel}</span>
              </div>
              <div className="excel-meta">
                {formatDate(info.updatedAt)} · {formatBytes(info.size)}
                {extraMeta || ''}
              </div>
            </>
          ) : (
            <>
              <div className="excel-name empty">
                {I.excel({ size: 18 })}
                <span>Sin Excel subido</span>
              </div>
              <div className="excel-meta">{emptyMeta}</div>
            </>
          )}
        </div>
        <label
          className={`excel-drop ${dragOver ? 'over' : ''} ${uploading ? 'busy' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        >
          {I.upload({ size: 14 })}
          {uploading ? 'Subiendo…' : (info ? 'Sustituir' : 'Subir Excel')}
          <input type="file" accept=".xlsx,.xlsm,.xls" onChange={(e) => onFile(e.target.files?.[0])} hidden />
        </label>
      </div>
    </div>
  );
}

// --------- Modal de referencias sin etiqueta subida ---------
function MissingRefsModal({ missingByLote, onClose }) {
  // Aplanar y quitar duplicados por (ref, descripcion) para tener el catálogo
  // único de faltantes; y aparte agrupamos por lote para saber dónde salen.
  const byRef = new Map();
  for (const [lote, list] of Object.entries(missingByLote)) {
    for (const it of list) {
      const k = it.ref || it.descripcion || '';
      const prev = byRef.get(k) || { ...it, lotes: new Set() };
      prev.lotes.add(lote);
      byRef.set(k, prev);
    }
  }
  const rows = [...byRef.values()].map(v => ({ ...v, lotes: [...v.lotes] }));
  rows.sort((a, b) => String(a.ref).localeCompare(String(b.ref)));

  return (
    <div className="miss-back" onClick={onClose}>
      <div className="miss-modal" onClick={e => e.stopPropagation()}>
        <button className="miss-close" onClick={onClose} aria-label="Cerrar">{I.close({ size: 18 })}</button>
        <header className="miss-head">
          <div className="miss-eye">Referencias sin etiqueta</div>
          <h2 className="miss-title">{rows.length} etiqueta{rows.length === 1 ? '' : 's'} por subir</h2>
          <p className="miss-sub">Estas referencias aparecen en el Excel del catálogo pero no tienes su foto de trasera subida. Sube el fichero <code>&lt;RP&gt;.png</code> desde el bloque "Etiquetas traseras" y vuelve a generar el ZIP.</p>
        </header>
        <div className="miss-body">
          <table className="miss-table">
            <thead>
              <tr>
                <th>Ref (RP)</th>
                <th>Descripción</th>
                <th>Aparece en lote(s)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={(r.ref || '') + (r.descripcion || '')}>
                  <td><strong>{r.ref || '—'}</strong></td>
                  <td className="miss-desc">{r.descripcion || '(sin descripción)'}</td>
                  <td className="miss-lotes">{r.lotes.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <style>{`
          .miss-back{position:fixed;inset:0;background:rgba(20,16,12,.55);backdrop-filter:blur(8px);z-index:600;display:grid;place-items:center;padding:24px}
          .miss-modal{position:relative;background:#FAFAF7;border-radius:18px;width:min(900px,96vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 40px 90px -20px rgba(0,0,0,.4)}
          .miss-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:#fff;border:1px solid var(--line);color:var(--ink);cursor:pointer;z-index:2}
          .miss-close:hover{transform:scale(1.05);border-color:var(--ink)}
          .miss-head{padding:22px 28px 14px;border-bottom:1px solid var(--line);background:#fff;flex-shrink:0}
          .miss-eye{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:6px}
          .miss-title{font-family:'Fraunces',serif;font-size:24px;font-weight:500;color:var(--ink);letter-spacing:-.012em;margin:0}
          .miss-sub{color:var(--muted);font-size:12.5px;line-height:1.55;margin:6px 0 0;max-width:640px}
          .miss-sub code{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11.5px;background:var(--bg);padding:1px 5px;border-radius:5px;color:var(--ink-2)}
          .miss-body{overflow:auto;flex:1;padding:8px 20px 20px}
          .miss-table{width:100%;border-collapse:collapse;font-size:13px}
          .miss-table thead th{position:sticky;top:0;background:var(--bg);color:var(--muted);font-weight:600;text-align:left;padding:10px 12px;font-size:11.5px;letter-spacing:.02em;text-transform:uppercase;border-bottom:1px solid var(--line)}
          .miss-table tbody td{padding:9px 12px;border-bottom:1px solid var(--line-2);color:var(--ink);vertical-align:top}
          .miss-desc{color:var(--ink-2);font-size:12.5px;max-width:400px}
          .miss-lotes{font-variant-numeric:tabular-nums;color:var(--muted);font-size:12.5px}
        `}</style>
      </div>
    </div>
  );
}

// --------- Drop reutilizable ---------
function UploadDrop({ label, hint, accept, onFiles, multiple, dragOver, setDragOver, progress }) {
  const busy = progress?.total > 0 && progress.done < progress.total;
  return (
    <label
      className={`up-drop ${dragOver ? 'over' : ''} ${busy ? 'busy' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
    >
      <div className="up-icon">{I.upload({ size: 22 })}</div>
      <div className="up-t">{busy ? `Subiendo ${progress.done}/${progress.total}…` : label}</div>
      <div className="up-s">{hint}</div>
      <input type="file" accept={accept} multiple={multiple} onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} hidden />

      <style>{`
        .up-drop{display:flex;flex-direction:column;align-items:center;gap:5px;padding:26px 18px;border:1.5px dashed var(--line);border-radius:12px;background:#fff;cursor:pointer;transition:all .15s;text-align:center}
        .up-drop:hover{border-color:var(--accent);background:var(--accent-soft)}
        .up-drop.over{border-color:var(--accent);background:var(--accent-soft);border-style:solid}
        .up-drop.busy{cursor:progress;opacity:.85}
        .up-icon{width:44px;height:44px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;margin-bottom:4px}
        .up-t{font-size:14px;font-weight:600;color:var(--ink)}
        .up-s{font-size:11.5px;color:var(--muted);letter-spacing:.02em}
      `}</style>
    </label>
  );
}
