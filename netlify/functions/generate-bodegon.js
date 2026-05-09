// Netlify Function — Genera un bodegón con Gemini y lo guarda en Supabase.
// Endpoint: POST /api/generate-bodegon  ({ skus, title, description })
//
// Variables de entorno requeridas (Site settings → Environment variables):
//   GEMINI_API_KEY            (Google AI Studio)
//   SUPABASE_URL              (mismo valor que VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API → service_role)
//   GEMINI_IMAGE_MODEL        (opcional, por defecto gemini-2.5-flash-image-preview)

import { createClient } from '@supabase/supabase-js';

// Lista de modelos a probar en orden. Si la env var GEMINI_IMAGE_MODEL está definida, va primero.
// Orden actualizado a los modelos vigentes en 2026 (Gemini 3 + 2.5).
const MODEL_FALLBACKS = [
  process.env.GEMINI_IMAGE_MODEL,
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
].filter(Boolean);

const DEFAULT_PROMPT_TEMPLATE = `Professional studio still-life product composition for a Spanish gourmet gift hamper e-commerce catalog (lotesdeespana.es style).
The result must look like a clean, polished product hero shot for an online catalog or product listing page — NOT a lifestyle photo, NOT a flat lay, NOT a holiday/Christmas decorative scene.

PRODUCTS TO INCLUDE
Use the attached reference images EXACTLY as shown. Do NOT redesign, recolor, retypeset or rewrite any label, logo, brand name or text on the packaging. Preserve every typography, color, illustration and detail of the original packaging with photographic, label-accurate fidelity. The viewer must be able to clearly read all brand names.

{PRODUCTS}

COMPOSITION — strict rules
The arrangement follows a clear three-tier pyramid structure:

BACK TIER (tallest items, ~20–30 cm): wine bottles, oil bottles, spirits, tall vertical boxes. Standing upright, vertical, forming a back "wall" across the width of the frame. Large flat boxes (>15 cm wide) are also placed STANDING UP VERTICALLY in this back tier, with their largest face toward the camera, like books on a shelf — NOT lying flat.

MIDDLE TIER (medium items, ~10–18 cm): vertical boxes of biscuits, chocolates, medium tins. Placed in front of the back tier, OVERLAPPING the bottles at their base by 20–30% of the bottle's width (real physical overlap, not just proximity). They partially hide the lower portion of the back-tier products.

FRONT TIER (smallest / flat items, < 10 cm): small jars, flat tins, flat turrón boxes. Lying flat or slightly tilted toward the camera (10–15° tilt) so the top label is readable. Forming a horizontal row across the front, overlapping the middle tier at their base.

GLOBAL DENSITY: products MUST be very close, with real physical overlap at the bases. No empty gaps between products. No floating products. Tight, abundant, "full hamper" feel. Slight asymmetry within balance: not a perfectly symmetric mirror. All products fully visible — viewer can identify each brand. Products fill ~80–85% of the frame width, centered horizontally on the lower-middle of the frame.

PROPORTIONS — non-negotiable
Strictly respect the real-world cm dimensions given for each product. A 30 cm bottle MUST visually appear roughly 5× taller than a 6 cm jar. A flat 18 cm wide turrón box MUST appear roughly 3× wider than a 6 cm square jar.

LIGHTING
Bright, clean studio lighting with soft, diffused key light from above-front, slightly camera-left. Gentle fill light from camera-right. Color temperature NEUTRAL (around 5000K). Pure white must look pure white. NO warm yellow tint, NO cool blue tint. Even illumination across all products. Controlled subtle highlights on glossy surfaces — never blown out.

SHADOWS — critical detail
SOFT, DIFFUSE CONTACT SHADOWS directly underneath each product, as if products rest on a subtly lit white surface. Shadow extension: short — extending no more than 2–3 cm from the base of each product. Shadow color: warm-neutral light grey, NEVER pure black, NEVER harsh. Shadow opacity: subtle (around 20–30% intensity). Soft edges, gradient falloff. NO sharp-edged shadows. NO long cast shadows, NO shadows on the background wall.

CAMERA
Slight 3/4 frontal view, eye-level to ~10° down. Equivalent of an 85mm prime lens at f/8. Razor-sharp focus across all products. No wide-angle distortion.

BACKGROUND
PURE WHITE seamless background (#FFFFFF), as if shot on a professional infinity cyclorama / white seamless paper backdrop. Completely UNIFORM white — NO gradient, NO vignette, NO color cast, NO grey transition, NO horizon line, NO floor edge. The background must be 100% pure clean white EVERYWHERE except for the soft contact shadows directly underneath the products. No texture, no pattern, no props, no fabric, no basket, no tray. Think of a high-end e-commerce product page (Amazon premium, Apple-style listing).

FRAMING
Horizontal 4:3 aspect ratio. Products centered horizontally, vertically positioned on the lower-middle of the frame so there is generous clean white space above the products. Even small margin (5–8% of frame) on left, right and bottom. Generous white margin on top (~15–20% of frame). No part of any product cropped.

OUTPUT QUALITY
Photorealistic, e-commerce catalog quality. Color-accurate, true-to-life packaging colors. Clean, retouched look. Premium Spanish delicatessen catalog aesthetic. Highest available resolution.

NEGATIVE — must NOT appear
No text overlays, captions, logos or watermarks added by the generator. No people, no hands, no body parts. No props (no leaves, flowers, ribbons, baskets, trays, fabric, wood textures, marble, kitchen items). No Christmas / holiday decorations. No invented or modified product labels, no fictional brands. No duplicated products (each reference appears exactly once). No reflections of windows, no studio equipment visible. No motion blur, no film grain, no vintage filter. No coloured background, no grey background, no gradient, no vignette — STRICTLY PURE WHITE. No long cast shadows on the background. No decorative sparkles or graphic embellishments.

The final image must contain EXACTLY {N} products, one of each reference listed above. No more, no less.`;

