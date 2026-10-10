// Lotes especiales: los que el cliente monta a medida para un cliente suyo y
// que NO están en el catálogo de 134 lotes numerados.
//
// Por qué viven aparte:
//   Un lote de catálogo saca su listado del Excel maestro, su nombre de la
//   Nomenclatura QR y su precio de las Tarifas. Un lote especial no está en
//   ninguno de los tres: todo lo que se sabe de él viene del presupuesto que
//   suben en ese momento. Mezclarlos con los de catálogo ensuciaría los tres
//   Excel y el buscador por número.
//
// Dónde se guardan:
//   · Los datos, en la tabla `settings`, con clave `lote_especial_<slug>`.
//     Así no hace falta migrar la base de datos: son cuatro líneas de texto.
//   · La foto, en el bucket `lotes` pero bajo `especiales/`, para que no
//     aparezca en el listado de fotos de lotes de catálogo.

import { supabase, SUPABASE_READY, publicUrl } from './supabase.js';
import { fitWebImage, FitWebImageError } from './fitWebImage.js';

const PREFIJO = 'lote_especial_';
const BUCKET = 'lotes';
const CARPETA = 'especiales';

// "ALTADIA-1 ( Paleta Ibérica )" → "ALTADIA-1-PALETA-IBERICA"
export function slugLoteEspecial(ref) {
  return String(ref || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function rowToLote(key, value, updatedAt) {
  const v = value || {};
  return {
    slug: key.slice(PREFIJO.length),
    ref: v.ref || '',
    titulo: v.titulo || '',
    nombrePdf: v.nombrePdf || '',
    precio: v.precio ?? null,
    productos: Array.isArray(v.productos) ? v.productos : [],
    fotoPath: v.fotoPath || null,
    fotoUrl: v.fotoPath ? publicUrl(BUCKET, v.fotoPath) : null,
    updatedAt: updatedAt || v.updatedAt || null,
  };
}

export async function listLotesEspeciales() {
  if (!SUPABASE_READY) return [];
  const { data, error } = await supabase
    .from('settings')
    .select('key, value, updated_at')
    .like('key', `${PREFIJO}%`)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(r => rowToLote(r.key, r.value, r.updated_at));
}

export async function getLoteEspecial(slug) {
  if (!SUPABASE_READY || !slug) return null;
  const key = PREFIJO + slug;
  const { data, error } = await supabase
    .from('settings').select('key, value, updated_at').eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToLote(data.key, data.value, data.updated_at) : null;
}

// Sube la foto del lote especial. Pasa por el mismo 700×800 que las de
// catálogo: es la misma foto, en el mismo sitio del PDF.
export async function uploadFotoLoteEspecial(file, slug) {
  if (!SUPABASE_READY) return { ok: false, error: 'Supabase no está conectado.' };
  if (!slug) return { ok: false, error: 'Falta la referencia del lote.' };
  let upFile;
  try {
    const r = await fitWebImage(file, { name: `${slug}.jpg` });
    upFile = r.file;
  } catch (e) {
    if (e instanceof FitWebImageError) return { ok: false, error: e.message };
    return { ok: false, error: e?.message || 'No se pudo procesar la imagen.' };
  }
  const path = `${CARPETA}/${slug}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, upFile, { upsert: true, cacheControl: '300', contentType: 'image/jpeg' });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path, url: publicUrl(BUCKET, path) };
}

// Devuelve la URL de la foto con cache-buster, igual que las de catálogo: si
// la vuelven a subir, el PDF nuevo tiene que llevar la nueva.
export function fotoUrlLoteEspecial(fotoPath, stamp) {
  if (!fotoPath) return null;
  const base = publicUrl(BUCKET, fotoPath);
  return `${base}?v=${stamp ? encodeURIComponent(stamp) + '-' : ''}${Date.now()}`;
}

export async function saveLoteEspecial(lote) {
  if (!SUPABASE_READY) throw new Error('Supabase no está conectado.');
  const slug = lote.slug || slugLoteEspecial(lote.ref);
  if (!slug) throw new Error('La referencia del lote no puede estar vacía.');
  const value = {
    ref: lote.ref || '',
    titulo: lote.titulo || '',
    nombrePdf: lote.nombrePdf || '',
    precio: lote.precio ?? null,
    productos: (lote.productos || []).map(p => ({
      ref: p.ref || null,
      uds: Number(p.uds) || 1,
      descripcion: p.descripcion || '',
    })),
    fotoPath: lote.fotoPath || null,
    updatedAt: new Date().toISOString(),
  };
  const { error } = await supabase.from('settings').upsert({ key: PREFIJO + slug, value });
  if (error) throw new Error(error.message);
  return { ...rowToLote(PREFIJO + slug, value, value.updatedAt) };
}

export async function deleteLoteEspecial(slug) {
  if (!SUPABASE_READY || !slug) return false;
  const actual = await getLoteEspecial(slug);
  if (actual?.fotoPath) {
    await supabase.storage.from(BUCKET).remove([actual.fotoPath]).catch(() => {});
  }
  const { error } = await supabase.from('settings').delete().eq('key', PREFIJO + slug);
  if (error) throw new Error(error.message);
  return true;
}
