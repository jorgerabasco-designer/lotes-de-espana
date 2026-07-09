// Script one-shot para importar todas las fotos de los lotes de lotesdeespana.es
// al bucket 'lotes' de Supabase Storage.
//
// Uso:
//   SUPABASE_URL='https://xxxx.supabase.co' \
//   SUPABASE_SERVICE_ROLE_KEY='eyJhb…' \
//   node scripts/import-lote-photos.mjs
//
// Estrategia:
//   1. Recorre las páginas del listado /14-lotes-de-navidad?p=N hasta que
//      no aparezcan URLs nuevas.
//   2. De cada URL de ficha extrae el NÚMERO de lote de la URL misma
//      (no del nombre del fichero de imagen), así el sistema aguanta si
//      cambian los ficheros en 2026.
//   3. Visita la ficha y extrae la foto grande (og:image, img#bigpic o
//      link[rel="image_src"], por este orden).
//   4. Descarga la foto y la sube a Supabase como <numero>.<ext>
//      con upsert:true (sobrescribe cualquier versión anterior).
//
// Sin dependencias externas: usa fetch nativo de Node 18+ y regex para el
// parseo (nada de cheerio).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('✗ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.');
  console.error('  Ejemplo:');
  console.error('  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/import-lote-photos.mjs');
  process.exit(1);
}

const BASE = 'https://www.lotesdeespana.es';
// La categoría cambia de temporada. Se prueban en orden hasta encontrar hits.
const LISTING_CANDIDATES = [
  '/21-lotes-de-navidad-surtidos',
  '/14-lotes-de-navidad',
];
const BUCKET = 'lotes';
const CONCURRENCY = 4;
const MAX_LISTING_PAGES = 20;
const UA = 'Mozilla/5.0 (LotesDeEspana Studio importer)';

const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Captura fichas de tipo "…-lote-de-navidad-<algo>-<numero>.html".
// El numero de lote es el último grupo de dígitos antes de .html.
const LOTE_URL_RE = /https?:\/\/[^"'\s<>]+?\/\d+-lote-de-navidad-[a-z0-9-]+?-\d+\.html/gi;
const LOTE_NUM_RE = /-(\d+)\.html(?:$|[?#])/i;

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function extractLoteUrls(html) {
  const set = new Set();
  for (const m of html.matchAll(LOTE_URL_RE)) set.add(m[0]);
  return [...set];
}
function extractLoteNumero(url) {
  const m = url.match(LOTE_NUM_RE);
  return m ? m[1] : null;
}
function extractPhotoUrl(html) {
  const og =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (og) return og[1];
  const bp = html.match(/<img[^>]+id=["']bigpic["'][^>]+src=["']([^"']+)["']/i);
  if (bp) return bp[1];
  const is = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
  if (is) return is[1];
  return null;
}
function extOf(url) {
  const clean = url.split('?')[0];
  const m = clean.match(/\.([a-z0-9]{2,5})$/i);
  const raw = m ? m[1].toLowerCase() : 'jpg';
  return raw === 'jpeg' ? 'jpg' : raw;
}
function contentTypeFor(ext) {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

async function enumerateOnCategory(catPath) {
  const all = new Set();
  for (let page = 1; page <= MAX_LISTING_PAGES; page++) {
    const url = `${BASE}${catPath}?p=${page}`;
    let html;
    try { html = await fetchText(url); }
    catch (e) { console.log(`    ${url}: ${e.message} — corto.`); break; }
    const urls = extractLoteUrls(html);
    const fresh = urls.filter(u => !all.has(u));
    console.log(`    p=${page}: ${urls.length} enlaces (${fresh.length} nuevos)`);
    if (fresh.length === 0) break;
    fresh.forEach(u => all.add(u));
  }
  return all;
}

async function enumerateLotes() {
  const merged = new Set();
  for (const cat of LISTING_CANDIDATES) {
    console.log(`  Categoría ${cat}:`);
    const found = await enumerateOnCategory(cat);
    found.forEach(u => merged.add(u));
  }
  return [...merged];
}

async function processLote(loteUrl) {
  const numero = extractLoteNumero(loteUrl);
  if (!numero) return { status: 'skip', reason: 'sin nº en URL', url: loteUrl };
  try {
    const html = await fetchText(loteUrl);
    let photo = extractPhotoUrl(html);
    if (!photo) return { numero, status: 'skip', reason: 'sin foto en la ficha' };
    if (photo.startsWith('//')) photo = 'https:' + photo;
    else if (photo.startsWith('/')) photo = BASE + photo;

    const ext = extOf(photo);
    const buf = await fetchBuffer(photo);
    const path = `${numero}.${ext}`;
    const { error } = await supa.storage.from(BUCKET).upload(path, buf, {
      upsert: true,
      contentType: contentTypeFor(ext),
    });
    if (error) return { numero, status: 'error', reason: error.message };
    return { numero, status: 'ok', path, bytes: buf.length };
  } catch (e) {
    return { numero, status: 'error', reason: e.message };
  }
}

async function runPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const i = idx++;
      const r = await worker(items[i]);
      out[i] = r;
      if (r.status === 'ok') console.log(`  ✓ ${r.numero} (${(r.bytes/1024).toFixed(0)} KB → ${r.path})`);
      else if (r.status === 'skip') console.log(`  ○ ${r.numero || '?'} skip: ${r.reason}`);
      else console.log(`  ✗ ${r.numero || '?'} ${r.reason}`);
    }
  });
  await Promise.all(runners);
  return out;
}

console.log(`▸ Descubriendo lotes en ${BASE} …`);
const urls = await enumerateLotes();
console.log(`▸ Encontrados ${urls.length} lotes.\n`);

if (!urls.length) {
  console.log('No hay lotes que importar.');
  process.exit(0);
}

console.log(`▸ Descargando fotos (concurrencia ${CONCURRENCY}) …`);
const results = await runPool(urls, processLote, CONCURRENCY);
const ok    = results.filter(r => r.status === 'ok');
const skip  = results.filter(r => r.status === 'skip');
const error = results.filter(r => r.status === 'error');

console.log('\n──────── RESUMEN ────────');
console.log(`   ✓ ${ok.length} subidas`);
console.log(`   ○ ${skip.length} descartadas (sin foto)`);
console.log(`   ✗ ${error.length} errores`);
if (error.length) {
  console.log('\nErrores detallados:');
  for (const e of error) console.log(`   · ${e.numero || '?'} — ${e.reason}`);
}
console.log(`\nBucket destino: ${BUCKET}. Nombres: <numero>.<ext>, con upsert (sobrescriben).`);
