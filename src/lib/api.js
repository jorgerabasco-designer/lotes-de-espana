import { supabase, SUPABASE_READY, STORAGE_BUCKET_PRODUCTS, publicUrl } from './supabase.js';

// Datos de ejemplo cuando todavía no hay Supabase configurado.
// Esto permite que la web funcione localmente para diseñar / hacer demos.
const SEED_PRODUCTS = [
  { sku:'03TC316', name:'Bardos Viñedos de Altura', brand:'Bardos', desc:'Ribera del Duero D.O. — Tempranillo', cat:'vinos', h:30, w:8, d:8, img:'/seed/03TC316.png', tags:['con-alcohol'], used:42, posicion:'TRASERA', tipo_envase:'botella vidrio oscuro', color:'black and white' },
  { sku:'04JI002', name:'Turrón de Jijona Picó', brand:'Picó', desc:'Calidad Suprema 200g', cat:'turrones', h:9, w:18.5, d:2.2, img:'/seed/04JI002.png', tags:['sin-gluten'], used:31, posicion:'DELANTERA', tipo_envase:'caja cartón rectangular plana', color:'white and burgundy' },
  { sku:'05BO127', name:'Catanias Cudié Original', brand:'Cudié', desc:'Almendra recubierta de chocolate', cat:'turrones', h:16, w:8.5, d:3, img:'/seed/05BO127.png', tags:['sin-gluten'], used:28, posicion:'MEDIA', tipo_envase:'caja cartón vertical estrecha', color:'white and black' },
  { sku:'05GA043', name:'Lady Joseph Biscuits', brand:'Lady Joseph', desc:'Artisan Vegan · Chocolate Filled', cat:'snacks', h:15, w:6.4, d:6.4, img:'/seed/05GA043.jpg', tags:['vegano'], used:17, posicion:'MEDIA', tipo_envase:'caja cartón vertical cuadrada', color:'mustard yellow and green' },
  { sku:'06AC044', name:'AOVE NOS Everyday', brand:'NOS', desc:'Aceite de Oliva Virgen Extra · 500ml', cat:'aceites', h:24, w:5, d:5, img:'/seed/06AC044.jpg', tags:['bio','vegano'], used:54, posicion:'TRASERA', tipo_envase:'botella vidrio oscuro', color:'purple and yellow' },
  { sku:'06CP103', name:'Bonito del Norte Emperatriz', brand:'Emperatriz', desc:'En AOVE Bio · MSC · 115g', cat:'conservas', h:6.8, w:11, d:3, img:'/seed/06CP103.png', tags:['bio','sin-gluten'], used:22, posicion:'DELANTERA', tipo_envase:'lata rectangular plana', color:'white and navy blue' },
  { sku:'06FS069', name:'Almendra Marcona AOVE & Sal', brand:'Finca La Rosala', desc:'Tarro cristal 150g', cat:'snacks', h:6, w:6, d:6, img:'/seed/06FS069.png', tags:['vegano','sin-gluten','bio'], used:14, posicion:'DELANTERA', tipo_envase:'tarro cristal con tapa negra', color:'clear glass with green' },
];

function rowToProduct(row) {
  return {
    sku: row.ref,
    name: row.nombre,
    brand: row.marca,
    cat: row.categoria_id || mapLegacyCat(row.categoria),
    desc: row.descripcion || '',
    h: Number(row.alto || 0),
    w: Number(row.ancho || 0),
    d: Number(row.fondo || 0),
    posicion: row.posicion || null,
    descripcion_visual: row.descripcion_visual || '',
    notas: row.notas || '',
    img: row.foto_path ? publicUrl(STORAGE_BUCKET_PRODUCTS, row.foto_path) : '',
    foto_path: row.foto_path || null,
    tags: row.tags || [],
    used: row.used_count || 0,
    updated_at: row.updated_at || null,
    created_at: row.created_at || null,
  };
}

function productToRow(p) {
  return {
    ref: p.sku,
    nombre: p.name,
    marca: p.brand,
    categoria_id: p.cat,
    categoria: p.cat,
    descripcion: p.desc || null,
    alto: Number(p.h),
    ancho: Number(p.w),
    fondo: Number(p.d),
    posicion: p.posicion || null,
    descripcion_visual: p.descripcion_visual || null,
    notas: p.notas || null,
    foto_path: p.foto_path || null,
    tags: p.tags || [],
  };
}

