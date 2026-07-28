// Netlify Function — Lee la foto de un lote real y devuelve dónde está colocado
// cada producto, para poder imitar esa composición en el editor de maquetas.
//
// Endpoint: POST /api/analyze-lote   body: { lote: "311" }
//   returns: { slots: [{x,y,w,h}], n, cached, url }
//   (coordenadas normalizadas 0..1 sobre la foto, x/y = esquina sup. izquierda)
//
// Variables de entorno:
//   GEMINI_API_KEY              (ya la usa la generación de bodegones)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//   GEMINI_VISION_MODEL         (opcional, para forzar modelo)
//
// El resultado se cachea en la tabla `settings` (clave `ref_layout_<lote>`):
// la foto de un lote no cambia, así que se analiza una sola vez.

import { createClient } from '@supabase/supabase-js';

// Se prueban por orden hasta que uno responda: así no dependemos de que un id
// de modelo concreto siga vivo.
const MODEL_CANDIDATES = [
  process.env.GEMINI_VISION_MODEL,
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash',
].filter(Boolean);

const PROMPT = `This is a photograph of a Spanish gourmet gift hamper (cesta de Navidad).

Detect every individual PRODUCT visible in it: bottles, boxes, tins, jars,
packets, cured meat pieces, etc.

Rules:
- One box per product unit. If the same product appears twice, return two boxes.
- Include partially hidden products (give the box of the visible part).
- Do NOT return a box for: the basket, tray, crate or box that contains
  everything; the background; ribbons, shredded filler or decorations.
- Do NOT return one giant box covering the whole arrangement.

Return ONLY a JSON array, no prose, where each element is:
{"box_2d": [ymin, xmin, ymax, xmax], "label": "short product type"}
with coordinates normalised to 0-1000 over the image.`;

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido. Usa POST.' });

  const geminiKey = process.env.GEMINI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!geminiKey) return json(500, { error: 'Falta GEMINI_API_KEY en Netlify.' });
  if (!supabaseUrl || !supabaseKey) return json(500, { error: 'Faltan las claves de Supabase en Netlify.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }); }

  const lote = String(body.lote || '').trim();
  if (!/^\d{1,5}$/.test(lote)) {
    return json(400, { error: 'Indica el número de lote (solo dígitos), por ejemplo 311.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const cacheKey = `ref_layout_${lote}`;

  // 1) ¿Ya analizado antes?
  if (!body.force) {
    try {
      const { data } = await supabase.from('settings').select('value').eq('key', cacheKey).maybeSingle();
      if (data?.value?.slots?.length) {
        return json(200, { ...data.value, cached: true });
      }
    } catch {}
  }

  // 2) Localizar la foto del lote en el bucket `lotes` (se llaman NNN_001.jpg,
  //    pero la extensión varía, así que se busca por prefijo).
  let fileName = null;
  try {
    const { data: files } = await supabase.storage.from('lotes').list('', { limit: 1000 });
    const rx = new RegExp(`^0*${lote}[_.\\s-]`, 'i');
    const hit = (files || []).find(f => rx.test(f.name)) || (files || []).find(f => f.name.startsWith(`${lote}_`));
    fileName = hit?.name || null;
  } catch (e) {
    return json(500, { error: 'No se pudo leer el bucket de lotes: ' + e.message });
  }
  if (!fileName) {
    return json(404, { error: `No hay foto subida del lote ${lote}. Súbela en PDFs Web → Fotos de lotes.` });
  }

  const { data: pub } = supabase.storage.from('lotes').getPublicUrl(fileName);
  const url = pub.publicUrl;

  let inline;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    inline = { mimeType: res.headers.get('content-type') || 'image/jpeg', data: buf.toString('base64') };
  } catch (e) {
    return json(500, { error: 'No se pudo descargar la foto del lote: ' + e.message });
  }

  // 3) Detección con Gemini
  let raw = null;
  const errores = [];
  for (const model of MODEL_CANDIDATES) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: PROMPT }, { inlineData: inline }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0 },
          }),
        }
      );
      const j = await r.json();
      if (!r.ok) { errores.push(`${model}: ${j?.error?.message || r.status}`); continue; }
      raw = j?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || null;
      if (raw) break;
      errores.push(`${model}: respuesta sin texto`);
    } catch (e) {
      errores.push(`${model}: ${e.message}`);
    }
  }
  if (!raw) return json(502, { error: 'No se pudo analizar la foto.\n' + errores.join('\n') });

  const slots = parseSlots(raw);
  if (!slots.length) {
    return json(422, { error: 'No se han reconocido productos en la foto de ese lote.' });
  }

  const payload = { slots, n: slots.length, url, lote };

  // 4) Cachear (si falla, da igual: solo significa reanalizar la próxima vez)
  try {
    await supabase.from('settings').upsert({ key: cacheKey, value: payload });
  } catch {}

  return json(200, { ...payload, cached: false });
};

// Convierte la respuesta de Gemini en cajas normalizadas 0..1, descartando lo
// que no puede ser un producto (cajas gigantes, minúsculas o mal formadas).
function parseSlots(raw) {
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch {
    const m = String(raw).match(/\[[\s\S]*\]/);
    if (!m) return [];
    try { arr = JSON.parse(m[0]); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];

  const out = [];
  for (const it of arr) {
    const b = it?.box_2d || it?.box || it?.bbox;
    if (!Array.isArray(b) || b.length < 4) continue;
    const [ymin, xmin, ymax, xmax] = b.map(Number);
    if ([ymin, xmin, ymax, xmax].some(v => !isFinite(v))) continue;
    const x = Math.min(xmin, xmax) / 1000;
    const y = Math.min(ymin, ymax) / 1000;
    const w = Math.abs(xmax - xmin) / 1000;
    const h = Math.abs(ymax - ymin) / 1000;
    if (w <= 0.01 || h <= 0.01) continue;      // ruido
    if (w > 0.9 && h > 0.9) continue;           // la cesta entera
    if (w * h > 0.55) continue;                 // demasiado grande para un producto
    out.push({ x, y, w, h, label: String(it.label || '').slice(0, 40) });
  }
  // De atrás hacia delante, que es como se monta la composición.
  out.sort((a, b) => (a.y + a.h) - (b.y + b.h));
  return out;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...corsHeaders() }, body: JSON.stringify(body) };
}
