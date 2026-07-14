// One-shot: borra todos los ficheros del bucket 'lotes' de Supabase.
// Usar solo cuando el cliente vaya a subir un lote nuevo de fotos que sustituye
// completamente al anterior (ej. temporada 2025 → 2026).
//
// Ejecutar:
//   SUPABASE_URL='...' SUPABASE_KEY='...' node scripts/wipe-lotes.mjs

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL || !KEY) { console.error('✗ Faltan SUPABASE_URL y/o SUPABASE_KEY'); process.exit(1); }
const supa = createClient(URL, KEY, { auth: { persistSession: false } });

const { data, error } = await supa.storage.from('lotes').list('', { limit: 1000 });
if (error) { console.error('list:', error.message); process.exit(1); }
const paths = (data || []).filter(o => o.name && !o.name.startsWith('.')).map(o => o.name);
console.log(`Encontrados ${paths.length} ficheros en bucket 'lotes':`);
paths.slice(0, 5).forEach(p => console.log('  ·', p));
if (paths.length > 5) console.log(`  ... y ${paths.length - 5} más`);
if (!paths.length) { console.log('Ya está vacío.'); process.exit(0); }

const { data: dres, error: derr } = await supa.storage.from('lotes').remove(paths);
if (derr) { console.error('remove:', derr.message); process.exit(1); }
console.log(`\n✓ Borrados ${dres?.length || paths.length} ficheros.`);

const { data: after } = await supa.storage.from('lotes').list('', { limit: 10 });
console.log(`Quedan en el bucket: ${(after || []).length}`);