function mapLegacyCat(cat) {
  if (!cat) return 'otros';
  const c = cat.toLowerCase();
  if (c.includes('vino')) return 'vinos';
  if (c.includes('aceite')) return 'aceites';
  if (c.includes('turr')) return 'turrones';
  if (c.includes('conserva')) return 'conservas';
  if (c.includes('galleta')) return 'galletas';
  if (c.includes('dulce')) return 'dulces';
  if (c.includes('snack') || c.includes('frut')) return 'snacks';
  return c.replace(/\s+/g, '-');
}

export async function listProducts() {
  if (!SUPABASE_READY) return SEED_PRODUCTS;
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const products = (data || []).map(rowToProduct);

  // Calcular 'used' dinámicamente: cuántas veces aparece cada SKU en los
  // bodegones guardados en el historial (estado='completed'). Más fiable
  // que llevar un contador manualmente.
  try {
    const { data: bods } = await supabase
      .from('bodegones')
      .select('productos')
      .eq('estado', 'completed');
    if (bods && bods.length) {
      const usage = {};
      for (const b of bods) {
        for (const sku of (b.productos || [])) {
          usage[sku] = (usage[sku] || 0) + 1;
        }
      }
      for (const p of products) {
        p.used = usage[p.sku] || 0;
      }
    }
  } catch (e) {
    console.warn('No se pudo calcular uso de productos en bodegones:', e);
  }

  return products;
}

export async function upsertProduct(product) {
  if (!SUPABASE_READY) return product;
  const row = productToRow(product);
  const { data, error } = await supabase.from('products').upsert(row).select().single();
  if (error) throw error;
  return rowToProduct(data);
}

export async function deleteProduct(sku) {
  if (!SUPABASE_READY) return true;
  const { error } = await supabase.from('products').delete().eq('ref', sku);
  if (error) throw error;
  return true;
}

export async function uploadProductPhoto(file, sku) {
  if (!SUPABASE_READY) return URL.createObjectURL(file);
  if (!file) throw new Error('No hay archivo de imagen seleccionado.');
  if (!sku) throw new Error('Falta la referencia (RP) del producto.');

  // Sanitizar referencia (sólo letras, números, _ y -). Evita errores 400 de Storage.
  const cleanSku = String(sku).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!cleanSku) throw new Error(`Referencia "${sku}" no válida. Usa solo letras y números.`);

  const rawExt = (file.name?.split('.').pop() || 'png').toLowerCase();
  const ext = rawExt.replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${cleanSku}.${ext}`;

  // Log detallado: si algo falla, en DevTools → Console verás el detalle.
  console.log('[Storage] Subiendo:', { bucket: STORAGE_BUCKET_PRODUCTS, path, size: file.size, type: file.type || 'unknown' });

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET_PRODUCTS)
    .upload(path, file, { upsert: true, contentType: file.type || 'image/png' });

  if (error) {
    console.error('[Storage] Error completo:', error);
    const msg = String(error.message || error.error || '').toLowerCase();
    if (msg.includes('bucket') && (msg.includes('not found') || msg.includes('no encontrado'))) {
      throw new Error('El bucket "productos" no existe en tu Supabase. Ve a Supabase → SQL Editor → pega y ejecuta supabase/schema.sql.');
    }
    if (msg.includes('row') && msg.includes('policy')) {
      throw new Error('Permisos insuficientes en el bucket "productos". Vuelve a ejecutar supabase/schema.sql para arreglar las policies.');
    }
    if (msg.includes('invalid path')) {
      throw new Error(`Supabase rechazó la ruta "${path}". El bucket "productos" probablemente no existe o no es público. Revisa Supabase → Storage.`);
    }
    throw new Error(error.message || 'Error desconocido subiendo la imagen.');
  }

  console.log('[Storage] OK:', data);
  return path;
}

// ---------- BODEGONES ----------
function rowToBodegon(row) {
  return {
    id: row.ref,
    n: row.numero,
    title: row.nombre || `Bodegón IA #${row.numero}`,
    description: row.descripcion || '',
    skus: row.productos || [],
    image: row.imagen_path
      ? publicUrl('bodegones', row.imagen_path)
      : null,
    image_path: row.imagen_path,
    estado: row.estado,
    created_at: row.created_at,
  };
}

