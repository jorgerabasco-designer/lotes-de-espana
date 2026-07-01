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

const BUCKET_ETIQUETAS = 'etiquetas';
const BUCKET_LOTES     = 'lotes';
const BUCKET_DOCS      = 'documents';
const MASTER_EXCEL_NAME = 'master-catalog.xlsx';

// Formato válido de referencia (RP): 2 dígitos + 2 letras + 3 dígitos.
const REF_RE = /^([0-9]{2}[A-Z]{2}[0-9]{3})$/;

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

// Del nombre de fichero saca el número de lote (último grupo de dígitos
// antes de la extensión). "lote-de-navidad-surtido-216.jpg" → "216".
export function extractLoteNumberFromFilename(name) {
  if (!name) return null;
  const base = String(name).split('/').pop().replace(/\.[^.]+$/, '');
  const groups = base.match(/(\d+)/g);
  if (!groups || !groups.length) return null;
  // El nº de lote suele ser el último grupo (los prefijos como "lote-de-
  // navidad-surtido-" no tienen dígitos).
  return groups[groups.length - 1];
}

// Extensiones aceptadas por subida.
export const ALLOWED_LABEL_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'pdf'];
export const ALLOWED_LOTE_EXTS  = ['png', 'jpg', 'jpeg', 'webp', 'pdf'];
export const ALLOWED_EXCEL_EXTS = ['xlsx', 'xlsm', 'xls'];

// ---------- ETIQUETAS ----------

// Sube una foto de etiqueta. Devuelve { ok, ref, path, url } o { ok:false, error }.
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
  const path = `${ref}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET_ETIQUETAS)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) return { ok: false, error: error.message || 'Error subiendo la etiqueta.' };
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
export async function getEtiquetaUrlByRef(ref) {
  if (!SUPABASE_READY || !ref) return null;
  // list con search para pillar cualquier extensión.
  const { data } = await supabase.storage
    .from(BUCKET_ETIQUETAS)
    .list('', { limit: 20, search: ref });
  if (!data || !data.length) return null;
  const hit = data.find(o => o.name.toUpperCase().startsWith(ref.toUpperCase() + '.'));
  if (!hit) return null;
  return publicUrl(BUCKET_ETIQUETAS, hit.name);
}

export async function deleteEtiqueta(path) {
  if (!SUPABASE_READY) return { ok: false };
  const { error } = await supabase.storage.from(BUCKET_ETIQUETAS).remove([path]);
  return { ok: !error, error: error?.message };
}

// ---------- LOTES ----------

// Sube una foto de lote. El nº se extrae del nombre. Se guarda como <NNN>.<ext>.
export async function uploadLotePhoto(file) {
  if (!SUPABASE_READY) return { ok: false, error: 'Supabase no está conectado.' };
  const ext = extOf(file.name);
  if (!ALLOWED_LOTE_EXTS.includes(ext)) {
    return { ok: false, error: `Formato no soportado (.${ext}). Usa PNG, JPG, WEBP o PDF.` };
  }
  const num = extractLoteNumberFromFilename(file.name);
  if (!num) {
    return { ok: false, error: `El nombre "${file.name}" no contiene un número de lote (necesita al menos un grupo de dígitos, ej. lote-216.jpg).` };
  }
  const path = `${num}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET_LOTES)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) return { ok: false, error: error.message || 'Error subiendo la foto del lote.' };
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
    .map(o => ({
      numero: o.name.replace(/\.[^.]+$/, ''),
      path: o.name,
      url: publicUrl(BUCKET_LOTES, o.name),
      size: o.metadata?.size || 0,
      updatedAt: o.updated_at || o.created_at || null,
    }));
}

export async function getLotePhotoUrl(numero) {
  if (!SUPABASE_READY || !numero) return null;
  const n = String(numero).trim();
  const { data } = await supabase.storage
    .from(BUCKET_LOTES)
    .list('', { limit: 20, search: n });
  if (!data || !data.length) return null;
  const hit = data.find(o => o.name.startsWith(n + '.'));
  if (!hit) return null;
  return publicUrl(BUCKET_LOTES, hit.name);
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
