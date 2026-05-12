// Netlify Function — Genera una descripción visual en inglés de una foto de producto.
// Endpoint: POST /api/describe-product
//   body: { foto_path } o { image: base64, mimeType }
//   returns: { description: "..." }
//
// Variables de entorno requeridas:
//   ANTHROPIC_API_KEY  (consola.anthropic.com → API Keys)
//   SUPABASE_URL       (para poder descargar imágenes por foto_path)
//
// Variables opcionales:
//   CLAUDE_DESCRIBE_MODEL  (por defecto claude-haiku-4-5)
//
// Usa Claude (Anthropic) porque su visión es notablemente mejor que Gemini Flash
// para descripciones detalladas de packaging.

const MODEL = process.env.CLAUDE_DESCRIBE_MODEL || 'claude-haiku-4-5';

const PROMPT = `You are a product photo analyst for a Spanish gourmet catalog. Look at the attached product photo and describe it in ONE detailed sentence in English (max 40 words).

Cover, in this order:
1. Package type and shape (jar, bottle, can, box, tin, pouch, pot, etc.)
2. Material and dominant colours of the package
3. Label design: brand name (if visible), illustrations, typography style
4. Visible contents through transparent parts (if any)
5. Distinctive elements (cap, lid, capsule, seal, ribbon, sticker, hanging tag)

Examples of the expected style and level of detail:
- "dark glass bottle with vibrant purple label, yellow sun graphic, purple metal cap, and embossed branding on the shoulder"
- "flat rectangular tin in landscape orientation, watercolour illustrations of fish and green olives around a navy central label with gold lettering"
- "small cube glass jar with black metal lid and green spoon-shaped tag-style label hanging from the lid, roasted Marcona almonds visible inside"
- "tall narrow rectangular cardboard box, mustard yellow with green botanical illustrations of cocoa pods and leaves, and a white central label"

Rules:
- Output ONLY the description text — no preamble, no markdown, no quotes, no ending period if not needed.
- Be specific. Use exact colours, shapes, and label words you can read.
- Do not use the word "product" itself.
- Do not describe lighting or background.`;

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Método no permitido. Usa POST.' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return json(500, {
      error:
        'Falta ANTHROPIC_API_KEY en Netlify. Crea una en console.anthropic.com → API Keys y añádela en Site settings → Environment variables.',
    });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON inválido' }); }

  let { image, mimeType, foto_path } = body;

  // Si nos dan foto_path, descargar la imagen del bucket público de Supabase
  if (!image && foto_path) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      return json(500, { error: 'Falta SUPABASE_URL en las variables de entorno.' });
    }
    const imageUrl = `${supabaseUrl}/storage/v1/object/public/productos/${foto_path}`;
    try {
      const r = await fetch(imageUrl);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      image = buf.toString('base64');
      mimeType = r.headers.get('content-type') || 'image/png';
    } catch (e) {
      return json(500, { error: 'No se pudo descargar la foto desde Storage: ' + (e.message || e) });
    }
  }

  if (!image) {
    return json(400, { error: 'Falta la imagen del producto (image en base64 o foto_path).' });
  }

  // Claude no acepta image/jpg → image/jpeg
  let mediaType = (mimeType || 'image/png').toLowerCase();
  if (mediaType === 'image/jpg') mediaType = 'image/jpeg';
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mediaType)) {
    mediaType = 'image/png';
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });

    const j = await r.json();
    if (!r.ok) {
      const msg = j?.error?.message || `HTTP ${r.status}`;
      return json(500, { error: `Claude ${r.status}: ${msg}` });
    }

    const text = j?.content?.[0]?.text?.trim();
    if (!text) {
      return json(500, { error: 'Claude no devolvió texto. ' + (j?.stop_reason || '') });
    }

    // Limpiar comillas, saltos múltiples, puntos finales sueltos
    const clean = text
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return json(200, { description: clean, model: MODEL });
  } catch (e) {
    return json(500, { error: 'Error contactando con Anthropic: ' + (e.message || e) });
  }
};

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