function placeFor(product) {
  // Si el producto trae posición explícita, respetarla. Si no, derivarla por altura.
  const explicit = (product.posicion || '').toUpperCase();
  if (['TRASERA', 'MEDIA', 'DELANTERA'].includes(explicit)) return explicit;
  const h = Number(product.alto || 0);
  if (h >= 18) return 'TRASERA';
  if (h >= 10) return 'MEDIA';
  return 'DELANTERA';
}

function placeInstruction(product) {
  const zone = placeFor(product);
  const w = Number(product.ancho || 0);
  const h = Number(product.alto || 0);
  const isFlat = h < 10 && (w >= h * 1.3); // cajas planas / latas planas
  if (zone === 'BACK' || zone === 'TRASERA') return { zoneEng: 'BACK', instr: 'standing upright' };
  if (zone === 'MIDDLE' || zone === 'MEDIA') return { zoneEng: 'MIDDLE', instr: 'standing upright, overlapping the back-tier products at their base by ~25%' };
  // FRONT
  if (isFlat) return { zoneEng: 'FRONT', instr: 'lying flat with a slight 10° tilt toward the camera' };
  return { zoneEng: 'FRONT', instr: 'standing upright' };
}

function buildProductsBlock(products) {
  const order = { TRASERA: 0, MEDIA: 1, DELANTERA: 2 };
  const sorted = [...products].sort((a, b) => order[placeFor(a)] - order[placeFor(b)]);
  return sorted.map(p => {
    const { zoneEng, instr } = placeInstruction(p);
    const desc = p.descripcion_visual || `${p.tipo_envase || 'package'}, ${p.color_dominante || ''}`.trim();
    const notes = p.notas ? ` ${p.notas}` : '';
    return `- ${p.marca || ''} ${p.nombre}, ${desc}. Real physical size: ${p.alto} × ${p.ancho} × ${p.fondo} cm. Place in the ${zoneEng} zone, ${instr}.${notes}`;
  }).join('\n');
}