export async function listBodegones() {
  if (!SUPABASE_READY) return [];
  // Solo bodegones que el usuario haya guardado al historial (estado 'completed').
  const { data, error } = await supabase
    .from('bodegones')
    .select('*')
    .eq('estado', 'completed')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToBodegon);
}

// Promueve un bodegón en estado 'draft' a 'completed' (lo añade al historial)
export async function commitBodegon(ref, patch = {}) {
  if (!SUPABASE_READY) return null;
  const { data, error } = await supabase
    .from('bodegones')
    .update({ ...patch, estado: 'completed' })
    .eq('ref', ref)
    .select()
    .single();
  if (error) throw error;
  return rowToBodegon(data);
}

// Borra un bodegón y, si tiene imagen, su fichero en Storage.
export async function discardBodegon(ref) {
  if (!SUPABASE_READY) return true;
  const { data: row } = await supabase
    .from('bodegones')
    .select('imagen_path')
    .eq('ref', ref)
    .maybeSingle();
  if (row?.imagen_path) {
    await supabase.storage.from('bodegones').remove([row.imagen_path]).catch(() => {});
  }
  await supabase.from('bodegones').delete().eq('ref', ref);
  return true;
}

// Vacía completamente la tabla de bodegones (con sus imágenes).
export async function clearAllBodegones() {
  if (!SUPABASE_READY) return 0;
  const { data: rows } = await supabase.from('bodegones').select('ref, imagen_path');
  const paths = (rows || []).map(r => r.imagen_path).filter(Boolean);
  if (paths.length) {
    await supabase.storage.from('bodegones').remove(paths).catch(() => {});
  }
  const { error } = await supabase
    .from('bodegones')
    .delete()
    .not('ref', 'is', null);
  if (error) throw error;
  return rows?.length || 0;
}

export async function updateBodegon(id, patch) {
  if (!SUPABASE_READY) return null;
  const { data, error } = await supabase
    .from('bodegones')
    .update(patch)
    .eq('ref', id)
    .select()
    .single();
  if (error) throw error;
  return rowToBodegon(data);
}

export async function deleteBodegon(id) {
  if (!SUPABASE_READY) return true;
  const { error } = await supabase.from('bodegones').delete().eq('ref', id);
  if (error) throw error;
  return true;
}

// ---------- SETTINGS ----------
export async function getSetting(key, fallback = null) {
  if (!SUPABASE_READY) {
    const v = localStorage.getItem(`setting:${key}`);
    return v ? JSON.parse(v) : fallback;
  }
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? fallback;
}

export async function setSetting(key, value) {
  if (!SUPABASE_READY) {
    localStorage.setItem(`setting:${key}`, JSON.stringify(value));
    return value;
  }
  const { error } = await supabase.from('settings').upsert({ key, value });
  if (error) throw error;
  return value;
}

// ---------- DIAGNÓSTICO SUPABASE ----------
export async function diagnoseSupabase() {
  const report = {
    supabaseReady: SUPABASE_READY,
    productsTable: null,
    bodegonesTable: null,
    settingsTable: null,
    bucketProductos: null,
    bucketBodegones: null,
    canUploadTest: null,
  };
  if (!SUPABASE_READY) return report;

  // Tablas
  for (const t of ['products', 'bodegones', 'settings']) {
    try {
      const { error } = await supabase.from(t).select('*', { count: 'exact', head: true });
      report[t === 'products' ? 'productsTable' : t === 'bodegones' ? 'bodegonesTable' : 'settingsTable']
        = error ? `❌ ${error.message}` : '✓ OK';
    } catch (e) {
      report[t === 'products' ? 'productsTable' : t === 'bodegones' ? 'bodegonesTable' : 'settingsTable']
        = `❌ ${e.message}`;
    }
  }

  // Buckets
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
      report.bucketProductos = `❌ ${error.message}`;
      report.bucketBodegones = `❌ ${error.message}`;
    } else {
      const names = (buckets || []).map(b => b.name);
      report.bucketProductos = names.includes('productos') ? '✓ existe' : '❌ no existe';
      report.bucketBodegones = names.includes('bodegones') ? '✓ existe' : '❌ no existe';
    }
  } catch (e) {
    report.bucketProductos = `❌ ${e.message}`;
    report.bucketBodegones = `❌ ${e.message}`;
  }

  // Subida de prueba (un pixel PNG)
  try {
    const tinyPng = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='), c => c.charCodeAt(0));
    const blob = new Blob([tinyPng], { type: 'image/png' });
    const file = new File([blob], 'diagnostic-test.png', { type: 'image/png' });
    const { error } = await supabase.storage.from('productos').upload('__diagnostic-test.png', file, { upsert: true, contentType: 'image/png' });
    if (error) {
      report.canUploadTest = `❌ ${error.message}`;
    } else {
      report.canUploadTest = '✓ OK';
      // Limpiar el archivo de prueba
      await supabase.storage.from('productos').remove(['__diagnostic-test.png']).catch(() => {});
    }
  } catch (e) {
    report.canUploadTest = `❌ ${e.message}`;
  }

  return report;
}

