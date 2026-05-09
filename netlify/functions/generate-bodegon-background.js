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
// Orden actualizado: PRO primero (máxima calidad), luego Flash. gemini-2.5-flash-image-preview
// ya no existe (Google lo deprecó) — no lo incluimos.
const MODEL_FALLBACKS = [
  process.env.GEMINI_IMAGE_MODEL,
  'gemini-3-pro-image-preview',     // Máxima calidad fotorealista
  'gemini-3.1-flash-image-preview', // Más rápido, balance calidad/coste
  'gemini-2.5-flash-image',         // Estable, fallback
].filter(Boolean);

const DEFAULT_PROMPT_TEMPLATE = `Professional studio still-life product composition for a Spanish gourmet gift hamper e-commerce catalog (lotesdeespana.es style).
The result must look like a clean, polished product hero shot for an online catalog or product listing page — NOT a lifestyle photo, NOT a flat lay, NOT a holiday/Christmas decorative scene.

================================================================
ABSOLUTE PRIORITY — PACKAGING FIDELITY (NON-NEGOTIABLE)
================================================================
The products in the attached reference images MUST appear in the
output IDENTICAL to the references — pixel-perfect, label-accurate.

GROUND TRUTH HIERARCHY:
The attached reference images are the ABSOLUTE GROUND TRUTH. The
text descriptions below are supplementary metadata only. If text
and image conflict, ALWAYS trust the image and ignore the text.
NEVER use text as a license to redesign packaging.

You are ONLY allowed to change: position, orientation, lighting.
You are STRICTLY FORBIDDEN to change: any logo, brand name, text,
typography, illustration, colour, shape, cap, lid, ribbon or finish.

If you cannot reproduce a label perfectly, copy it from the
reference image as a flat texture. NEVER hallucinate, simplify or
invent packaging design. The viewer MUST be able to read every
brand name and every line of label text exactly as in the reference.

REFERENCE IMAGE MAPPING:
"PRODUCT #N — REFERENCE IMAGE #N" maps each product description
to its reference image. The reference images are attached to this
request in the same order the products are listed.

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
  if (zone === 'BACK' || zone === 'TRASERA') return { zoneEng: 'BACK', instr: 'standing upright, perfectly vertical, no tilt' };
  if (zone === 'MIDDLE' || zone === 'MEDIA') return { zoneEng: 'MIDDLE', instr: 'standing upright with no tilt, overlapping the back-tier products at their base by ~25%' };
  // FRONT
  if (isFlat) return { zoneEng: 'FRONT', instr: 'lying perfectly flat on the surface (top label facing straight up to the camera lens), zero tilt, zero rotation' };
  return { zoneEng: 'FRONT', instr: 'standing upright, perfectly vertical, no tilt' };
}

function buildProductsBlock(products) {
  const order = { TRASERA: 0, MEDIA: 1, DELANTERA: 2 };
  const sorted = [...products].sort((a, b) => order[placeFor(a)] - order[placeFor(b)]);

  return sorted.map((p, idx) => {
    const { zoneEng, instr } = placeInstruction(p);
    const lines = [];

    lines.push(`PRODUCT #${idx + 1} — REFERENCE IMAGE #${idx + 1}`);
    lines.push(`  Brand: ${p.marca || '(unknown)'}`);
    lines.push(`  Name: ${p.nombre}`);
    if (p.categoria_id || p.categoria) lines.push(`  Category: ${p.categoria_id || p.categoria}`);
    if (p.tipo_envase) lines.push(`  Packaging type: ${p.tipo_envase}`);
    if (p.color_dominante) lines.push(`  Dominant colours: ${p.color_dominante}`);
    if (p.descripcion_visual) lines.push(`  Visual description: ${p.descripcion_visual}`);
    if (Array.isArray(p.tags) && p.tags.length) lines.push(`  Attributes: ${p.tags.join(', ')}`);
    lines.push(`  Real physical size: ${p.alto} × ${p.ancho} × ${p.fondo} cm`);
    lines.push(`  Position: ${zoneEng} tier — ${instr}`);
    if (p.notas) lines.push(`  Notes: ${p.notas}`);

    return lines.join('\n');
  }).join('\n\n');
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

  // El frontend ya creó la fila en bodegones (estado='generating') y nos pasa la ref.
  const { ref } = body;
  if (!ref) return json(400, { error: 'Falta el campo "ref" del bodegón.' });

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // 1) Cargar la fila del bodegón
  const { data: bod, error: bErr } = await supabase
    .from('bodegones')
    .select('*')
    .eq('ref', ref)
    .single();
  if (bErr || !bod) {
    return json(404, { error: 'Bodegón no encontrado: ' + (bErr?.message || 'sin datos') });
  }
  const skus = bod.productos || [];
  const finalTitle = bod.nombre;
  const description = bod.descripcion;

  if (!Array.isArray(skus) || skus.length === 0) {
    await markFailed(supabase, ref, 'Bodegón sin productos.');
    return json(400, { error: 'Bodegón sin productos.' });
  }

  // 2) Cargar productos seleccionados
  const { data: rows, error: pErr } = await supabase
    .from('products')
    .select('*')
    .in('ref', skus);
  if (pErr) {
    await markFailed(supabase, ref, 'Error consultando productos: ' + pErr.message);
    return json(500, { error: 'Error consultando productos: ' + pErr.message });
  }
  if (!rows || rows.length === 0) {
    await markFailed(supabase, ref, 'No se encontraron productos en la base de datos.');
    return json(404, { error: 'No se encontraron productos en la base de datos.' });
  }

  // 3) Cargar plantilla de prompt (configurable desde Settings)
  let template = DEFAULT_PROMPT_TEMPLATE;
  try {
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'prompt_template')
      .maybeSingle();
    if (setting?.value && typeof setting.value === 'string') template = setting.value;
  } catch {}

  // 4) Construir prompt
  const productsBlock = buildProductsBlock(rows);
  const prompt = template
    .replace('{PRODUCTS}', productsBlock)
    .replace('{N}', String(rows.length));

  // Guardar el prompt usado (para referencia) y mantener estado 'generating'
  await supabase.from('bodegones').update({ prompt_usado: prompt }).eq('ref', ref);

  // 5) Descargar imágenes de referencia (vía Storage público)
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

  // 6) Llamar a Gemini — probamos cada modelo con varias configs hasta dar con la buena
  const FN_VERSION = 'v3-2026-05-09';
  console.log(`[Gemini] generate-bodegon ${FN_VERSION} · modelos a probar:`, MODEL_FALLBACKS);

  const parts = [{ text: prompt }];
  for (const img of refImages) parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });

  // Variantes simplificadas: la API v1 no acepta responseModalities, así que solo v1beta.
  const REQUEST_VARIANTS = [
    { name: 'v1beta + responseModalities[IMAGE]', apiVersion: 'v1beta', body: { contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'] } } },
    { name: 'v1beta + responseModalities[TEXT,IMAGE]', apiVersion: 'v1beta', body: { contents: [{ parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } } },
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

    // Detectar el caso más común: cuota agotada (limit: 0 = no hay billing)
    const quotaIssue = allErrors.some(e =>
      /quota|exceed/i.test(e.error || '') && /limit:\s*0/i.test(e.error || '')
    );

    let msg;
    if (quotaIssue) {
      msg =
        'Tu API key de Google no tiene cuota para generar imágenes (limit: 0).\n\n' +
        'Los modelos de imagen de Gemini NO están en el tier gratuito. Tienes que activar facturación:\n\n' +
        '1. Ve a https://aistudio.google.com/app/apikey\n' +
        '2. Click en tu proyecto → "Set up Billing" (o ve a https://console.cloud.google.com/billing).\n' +
        '3. Vincula una tarjeta y un proyecto Cloud.\n' +
        '4. Activa la "Generative Language API" en ese proyecto.\n' +
        '5. Vuelve aquí y prueba.\n\n' +
        'Coste aproximado: ~$0.04/imagen con Gemini 3 Pro · ~$0.01/imagen con Flash. ' +
        'Para 100 bodegones al mes con Pro = ~$4 USD.';
    } else {
      const detail = allErrors.map(e => `• ${e.model} [${e.variant}]: ${e.error}`).join('\n');
      msg = `[${FN_VERSION}] Ningún modelo de Gemini consiguió generar la imagen.\n\nDetalle:\n${detail}`;
      if (availableImageModels.length) {
        msg += `\n\nModelos disponibles en tu API key: ${availableImageModels.join(', ')}.`;
      }
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
    await markFailed(supabase, ref, 'Storage: ' + upErr.message);
    return json(500, { error: 'Error guardando imagen: ' + upErr.message });
  }

  // 8) Marcar como 'draft' (generación lista, esperando que el usuario pulse "Guardar en historial")
  await supabase
    .from('bodegones')
    .update({ estado: 'draft', imagen_path: path })
    .eq('ref', ref);

  // En background functions Netlify NO entrega esta respuesta al cliente — el
  // frontend hace polling sobre la fila de Supabase. Devolvemos OK por completitud.
  return json(200, { ok: true, ref, image_path: path });
};

async function markFailed(supabase, ref, msg) {
  try {
    await supabase
      .from('bodegones')
      .update({ estado: 'failed', error_mensaje: msg })
      .eq('ref', ref);
  } catch (e) {
    console.error('No se pudo marcar como failed:', e);
  }
}

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
