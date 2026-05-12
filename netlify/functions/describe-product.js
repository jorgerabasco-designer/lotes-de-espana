// Netlify Function — Genera una descripción visual en inglés de una foto de producto.
// Endpoint: POST /api/describe-product
//   body: { foto_path } o { image: base64, mimeType }
//   returns: { description: "..." }
//
// Variables de entorno requeridas:
//   GEMINI_API_KEY
//   SUPABASE_URL  (para poder descargar imágenes por foto_path)
//
// Usa Gemini Flash (~50× más barato que Pro y suficiente para texto desde imagen).

const PROMPT = `Describe this product photo in 1 sentence in English (max 30 words).
Focus on: packaging type (bottle / box / tin / jar), dominant colours, label design (text, illustrations, logos), and any distinctive feature. Be concrete and specific.
Example output: "dark glass bottle with vibrant purple label, yellow sun graphic, and purple cap".
Do NOT add commentary, do NOT mention the product name, do NOT use the word "product". Output the description text only.`;

const MODEL = process.env.GEMINI_DESCRIBE_MODEL || 'gemini-2.5-flash';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Método no permitido. Usa POST.' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return json(500, { error: 'Falta GEMINI_API_KEY en las variables de entorno de Netlify.' });
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

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiKey}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType: mimeType || 'image/png', data: image } },
          ],
        }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 120,
        },
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      return json(500, { error: `Gemini ${r.status}: ${j?.error?.message || 'error'}` });
    }
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      return json(500, { error: 'Gemini no devolvió texto. ' + (j?.candidates?.[0]?.finishReason || '') });
    }
    // Limpiar comillas iniciales/finales si las trae
    const clean = text.replace(/^["']+|["']+$/g, '').trim();
    return json(200, { description: clean });
  } catch (e) {
    return json(500, { error: 'Error contactando con Gemini: ' + (e.message || e) });
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