// ---------- DESCRIBE PRODUCT (vía Netlify Function, Gemini Flash) ----------
// Genera una descripción visual en inglés a partir de la foto del producto.
//   Si tienes el archivo en el navegador (aún no subido): pasa { file }
//   Si la foto ya está en Storage: pasa { foto_path }
export async function describeProduct({ file, foto_path } = {}) {
  let body;
  if (file instanceof Blob) {
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    body = { image: base64, mimeType: file.type || 'image/png' };
  } else if (foto_path) {
    body = { foto_path };
  } else {
    throw new Error('Sin foto: pasa "file" o "foto_path".');
  }

  const res = await fetch('/api/describe-product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Error generando descripción');
  return json.description;
}

// ---------- GENERATE BODEGON (Background Function + polling) ----------
//
// La función Netlify es de tipo "background" (15 min de timeout, devuelve 202
// inmediatamente). Por eso aquí:
//  1. Creamos la fila en Supabase (estado='generating')
//  2. Disparamos la función background con la ref
//  3. Hacemos polling sobre la fila hasta que estado pase a 'completed' o 'failed'

function newBodegonRef() {
  const d2 = () => String(Math.floor(Math.random() * 90) + 10);
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const a2 = () => A[Math.floor(Math.random() * 26)] + A[Math.floor(Math.random() * 26)];
  const d3 = () => String(Math.floor(Math.random() * 900) + 100);
  return `${d2()}${a2()}${d3()}`;
}

async function nextBodegonNumber() {
  if (!SUPABASE_READY) return 1;
  const { data } = await supabase
    .from('bodegones')
    .select('numero')
    .order('numero', { ascending: false })
    .limit(1);
  return (data?.[0]?.numero || 0) + 1;
}

export async function startBodegonGeneration({ skus, title, description }) {
  if (!SUPABASE_READY) throw new Error('Supabase no está conectado.');
  if (!Array.isArray(skus) || skus.length === 0) throw new Error('Selecciona al menos un producto.');

  const ref = newBodegonRef();
  const numero = await nextBodegonNumber();
  const finalTitle = title || `Bodegón IA #${numero}`;

  const { error: insErr } = await supabase.from('bodegones').insert({
    ref,
    numero,
    nombre: finalTitle,
    descripcion: description || null,
    productos: skus,
    estado: 'generating',
  });
  if (insErr) throw new Error('No se pudo registrar el bodegón: ' + insErr.message);

  // Disparar la función background. No esperamos al resultado porque Netlify
  // devuelve 202 al instante; el resultado lo veremos al hacer polling.
  fetch('/api/generate-bodegon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref }),
  }).catch(e => console.warn('Trigger background:', e));

  return { id: ref, n: numero, title: finalTitle, description, skus };
}

export async function pollBodegon(ref, { intervalMs = 2500, timeoutMs = 5 * 60 * 1000, onTick } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data, error } = await supabase
      .from('bodegones')
      .select('*')
      .eq('ref', ref)
      .single();
    if (error) throw new Error('Error consultando bodegón: ' + error.message);
    if (!data) throw new Error('Bodegón no encontrado.');

    onTick && onTick(data);
    // 'draft' = generación lista pero aún no guardada en historial.
    // 'completed' = ya guardada (no debería llegar aquí, pero la trataríamos igual).
    if (data.estado === 'draft' || data.estado === 'completed') return rowToBodegon(data);
    if (data.estado === 'failed') throw new Error(data.error_mensaje || 'La generación falló.');

    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('La generación está tardando demasiado. Inténtalo de nuevo más tarde.');
}

// Compatibilidad: API anterior que devolvía el bodegón completo en una sola llamada.
export async function generateBodegon({ skus, title, description }) {
  const created = await startBodegonGeneration({ skus, title, description });
  const result = await pollBodegon(created.id);
  return result;
}