async function fetchAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get('content-type') || 'image/png';
  return { mimeType: mime, data: buf.toString('base64') };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Método no permitido. Usa POST.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) return json(500, { error: 'Falta GEMINI_API_KEY en las variables de entorno de Netlify.' });
  if (!supabaseUrl || !supabaseKey) return json(500, { error: 'Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno de Netlify.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }); }

  const { skus, title, description } = body;
  if (!Array.isArray(skus) || skus.length === 0) {
    return json(400, { error: 'Selecciona al menos un producto.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // 1) Cargar productos seleccionados
  const { data: rows, error: pErr } = await supabase
    .from('products')
    .select('*')
    .in('ref', skus);
  if (pErr) return json(500, { error: 'Error consultando productos: ' + pErr.message });
  if (!rows || rows.length === 0) return json(404, { error: 'No se encontraron productos en la base de datos.' });

  // 2) Cargar plantilla de prompt (configurable desde Settings)
  let template = DEFAULT_PROMPT_TEMPLATE;
  try {
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'prompt_template')
      .maybeSingle();
    if (setting?.value && typeof setting.value === 'string') template = setting.value;
  } catch {}

  // 3) Construir prompt
  const productsBlock = buildProductsBlock(rows);
  const prompt = template
    .replace('{PRODUCTS}', productsBlock)
    .replace('{N}', String(rows.length));

  // 4) Descargar imágenes de referencia (vía Storage público)
  const refImages = [];
  for (const r of rows) {
    if (!r.foto_path) continue;
    try {
      const { data } = supabase.storage.from('productos').getPublicUrl(r.foto_path);
      const inline = await fetchAsBase64(data.publicUrl);
      refImages.push(inline);
    } catch (e) {
      console.warn('Sin imagen para', r.ref, e.message);
    }
  }

  // 5) Pre-registrar bodegón en estado "generating"
  const ref = newBodegonRef();
  const numero = await nextBodegonNumber(supabase);
  const finalTitle = title || `Bodegón IA #${numero}`;
  await supabase.from('bodegones').insert({
    ref,
    numero,
    nombre: finalTitle,
    descripcion: description || null,
    productos: skus,
    estado: 'generating',
    prompt_usado: prompt,
  });

  // 6) Llamar a Gemini — probamos cada modelo con varias configs hasta dar con la buena
  const FN_VERSION = 'v3-2026-05-09';
  console.log(`[Gemini] generate-bodegon ${FN_VERSION} · modelos a probar:`, MODEL_FALLBACKS);

  const parts = [{ text: prompt }];
  for (const img of refImages) parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });

  // Cada modelo se prueba con varias configs (algunos modelos rechazan responseModalities)
  const REQUEST_VARIANTS = [
    { name: 'v1beta + responseModalities[IMAGE]', apiVersion: 'v1beta', body: { contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'] } } },
    { name: 'v1beta + responseModalities[TEXT,IMAGE]', apiVersion: 'v1beta', body: { contents: [{ parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } } },
    { name: 'v1beta sin generationConfig', apiVersion: 'v1beta', body: { contents: [{ parts }] } },
    { name: 'v1 + responseModalities[IMAGE]', apiVersion: 'v1', body: { contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'] } } },
  ];

  let imageBase64 = null;
  let imageMime = 'image/png';
  let usedModel = null;
  const allErrors = []; // [{model, variant, error}]

  outer:
  for (const model of MODEL_FALLBACKS) {
    for (const variant of REQUEST_VARIANTS) {
      try {
        const url = `https://generativelanguage.googleapis.com/${variant.apiVersion}/models/${model}:generateContent?key=${geminiKey}`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(variant.body),
        });
        const j = await r.json();
        if (!r.ok) {
          const err = j?.error?.message || `HTTP ${r.status}`;
          allErrors.push({ model, variant: variant.name, error: err });
          console.warn(`[Gemini] ${model} (${variant.name}) →`, err);
          continue;
        }
        const cand = j?.candidates?.[0];
        const partsOut = cand?.content?.parts || [];
        for (const part of partsOut) {
          if (part.inlineData?.data) {
            imageBase64 = part.inlineData.data;
            imageMime = part.inlineData.mimeType || 'image/png';
            usedModel = `${model} (${variant.name})`;
            break;
          }
        }
        if (imageBase64) {
          console.log(`[Gemini] ✓ Imagen generada con ${usedModel}`);
          break outer;
        }
        allErrors.push({ model, variant: variant.name, error: 'respuesta sin imagen' });
      } catch (e) {
        const err = e.message || String(e);
        allErrors.push({ model, variant: variant.name, error: err });
        console.warn(`[Gemini] ${model} (${variant.name}) excepción:`, err);
      }
    }
  }

  if (!imageBase64) {
    // Lista los modelos disponibles
    let availableImageModels = [];
    try {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
      if (listRes.ok) {
        const ld = await listRes.json();
        availableImageModels = (ld.models || [])
          .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map(m => (m.name || '').replace('models/', ''))
          .filter(name => /image|imagen/i.test(name));
      }
    } catch {}

    // Construir mensaje detallado: qué modelo + variante + error en cada intento
    const detail = allErrors.map(e => `• ${e.model} [${e.variant}]: ${e.error}`).join('\n');
    let msg = `[${FN_VERSION}] Ningún modelo de Gemini consiguió generar la imagen.\n\nDetalle de cada intento:\n${detail}`;
    if (availableImageModels.length) {
      msg += `\n\nModelos disponibles en tu API key: ${availableImageModels.join(', ')}.`;
    } else {
      msg += `\n\nTu API key no tiene NINGÚN modelo de imagen disponible. Crea una nueva en aistudio.google.com con un proyecto que tenga acceso a Imagen / Gemini Image.`;
    }

    console.error('[Gemini] FAILED — todos los modelos:', allErrors);
    await supabase.from('bodegones').update({ estado: 'failed', error_mensaje: msg }).eq('ref', ref);
    return json(500, { error: msg });
  }

  // 7) Guardar la imagen en Supabase Storage
  const ext = imageMime.includes('jpeg') ? 'jpg' : imageMime.includes('webp') ? 'webp' : 'png';
  const path = `${ref}.${ext}`;
  const buf = Buffer.from(imageBase64, 'base64');
  const { error: upErr } = await supabase.storage
    .from('bodegones')
    .upload(path, buf, { contentType: imageMime, upsert: true });
  if (upErr) {
    await supabase.from('bodegones').update({ estado: 'failed', error_mensaje: 'Storage: ' + upErr.message }).eq('ref', ref);
    return json(500, { error: 'Error guardando imagen: ' + upErr.message });
  }

  await supabase.from('bodegones').update({ estado: 'completed', imagen_path: path }).eq('ref', ref);

  const { data: pub } = supabase.storage.from('bodegones').getPublicUrl(path);

  return json(200, {
    id: ref,
    n: numero,
    title: finalTitle,
    description: description || '',
    skus,
    image: pub?.publicUrl || null,
    image_path: path,
  });
};

// ---------- Helpers ----------
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}
function newBodegonRef() {
  // Formato 2 dígitos + 2 letras + 3 dígitos (compatible con la regla de la tabla)
  const d2 = () => String(Math.floor(Math.random() * 90) + 10);
  const a2 = () => {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return A[Math.floor(Math.random() * 26)] + A[Math.floor(Math.random() * 26)];
  };
  const d3 = () => String(Math.floor(Math.random() * 900) + 100);
  return `${d2()}${a2()}${d3()}`;
}
async function nextBodegonNumber(supabase) {
  const { data } = await supabase
    .from('bodegones')
    .select('numero')
    .order('numero', { ascending: false })
    .limit(1);
  const max = data?.[0]?.numero || 0;
  return max + 1;
}
