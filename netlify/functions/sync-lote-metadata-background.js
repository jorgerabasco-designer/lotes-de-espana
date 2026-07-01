// Netlify Background Function — Scrapea lotesdeespana.es y guarda en Supabase
// la tabla lote_metadata (título + descripción + URL de foto por número de
// lote). Se dispara con POST /api/sync-lote-metadata desde la pantalla Web.
//
// Es Background porque el sitio tiene 100+ lotes y con concurrencia limitada
// (5 en paralelo) tarda 2-4 minutos, muy por encima del timeout de 10s de
// una función Netlify normal.
//
// Estado y progreso se guardan en la clave 'lote_metadata_sync' de settings:
//   {
//     status: 'idle' | 'running' | 'done' | 'failed',
//     started_at, finished_at,
//     total, done, upserted, errors,
//     message,
//   }

import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SITE_BASE = 'https://www.lotesdeespana.es';
const CATEGORY_URLS = [
  // Categoría principal + variantes por rango de precio.
  '/14-lotes-de-navidad',
  '/14-lotes-de-navidad?p=1',
  '/14-lotes-de-navidad?p=2',
  '/14-lotes-de-navidad?p=3',
  '/14-lotes-de-navidad?p=4',
  '/14-lotes-de-navidad?p=5',
  '/14-lotes-de-navidad?p=6',
  '/14-lotes-de-navidad?p=7',
  '/14-lotes-de-navidad?p=8',
];
const CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 25000;
const USER_AGENT = 'LotesDeEspanaSync/1.0 (+admin panel)';

async function fetchText(url, ms = REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

// De una página de categoría PrestaShop saca [{ numero, url }] únicos.
function extractLoteLinksFromCategory(html) {
  const $ = cheerio.load(html);
  const links = new Set();
  const items = [];
  // PrestaShop suele exponer los items del listado con class="product_img_link" o
  // como anchors dentro de .product-container. Cogemos todos los <a href> que
  // apuntan a URLs tipo /XX-lote-de-navidad-surtido-NNN.html
  const re = /\/(\d+)-lote-de-navidad-surtido-(\d+)\.html/;
  $('a[href]').each((_, el) => {
    const href = String($(el).attr('href') || '');
    const m = href.match(re);
    if (!m) return;
    const abs = href.startsWith('http') ? href : SITE_BASE + (href.startsWith('/') ? href : '/' + href);
    if (links.has(abs)) return;
    links.add(abs);
    items.push({ numero: m[2], url: abs });
  });
  return items;
}

// De la ficha de un lote saca { titulo, descripcion, imagen_url }.
function parseLotePage(html, pageUrl) {
  const $ = cheerio.load(html);
  // Título — el H1 con itemprop="name" en PrestaShop.
  let titulo = $('h1[itemprop="name"]').first().text().trim();
  if (!titulo) titulo = $('h1').first().text().trim();

  // Descripción — algunas fichas usan #short_description_content, otras
  // #description o [itemprop="description"]. Concatenamos las que haya.
  const descBlocks = [];
  [
    '#short_description_content',
    '#description',
    '[itemprop="description"]',
    '.product-description',
    '#idTab1',
  ].forEach(sel => {
    $(sel).each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t && !descBlocks.some(x => x === t || x.includes(t))) descBlocks.push(t);
    });
  });
  const descripcion = descBlocks.join('\n\n').trim();

  // Imagen — bigpic, thickbox, meta og:image o img con id/class conocidos.
  let imagen_url =
       $('#bigpic').attr('src')
    || $('meta[property="og:image"]').attr('content')
    || $('img[itemprop="image"]').attr('src')
    || $('.js-qv-product-cover').attr('src')
    || $('#image-block img').first().attr('src')
    || null;
  if (imagen_url && !imagen_url.startsWith('http')) {
    imagen_url = SITE_BASE + (imagen_url.startsWith('/') ? imagen_url : '/' + imagen_url);
  }

  return { titulo, descripcion, imagen_url, page_url: pageUrl };
}

async function withConcurrency(items, worker, limit) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try { results[idx] = await worker(items[idx], idx); }
      catch (e) { results[idx] = { __err: e.message || String(e) }; }
    }
  });
  await Promise.all(runners);
  return results;
}

async function setStatus(supabase, patch) {
  const prev = await supabase.from('settings').select('value').eq('key', 'lote_metadata_sync').maybeSingle();
  const cur = (prev.data?.value) || {};
  const next = { ...cur, ...patch };
  await supabase.from('settings').upsert({ key: 'lote_metadata_sync', value: next });
  return next;
}

export const handler = async () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, body: 'Faltan variables Supabase.' };
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  await setStatus(supabase, {
    status: 'running',
    started_at: new Date().toISOString(),
    finished_at: null,
    total: 0, done: 0, upserted: 0, errors: 0,
    message: 'Enumerando lotes en la web…',
  });

  try {
    // 1) Enumerar lotes desde todas las páginas de categoría.
    const seen = new Map();
    for (const path of CATEGORY_URLS) {
      try {
        const html = await fetchText(SITE_BASE + path);
        const items = extractLoteLinksFromCategory(html);
        for (const it of items) if (!seen.has(it.numero)) seen.set(it.numero, it);
      } catch (e) {
        console.warn('[sync] fallo en categoría', path, e.message);
      }
    }
    const list = Array.from(seen.values());
    await setStatus(supabase, {
      total: list.length,
      message: `Encontrados ${list.length} lotes. Descargando fichas…`,
    });

    if (list.length === 0) {
      await setStatus(supabase, {
        status: 'failed',
        finished_at: new Date().toISOString(),
        message: 'No se encontró ninguna ficha de lote. ¿Cambió la web?',
      });
      return { statusCode: 200, body: 'no lotes' };
    }

    // 2) Fetch de cada ficha con concurrencia limitada.
    let done = 0, upserted = 0, errors = 0;
    await withConcurrency(list, async (it) => {
      try {
        const html = await fetchText(it.url);
        const meta = parseLotePage(html, it.url);
        const row = {
          numero: it.numero,
          titulo: meta.titulo || null,
          descripcion: meta.descripcion || null,
          imagen_url: meta.imagen_url || null,
          page_url: meta.page_url || null,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('lote_metadata').upsert(row, { onConflict: 'numero' });
        if (error) throw error;
        upserted++;
      } catch (e) {
        errors++;
        console.warn('[sync] error lote', it.numero, e.message);
      } finally {
        done++;
        // Actualizar cada 5 items para no martillear Supabase
        if (done % 5 === 0 || done === list.length) {
          await setStatus(supabase, { done, upserted, errors });
        }
      }
    }, CONCURRENCY);

    await setStatus(supabase, {
      status: 'done',
      finished_at: new Date().toISOString(),
      done, upserted, errors,
      message: `Sincronización completada · ${upserted} lotes actualizados · ${errors} errores.`,
    });
    return { statusCode: 200, body: `done ${upserted}` };
  } catch (e) {
    await setStatus(supabase, {
      status: 'failed',
      finished_at: new Date().toISOString(),
      message: 'Fallo general: ' + (e.message || String(e)),
    });
    return { statusCode: 500, body: e.message || 'error' };
  }
};
