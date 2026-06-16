// "Marcapasos" para Supabase: hace un SELECT trivial cada día para que
// Supabase no pause el proyecto por inactividad (su política de plan
// gratuito es pausar tras 7 días sin actividad).
//
// Programación en netlify.toml → [functions.keep-alive].schedule = "@daily"
//
// Usa las mismas env vars que la función principal (SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY). No hace falta nada extra.

export const handler = async () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('[keep-alive] Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return { statusCode: 500, body: 'Missing env vars' };
  }

  // SELECT ref FROM products LIMIT 1 vía PostgREST. Lightweight (~1 KB) pero
  // suficiente para que Supabase cuente esto como actividad de la base de
  // datos y no marque el proyecto como inactivo.
  try {
    const t0 = Date.now();
    const res = await fetch(`${url}/rest/v1/products?select=ref&limit=1`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const body = await res.text();
      console.error(`[keep-alive] ❌ ${res.status} en ${ms}ms · ${body.slice(0, 200)}`);
      return { statusCode: 502, body: `Supabase ping falló: ${res.status}` };
    }
    console.log(`[keep-alive] ✓ Supabase OK en ${ms}ms · ${new Date().toISOString()}`);
    return { statusCode: 200, body: 'OK' };
  } catch (e) {
    console.error('[keep-alive] excepción:', e.message);
    return { statusCode: 500, body: `Error: ${e.message}` };
  }
};
