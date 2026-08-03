// Helpers para la sección "Web" del panel.
//
// Tres buckets de Supabase Storage:
//   · etiquetas → fotos de traseras. Nombre = <RP>.<ext> (ej. 06AC044.png).
//                 Al subir una con el mismo RP se sobrescribe.
//   · lotes     → fotos de lotes completos. Nombre = <NNN>.<ext> (ej. 216.jpg).
//                 El nº de lote se extrae del nombre del fichero (último grupo
//                 de dígitos antes de la extensión).
//   · documents → catálogo Excel maestro y otros documentos. El maestro tiene
//                 nombre fijo master-catalog.xlsx (se sobrescribe al subir uno
//                 nuevo).

import { supabase, SUPABASE_READY, publicUrl } from './supabase.js';
import { fitWebImage, FitWebImageError } from './fitWebImage.js';
import { optimizeImage } from './image-optimize.js';

// Tope de resolución de las etiquetas traseras al subirlas.
//
// A diferencia de las fotos de lote, aquí NO se fuerza un tamaño fijo: cada
// etiqueta tiene sus proporciones (unas alargadas, otras cuadradas) y hay que
// respetarlas. Solo se limita el lado mayor.
//
// 1800 px queda holgado por encima de los 1400 px con los que el PDF de
// etiquetas embebe las imágenes, así que la doble compresión no se nota.
const ETIQUETA_MAX_SIDE = 1800;
const ETIQUETA_QUALITY = 0.88;

const BUCKET_ETIQUETAS = 'etiquetas';
const BUCKET_LOTES     = 'lotes';
const BUCKET_DOCS      = 'documents';
const MASTER_EXCEL_NAME       = 'master-catalog.xlsx';
const TARIFAS_EXCEL_NAME      = 'tarifa-nacional.xlsx';
const NOMENCLATURA_EXCEL_NAME = 'nomenclatura-qr.xlsx';

// Formato válido de referencia (RP): 2 dígitos + 2 letras + 3 dígitos.
// El RP debe estar AL INICIO del nombre. Después puede venir cualquier texto
// (descripción del producto), separado por espacio, guion, guion bajo o punto.
// Ejemplos válidos:
//   "06AC044.png"
//   "01CV002 CERVEZA ALEMANA SCHWABEN BRÄU DAS HELLE PILS.png"
//   "03BL003 V BL HACIENDA LOPEZ DE HARO A 2025.png"
// Ejemplos NO válidos: "0106AC044-x.png" (no empieza por 2 dígitos + 2 letras + 3 dígitos)
const REF_RE = /^([0-9]{2}[A-Z]{2}[0-9]{3})(?:[\s\-_.]|$)/;

// ---------- helpers de nombres ----------

// De un nombre de fichero saca la extensión saneada (sin punto, minúsculas).
function extOf(name) {
  const m = String(name || '').match(/\.([^.]+)$/);
  const raw = m ? m[1].toLowerCase() : '';
  return raw.replace(/[^a-z0-9]/g, '');
}

// Del nombre completo saca la referencia si coincide con el formato.
// "06AC044.png" → "06AC044".  "0106AC044-editado.png" → null (no encaja).
export function extractRefFromFilename(name) {
  if (!name) return null;
  const base = String(name).split('/').pop().replace(/\.[^.]+$/, '').trim().toUpperCase();
  const m = base.match(REF_RE);
  return m ? m[1] : null;
}

// Del nombre de fichero saca el número de lote. Reconoce ambos formatos:
//   · Formato 2026 del cliente:  "216_001.jpg"                → "216"
//     (los 3+ primeros dígitos = nº de lote; "_001" es sufijo de versión)
//   · Formato antiguo de la web: "lote-de-navidad-surtido-216.jpg" → "216"
//     (último grupo de dígitos antes de la extensión)
export function extractLoteNumberFromFilename(name) {
  if (!name) return null;
  const base = String(name).split('/').pop().replace(/\.[^.]+$/, '');
  // 1) Prioridad al patrón "NNN..." al inicio del nombre (formato 2026).
  const startMatch = base.match(/^(\d{2,})/);
  if (startMatch) return startMatch[1];
  // 2) Fallback: último grupo de dígitos (formato antiguo).
  const groups = base.match(/(\d+)/g);
  if (!groups || !groups.length) return null;
  return groups[groups.length - 1];
}

