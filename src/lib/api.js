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
    tipo_envase: row.tipo_envase || '',
    color: row.color_dominante || '',
    posicion: row.posicion || null,
    descripcion_visual: row.descripcion_visual || '',
    notas: row.notas || '',
    img: row.foto_path ? publicUrl(STORAGE_BUCKET_PRODUCTS, row.foto_path) : '',
    foto_path: row.foto_path || null,
    tags: row.tags || [],
    used: row.used_count || 0,
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
    tipo_envase: p.tipo_envase || null,
    color_dominante: p.color || null,
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
  return (data || []).map(rowToProduct);
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
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${sku}.${ext}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET_PRODUCTS)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
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
  const { data, error } = await supabase
    .from('bodegones')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToBodegon);
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

// ---------- GENERATE BODEGON (vía Netlify Function) ----------
export async function generateBodegon({ skus, title, description }) {
  const res = await fetch('/api/generate-bodegon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skus, title, description }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Error generando bodegón');
  return json;
}
