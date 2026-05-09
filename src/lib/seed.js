// Datos demo cargables a Supabase desde el botón "Importar productos demo"
// (Configuración → Acerca de). Las imágenes están en /public/seed.

export const SEED_PRODUCTS = [
  {
    sku: '03TC316',
    file: '/seed/03TC316.png',
    name: 'Bardos Viñedos de Altura',
    brand: 'Bardos',
    cat: 'vinos',
    h: 30, w: 8, d: 8,
    posicion: 'TRASERA',
    descripcion_visual: 'dark glass bottle with white capsule and white label showing bare winter tree illustrations, Ribera del Duero DO',
    notas: 'Etiqueta blanca con árboles. DO Ribera del Duero.',
    tags: ['con-alcohol'],
  },
  {
    sku: '06AC044',
    file: '/seed/06AC044.jpg',
    name: 'NOS Everyday Aceite de Oliva Virgen Extra',
    brand: 'NOS',
    cat: 'aceites',
    h: 24, w: 5, d: 5,
    posicion: 'TRASERA',
    descripcion_visual: 'dark glass bottle with vibrant purple label, yellow sun graphic, purple cap',
    notas: 'Etiqueta morada vibrante con sol amarillo.',
    tags: ['bio', 'vegano'],
  },
  {
    sku: '04JI002',
    file: '/seed/04JI002.png',
    name: 'Picó Turrón de Jijona Calidad Suprema',
    brand: 'Picó',
    cat: 'turrones',
    h: 9, w: 18.5, d: 2.2,
    posicion: 'DELANTERA',
    descripcion_visual: 'flat rectangular cardboard box, landscape orientation, burgundy "PICÓ" lettering and craftsman illustration',
    notas: 'Caja horizontal apaisada. Colocar tumbada en primer plano.',
    tags: ['sin-gluten'],
  },
  {
    sku: '05BO127',
    file: '/seed/05BO127.png',
    name: 'Cudié Catanias Original',
    brand: 'Cudié',
    cat: 'turrones',
    h: 16, w: 8.5, d: 3,
    posicion: 'MEDIA',
    descripcion_visual: 'tall narrow vertical cardboard box with photographic image of cocoa-dusted almonds on the front',
    notas: 'Caja vertical alta. Imagen de almendras en la cara.',
    tags: ['sin-gluten'],
  },
  {
    sku: '05GA043',
    file: '/seed/05GA043.jpg',
    name: 'Lady Joseph Artisan Vegan Biscuits Chocolate Filled',
    brand: 'Lady Joseph',
    cat: 'snacks',
    h: 15, w: 6.4, d: 6.4,
    posicion: 'MEDIA',
    descripcion_visual: 'square vertical cardboard box, mustard yellow with green botanical illustrations of cocoa pods and leaves, white central label',
    notas: 'Caja amarillo mostaza con ilustraciones botánicas.',
    tags: ['vegano'],
  },
  {
    sku: '06CP103',
    file: '/seed/06CP103.png',
    name: 'Emperatriz Bonito del Norte en AOVE Bio',
    brand: 'Emperatriz',
    cat: 'conservas',
    h: 6.8, w: 11, d: 3,
    posicion: 'DELANTERA',
    descripcion_visual: 'flat rectangular tin in landscape orientation, watercolor illustrations of fish and green olives around navy central label with gold lettering',
    notas: 'Lata apaisada. Etiqueta con peces y olivas en acuarela.',
    tags: ['bio', 'sin-gluten'],
  },
  {
    sku: '06FS069',
    file: '/seed/06FS069.png',
    name: 'Finca La Rosala Almendra Marcona AOVE & Sal',
    brand: 'Finca La Rosala',
    cat: 'snacks',
    h: 6, w: 6, d: 6,
    posicion: 'DELANTERA',
    descripcion_visual: 'small cube glass jar with black metal lid and green spoon-shaped tag-style label hanging from the lid, roasted Marcona almonds visible inside',
    notas: 'Tarro de cristal pequeño. Etiqueta verde tipo cuchara.',
    tags: ['vegano', 'sin-gluten', 'bio'],
  },
];

import { uploadProductPhoto, upsertProduct } from './api.js';

export async function importSeedProducts({ onProgress } = {}) {
  let done = 0;
  for (const p of SEED_PRODUCTS) {
    onProgress && onProgress({ done, total: SEED_PRODUCTS.length, current: p.sku });
    const res = await fetch(p.file);
    if (!res.ok) throw new Error(`No se pudo descargar la imagen ${p.file}`);
    const blob = await res.blob();
    const filename = p.file.split('/').pop();
    const file = new File([blob], filename, { type: blob.type });
    const path = await uploadProductPhoto(file, p.sku);
    await upsertProduct({ ...p, foto_path: path });
    done++;
    onProgress && onProgress({ done, total: SEED_PRODUCTS.length, current: p.sku });
  }
  return done;
}