// Extensiones aceptadas por subida.
export const ALLOWED_LABEL_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'pdf'];
// Sin PDF: una foto de lote tiene que acabar siendo un JPEG de 700×800, y un
// PDF no se puede convertir a eso en el navegador.
export const ALLOWED_LOTE_EXTS  = ['png', 'jpg', 'jpeg', 'webp'];
export const ALLOWED_EXCEL_EXTS = ['xlsx', 'xlsm', 'xls'];

// ---------- ETIQUETAS ----------

// Sube una foto de etiqueta. Devuelve { ok, ref, path, url } o { ok:false, error }.
// Si ya existía otra versión con distinta extensión (ej. antes .jpg y ahora
// se sube .png), la vieja se borra para no dejar duplicados que confundan a
// getEtiquetaUrlByRef.
export async function uploadEtiqueta(file) {
  if (!SUPABASE_READY) return { ok: false, error: 'Supabase no está conectado.' };
  const ext = extOf(file.name);
  if (!ALLOWED_LABEL_EXTS.includes(ext)) {
    return { ok: false, error: `Formato no soportado (.${ext}). Usa PNG, JPG, WEBP o PDF.` };
  }
  const ref = extractRefFromFilename(file.name);
  if (!ref) {
    return { ok: false, error: `El nombre "${file.name}" no contiene una referencia válida (formato: 2 dígitos + 2 letras + 3 dígitos, ej. 06AC044).` };
  }
  // Optimizar antes de subir. Las etiquetas llegaban directas de cámara (media
  // de 1,4 MB, algunas de 8 MB) y eso lastraba dos cosas: la subida para quien
  // las carga, y sobre todo la generación del PDF, que se descarga TODAS las
  // etiquetas del lote cada vez (43 MB para un lote de 27).
  // Los PDF se dejan intactos: no son fotos.
  let upFile = file;
  let finalExt = ext;
  if (file.type?.startsWith('image/')) {
    try {
      const r = await optimizeImage(file, {
        maxSide: ETIQUETA_MAX_SIDE,
        quality: ETIQUETA_QUALITY,
        format: 'image/jpeg',
      });
      if (r?.file) {
        upFile = r.file;
        finalExt = upFile.type === 'image/jpeg' ? 'jpg' : ext;
      }
    } catch (e) {
      console.warn('[etiquetas] no se pudo optimizar', file.name, e);
    }
  }

  const path = `${ref}.${finalExt}`;
  const { error } = await supabase.storage
    .from(BUCKET_ETIQUETAS)
    .upload(path, upFile, {
      upsert: true,
      // cacheControl bajo (5 min) para que las regeneraciones cercanas a una
      // subida vean la nueva versión aunque nuestro cache-buster fallara.
      cacheControl: '300',
      contentType: upFile.type || undefined,
    });
  if (error) return { ok: false, error: error.message || 'Error subiendo la etiqueta.' };

  // Borra cualquier versión previa con distinta extensión (evita duplicados).
  try {
    const { data: siblings } = await supabase.storage
      .from(BUCKET_ETIQUETAS)
      .list('', { limit: 20, search: ref });
    const stale = (siblings || [])
      .filter(o => o.name.toUpperCase().startsWith(ref.toUpperCase() + '.') && o.name !== path)
      .map(o => o.name);
    if (stale.length) await supabase.storage.from(BUCKET_ETIQUETAS).remove(stale);
  } catch { /* no fatal */ }

  return { ok: true, ref, path, url: publicUrl(BUCKET_ETIQUETAS, path) };
}

// Lista todas las etiquetas guardadas: [{ ref, path, url, size, updatedAt }].
export async function listEtiquetas() {
  if (!SUPABASE_READY) return [];
  const { data, error } = await supabase.storage
    .from(BUCKET_ETIQUETAS)
    .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new Error(error.message);
  return (data || [])
    .filter(o => o.name && !o.name.startsWith('.'))
    .map(o => {
      const ref = o.name.replace(/\.[^.]+$/, '').toUpperCase();
      return {
        ref,
        path: o.name,
        url: publicUrl(BUCKET_ETIQUETAS, o.name),
        size: o.metadata?.size || 0,
        updatedAt: o.updated_at || o.created_at || null,
      };
    });
}

// Devuelve la URL pública de la etiqueta de una referencia (o null si no hay).
//
// El URL lleva "?v=<updated_at>-<Date.now()>":
//   · updated_at: normalmente basta, pero Supabase Storage a veces NO lo
//     actualiza al hacer upsert → cache antigua.
//   · Date.now(): garantía extra — cada llamada a esta función genera un URL
//     distinto, así que el CDN/navegador NUNCA sirve una versión cacheada.
//   Combinado: cada regeneración de PDF baja la última versión del fichero.
//
// Si por lo que sea hay más de un fichero con la misma ref (ej. .jpg y .png
// convivientes), se elige el más reciente por updated_at.
export async function getEtiquetaUrlByRef(ref) {
  if (!SUPABASE_READY || !ref) return null;
  const { data } = await supabase.storage
    .from(BUCKET_ETIQUETAS)
    .list('', { limit: 20, search: ref });
  if (!data || !data.length) return null;
  const matches = data
    .filter(o => o.name.toUpperCase().startsWith(ref.toUpperCase() + '.'))
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
  const hit = matches[0];
  if (!hit) return null;
  const stamp = hit.updated_at || hit.created_at || '';
  const base = publicUrl(BUCKET_ETIQUETAS, hit.name);
  return `${base}?v=${stamp ? encodeURIComponent(stamp) + '-' : ''}${Date.now()}`;
}

export async function deleteEtiqueta(path) {
  if (!SUPABASE_READY) return { ok: false };
  const { error } = await supabase.storage.from(BUCKET_ETIQUETAS).remove([path]);
  return { ok: !error, error: error?.message };
}

// ---------- LOTES ----------

// Sube una foto de lote. El nº se extrae del nombre. Se guarda como
// <NNN>_001.<ext> (nomenclatura 2026 del cliente).
// Al subir, borra cualquier versión previa con distinta extensión para evitar
// duplicados que confundan a getLotePhotoUrl.
export async function uploadLotePhoto(file) {
  if (!SUPABASE_READY) return { ok: false, error: 'Supabase no está conectado.' };
  const ext = extOf(file.name);
  if (!ALLOWED_LOTE_EXTS.includes(ext)) {
    // El TIFF es el caso habitual (viene así de algunas cámaras) y el
    // navegador no sabe abrirlo, así que se explica qué hacer.
    if (ext === 'tif' || ext === 'tiff') {
      return { ok: false, error: `Los archivos TIFF (.${ext}) no se pueden procesar en el navegador. Convierte la imagen a JPG o PNG antes de subirla.` };
    }
    return { ok: false, error: `Formato no soportado (.${ext}). Usa JPG, PNG o WEBP.` };
  }
  const num = extractLoteNumberFromFilename(file.name);
  if (!num) {
    return { ok: false, error: `El nombre "${file.name}" no contiene un número de lote (necesita al menos un grupo de dígitos, ej. 216_001.jpg).` };
  }

  // REGLA DE NEGOCIO: una foto de lote SIEMPRE entra a 700×800.
  //
  // Antes se subía el fichero tal cual y se colaron 20 fotos directas de
  // cámara (hasta 5388×4000 y 10 MB) cuando en el PDF se imprimen a 105 mm.
  // fitWebImage encaja la foto completa en 700×800 con fondo blanco: ni
  // recorta, ni deforma, y respeta la orientación EXIF.
  const path = `${num}_001.jpg`;
  let upFile;
  try {
    const r = await fitWebImage(file, { name: path });
    upFile = r.file;
  } catch (e) {
    // Errores esperables (TIFF, formato raro, fichero dañado) se devuelven
    // como mensaje para el usuario, no como excepción.
    if (e instanceof FitWebImageError) return { ok: false, error: e.message };
    return { ok: false, error: e?.message || 'No se pudo procesar la imagen.' };
  }

  const { error } = await supabase.storage
    .from(BUCKET_LOTES)
    .upload(path, upFile, {
      upsert: true,
      cacheControl: '300',
      contentType: 'image/jpeg',
    });
  if (error) return { ok: false, error: error.message || 'Error subiendo la foto del lote.' };

  // Limpieza: borra cualquier fichero previo del mismo nº de lote con distinta
  // ruta (ej. NNN.jpg legacy, o NNN_001 con otra extensión).
  try {
    const { data: siblings } = await supabase.storage
      .from(BUCKET_LOTES)
      .list('', { limit: 20, search: num });
    const stale = (siblings || [])
      .filter(o => (o.name === `${num}.jpg` || o.name === `${num}.png` || o.name === `${num}.webp`
                    || o.name.startsWith(`${num}_`) || o.name.startsWith(`${num}.`))
                && o.name !== path)
      .map(o => o.name);
    if (stale.length) await supabase.storage.from(BUCKET_LOTES).remove(stale);
  } catch { /* no fatal */ }

  return { ok: true, numero: num, path, url: publicUrl(BUCKET_LOTES, path) };
}

export async function listLotePhotos() {
  if (!SUPABASE_READY) return [];
  const { data, error } = await supabase.storage
    .from(BUCKET_LOTES)
    .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new Error(error.message);
  return (data || [])
    .filter(o => o.name && !o.name.startsWith('.'))
    .map(o => {
      // Nombre en el bucket: NNN_001.jpg (o legacy NNN.jpg). Para el listado
      // mostramos solo el nº de lote (sin el sufijo de versión).
      const base = o.name.replace(/\.[^.]+$/, '');
      const numero = base.split('_')[0] || base;
      return {
        numero,
        path: o.name,
        url: publicUrl(BUCKET_LOTES, o.name),
        size: o.metadata?.size || 0,
        updatedAt: o.updated_at || o.created_at || null,
      };
    });
}

// Mismo cache-buster agresivo que getEtiquetaUrlByRef: updated_at + Date.now()
// para garantizar que cada regeneración de PDF baja la última versión.
export async function getLotePhotoUrl(numero) {
  if (!SUPABASE_READY || !numero) return null;
  const n = String(numero).trim();
  const { data } = await supabase.storage
    .from(BUCKET_LOTES)
    .list('', { limit: 20, search: n });
  if (!data || !data.length) return null;
  // El nombre puede ser "NNN.jpg" o "NNN_001.jpg" (nomenclatura 2026).
  const matches = (data || [])
    .filter(o => o.name === `${n}.jpg` || o.name === `${n}.png` || o.name === `${n}.webp`
              || o.name.startsWith(`${n}_`) || o.name.startsWith(`${n}.`))
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
  const hit = matches[0];
  if (!hit) return null;
  const stamp = hit.updated_at || hit.created_at || '';
  const base = publicUrl(BUCKET_LOTES, hit.name);
  return `${base}?v=${stamp ? encodeURIComponent(stamp) + '-' : ''}${Date.now()}`;
}

export async function deleteLotePhoto(path) {
  if (!SUPABASE_READY) return { ok: false };
  const { error } = await supabase.storage.from(BUCKET_LOTES).remove([path]);
  return { ok: !error, error: error?.message };
}

// ---------- EXCEL MAESTRO ----------

// Sube (o reemplaza) el Excel maestro de textos del catálogo.
export async function uploadMasterExcel(file) {
  if (!SUPABASE_READY) return { ok: false, error: 'Supabase no está conectado.' };
  const ext = extOf(file.name);
  if (!ALLOWED_EXCEL_EXTS.includes(ext)) {
    return { ok: false, error: `Formato no soportado (.${ext}). Usa XLSX o XLS.` };
  }
  // Nombre fijo → sobrescribe.
  const path = MASTER_EXCEL_NAME;
  const { error } = await supabase.storage
    .from(BUCKET_DOCS)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) return { ok: false, error: error.message || 'Error subiendo el Excel.' };
  return { ok: true, path, url: publicUrl(BUCKET_DOCS, path), originalName: file.name };
}

// Devuelve la info del Excel maestro guardado (o null si no hay).
export async function getMasterExcelInfo() {
  if (!SUPABASE_READY) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET_DOCS)
    .list('', { limit: 20, search: 'master-catalog' });
  if (error || !data || !data.length) return null;
  const hit = data.find(o => o.name === MASTER_EXCEL_NAME);
  if (!hit) return null;
  return {
    path: hit.name,
    url: publicUrl(BUCKET_DOCS, hit.name),
    size: hit.metadata?.size || 0,
    updatedAt: hit.updated_at || hit.created_at || null,
  };
}

// Descarga el Excel maestro como ArrayBuffer (para parsear con xlsx en cliente).
export async function fetchMasterExcelBuffer() {
  const info = await getMasterExcelInfo();
  if (!info) throw new Error('No hay Excel maestro subido todavía.');
  const res = await fetch(info.url);
  if (!res.ok) throw new Error(`No se pudo descargar el Excel (${res.status}).`);
  return res.arrayBuffer();
}

// ---------- EXCEL TARIFAS + NOMENCLATURA ----------
// Ambos son ficheros con nombre fijo en el bucket 'documents' que se sobrescriben
// cuando se sube uno nuevo. Se parsean en cliente con la librería xlsx.

async function uploadFixedNameExcel(file, fixedName) {
  if (!SUPABASE_READY) return { ok: false, error: 'Supabase no está conectado.' };
  const ext = extOf(file.name);
  if (!ALLOWED_EXCEL_EXTS.includes(ext)) {
    return { ok: false, error: `Formato no soportado (.${ext}). Usa XLSX o XLS.` };
  }
  const { error } = await supabase.storage
    .from(BUCKET_DOCS)
    .upload(fixedName, file, { upsert: true, contentType: file.type || undefined });
  if (error) return { ok: false, error: error.message || 'Error subiendo el Excel.' };
  return { ok: true, path: fixedName, url: publicUrl(BUCKET_DOCS, fixedName), originalName: file.name };
}

async function getFixedNameExcelInfo(fixedName, searchHint) {
  if (!SUPABASE_READY) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET_DOCS)
    .list('', { limit: 50, search: searchHint });
  if (error || !data || !data.length) return null;
  const hit = data.find(o => o.name === fixedName);
  if (!hit) return null;
  return {
    path: hit.name,
    url: publicUrl(BUCKET_DOCS, hit.name),
    size: hit.metadata?.size || 0,
    updatedAt: hit.updated_at || hit.created_at || null,
  };
}

async function fetchFixedNameExcelBuffer(fixedName, searchHint, notFoundError) {
  const info = await getFixedNameExcelInfo(fixedName, searchHint);
  if (!info) throw new Error(notFoundError);
  const res = await fetch(info.url);
  if (!res.ok) throw new Error(`No se pudo descargar el Excel (${res.status}).`);
  return res.arrayBuffer();
}

export function uploadTarifasExcel(file)      { return uploadFixedNameExcel(file, TARIFAS_EXCEL_NAME); }
export function getTarifasExcelInfo()         { return getFixedNameExcelInfo(TARIFAS_EXCEL_NAME, 'tarifa-nacional'); }
export function fetchTarifasExcelBuffer()     { return fetchFixedNameExcelBuffer(TARIFAS_EXCEL_NAME, 'tarifa-nacional', 'No hay Excel de tarifas subido todavía.'); }

export function uploadNomenclaturaExcel(file) { return uploadFixedNameExcel(file, NOMENCLATURA_EXCEL_NAME); }
export function getNomenclaturaExcelInfo()    { return getFixedNameExcelInfo(NOMENCLATURA_EXCEL_NAME, 'nomenclatura-qr'); }
export function fetchNomenclaturaExcelBuffer(){ return fetchFixedNameExcelBuffer(NOMENCLATURA_EXCEL_NAME, 'nomenclatura-qr', 'No hay Excel de nomenclatura subido todavía.'); }

