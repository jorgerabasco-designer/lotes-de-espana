// Composición de bodegones: maqueta (layout) + imágenes de referencia.
//
// Por qué existe este fichero:
//   Gemini 3 Pro admite como mucho ~6 imágenes de referencia en alta fidelidad
//   (14 como tope absoluto). Antes mandábamos UNA FOTO POR PRODUCTO, así que un
//   lote de 20 productos se pasaba de largo del límite: el modelo empezaba a
//   inventar etiquetas, duplicar unidades y equivocarse de tamaños.
//
//   Solución: en vez de N fotos sueltas mandamos 2 imágenes montadas aquí:
//     · BLUEPRINT     → la maqueta: cada producto recortado, en su sitio y a su
//                       tamaño real. Le dice al modelo DÓNDE va cada cosa.
//     · CONTACT SHEET → rejilla con todos los productos a buen tamaño, en el
//                       mismo orden que la lista del prompt. Le dice QUÉ es cada
//                       cosa (etiquetas legibles).
//   Y además hasta 4 fotos sueltas de los productos protagonistas.
//
//   Las fotos del catálogo tienen fondo transparente, así que ya son recortes:
//   se pueden componer como capas sin más.
//
// El layout se guarda en la BD para que se pueda volver a editar:
//   { version, canvas:{w,h}, items:[{ sku, x, y, w, h, rot, z }] }
// Las coordenadas van normalizadas 0..1 (x,y = esquina superior izquierda) para
// no depender de la resolución con la que se pinte.

export const LAYOUT_VERSION = 1;

// Lienzo de referencia 4:3 (el mismo aspect ratio que pedimos a Gemini).
export const CANVAS_W = 2048;
export const CANVAS_H = 1536;

// Líneas de suelo de cada altura, en fracción del alto del lienzo.
const BASELINE = { TRASERA: 0.80, MEDIA: 0.90, DELANTERA: 0.985 };
// Cuánto del ancho del lienzo puede ocupar una fila como máximo.
const ROW_MAX_W = 0.94;
// El producto más alto ocupará esta fracción del alto del lienzo.
const TALLEST_FRAC = 0.60;

// ---------- helpers de imagen ----------

// Carga una imagen sin "manchar" el canvas (via blob + object URL), para que
// luego se pueda exportar con toBlob(). Devuelve null si falla.
export async function loadImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const img = await new Promise((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);
    return img;
  } catch {
    return null;
  }
}

// Carga una imagen ya en memoria (data URL), sin pasar por fetch.
function loadImageSrc(src) {
  return new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = src;
  });
}

// Quita el fondo blanco de una foto.
//
// Casi todo el catálogo viene recortado con transparencia, pero unas cuantas
// fotos traen el fondo pintado de blanco: en el editor se veían como cajas
// blancas tapando a los productos de detrás.
//
// Solo se borra el blanco que TOCA EL BORDE (relleno por inundación desde los
// cuatro lados). Así un producto blanco, o una etiqueta blanca en mitad de la
// foto, no se tocan nunca.
// Devuelve un data URL, o null si no había fondo que quitar.
const KEY_MAX_SIDE = 1000;
const KEY_WHITE = 234;   // a partir de aquí se considera blanco de fondo
export function keyWhiteBackground(img) {
  const scale = Math.min(1, KEY_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.max(1, Math.round(img.naturalWidth * scale));
  const H = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);

  let imgData;
  try { imgData = ctx.getImageData(0, 0, W, H); }
  catch { return null; }
  const d = imgData.data;

  const isBg = (i) => d[i + 3] > 10 && d[i] >= KEY_WHITE && d[i + 1] >= KEY_WHITE && d[i + 2] >= KEY_WHITE;

  const seen = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const p = y * W + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (isBg(p * 4)) stack.push(p);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }

  let removed = 0;
  while (stack.length) {
    const p = stack.pop();
    d[p * 4 + 3] = 0;
    removed++;
    const x = p % W, y = (p / W) | 0;
    push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
  }
  if (removed < W * H * 0.02) return null; // no había fondo blanco que valga

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

// ¿Es un jamón o una paleta? Las familias 07 (paletas) y 08 (jamones) del
// código RP lo dicen sin ambigüedad. Van en diagonal, con la pezuña a la
// derecha, y son mucho más grandes que el resto.
export function isJamon(p) {
  const sku = String(p?.sku || '');
  return /^0[78]/.test(sku) || p?.cat === 'jamones';
}

// Tamaño con el que el producto se ve de frente, en cm. Las medidas del
// catálogo ya están guardadas "tal y como se expone" (un jamón es 20 de alto
// × 80 de ancho porque está tumbado), así que se usan tal cual.
function realSize(p) {
  const w = Number(p?.w) || 10;
  const h = Number(p?.h) || 10;
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

// Altura visual dominante: para piezas alargadas y tumbadas (jamón) manda el
// lado largo, no el alto. Se usa para ordenar por protagonismo.
export function visualProminence(p) {
  const { w, h } = realSize(p);
  return Math.max(w, h);
}

function tierOf(p) {
  if (isJamon(p)) return 'DELANTERA';
  const explicit = String(p?.posicion || '').toUpperCase();
  if (['TRASERA', 'MEDIA', 'DELANTERA'].includes(explicit)) return explicit;
  const { h } = realSize(p);
  if (h >= 24) return 'TRASERA';
  if (h >= 10) return 'MEDIA';
  return 'DELANTERA';
}

// ---------- auto-layout ----------

// Resolución de la máscara con la que se mide el recorte y se acierta el clic.
export const MASK = 120;

// Mide una foto: proporción, cuánto aire transparente tiene por cada lado y la
// máscara de opacidad.
//
// El aire importa: las fotos del catálogo son 500×600 con el producto centrado
// y mucho margen vacío. Si se ignora, los productos salen separados entre sí y
// más pequeños de lo que les toca (el margen cuenta como si fuera producto).
function measureImage(img) {
  const c = document.createElement('canvas');
  c.width = MASK; c.height = MASK;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, MASK, MASK);
  let data;
  try { data = ctx.getImageData(0, 0, MASK, MASK).data; }
  catch { return { ratio: img.naturalWidth / img.naturalHeight, trim: { l: 0, r: 0, t: 0, b: 0 }, mask: null }; }

  const ALPHA = 12;
  let minX = MASK, maxX = -1, minY = MASK, maxY = -1;
  for (let y = 0; y < MASK; y++) {
    for (let x = 0; x < MASK; x++) {
      if (data[(y * MASK + x) * 4 + 3] > ALPHA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  // Foto opaca (JPEG sin alfa) o vacía → sin recorte.
  const trim = (maxX < 0 || (minX === 0 && minY === 0 && maxX === MASK - 1 && maxY === MASK - 1))
    ? { l: 0, r: 0, t: 0, b: 0 }
    : {
        l: minX / MASK,
        r: (MASK - 1 - maxX) / MASK,
        t: minY / MASK,
        b: (MASK - 1 - maxY) / MASK,
      };
  return { ratio: img.naturalWidth / img.naturalHeight, trim, mask: data };
}

// Map sku → { ratio, trim, mask, src }. Una sola pasada de carga por producto.
// `src` es la foto ya lista para pintar: si traía fondo blanco, se le ha
// quitado, así que en el editor y en la maqueta todo va recortado.
export async function loadMetrics(products) {
  const out = new Map();
  await Promise.all((products || []).map(async (p) => {
    if (!p?.img || out.has(p.sku)) return;
    const original = await loadImage(p.img);
    if (!original?.naturalWidth) return;
    let img = original;
    let src = p.img;
    const keyed = keyWhiteBackground(original);
    if (keyed) {
      const kimg = await loadImageSrc(keyed);
      if (kimg?.naturalWidth) { img = kimg; src = keyed; }
    }
    out.set(p.sku, { ...measureImage(img), src });
  }));
  return out;
}

const NO_TRIM = { l: 0, r: 0, t: 0, b: 0 };
const metricOf = (m, sku) => m?.get(sku) || null;

// Cómo hay que dibujar un producto, en cm.
//
// Dos reglas:
//   · Su lado MÁS LARGO visible se lleva su medida real más larga, y el otro
//     sale de la proporción de la foto. Así nunca se deforma y las piezas
//     alargadas (un jamón de 80 cm) salen realmente grandes — antes se deducía
//     el ancho a partir del alto y el jamón acababa del tamaño de una botella.
//   · Lo que mide es el PRODUCTO, no la foto: se descuenta el aire transparente
//     del recorte, así que la caja se agranda para compensarlo.
//
// Devuelve { box, vis, trim }: caja completa (con aire) y parte visible, en cm.
function drawSizeCm(p, metrics) {
  const { w, h } = realSize(p);
  const m = metricOf(metrics, p.sku);
  const trim = m?.trim || NO_TRIM;
  const ratio = (m?.ratio && isFinite(m.ratio) && m.ratio > 0) ? m.ratio : (w / h);
  const fx = Math.max(0.05, 1 - trim.l - trim.r); // fracción visible a lo ancho
  const fy = Math.max(0.05, 1 - trim.t - trim.b); // fracción visible a lo alto
  const visRatio = (ratio * fx) / fy;
  const longest = Math.max(w, h);
  let vw, vh;
  if (visRatio >= 1) { vw = longest; vh = longest / visRatio; }
  else { vh = longest; vw = longest * visRatio; }

  // Freno de seguridad: ninguna dimensión puede pasarse más de un 30% de su
  // medida real. Protege del caso en que la foto esté en otra orientación que
  // las medidas de la ficha (p. ej. medidas de pieza tumbada con foto de pie),
  // que si no dispara el tamaño del producto.
  const MAX_OVER = 1.3;
  const k = Math.min(1, (w * MAX_OVER) / vw, (h * MAX_OVER) / vh);
  vw *= k; vh *= k;

  const vis = { w: vw, h: vh };
  return { box: { w: vis.w / fx, h: vis.h / fy }, vis, trim };
}

// Coloca los productos en tres alturas (trasera / media / delantera) usando sus
// medidas reales, de forma parecida a como se monta una cesta de verdad.
// `entries` = [{ product, qty }] — cada unidad se coloca por separado.
// `metrics` (opcional) = medidas de las fotos (loadMetrics), para no deformar
// nada y para descontar el aire de los recortes.
export function autoLayout(entries, metrics) {
  const units = [];
  for (const { product, qty } of entries) {
    for (let i = 0; i < (qty || 1); i++) units.push(product);
  }
  if (!units.length) return { version: LAYOUT_VERSION, canvas: { w: CANVAS_W, h: CANVAS_H }, items: [] };

  const sizeCm = new Map(units.map(u => [u, drawSizeCm(u, metrics)]));

  // Escala global: el producto más alto ocupa TALLEST_FRAC del alto del lienzo.
  // Se mide por su parte VISIBLE. Los jamones quedan fuera del cálculo: son
  // largos, no altos, y si entraran aplastarían al resto de la composición.
  const forScale = units.filter(u => !isJamon(u));
  const tallestCm = Math.max(...(forScale.length ? forScale : units).map(u => sizeCm.get(u).vis.h), 1);
  const pxPerCm = (CANVAS_H * TALLEST_FRAC) / tallestCm;

  const rows = { TRASERA: [], MEDIA: [], DELANTERA: [] };
  const jamones = [];
  for (const u of units) {
    if (isJamon(u)) jamones.push(u);
    else rows[tierOf(u)].push(u);
  }

  // Dentro de cada fila, los más altos hacia el centro queda más natural.
  for (const key of Object.keys(rows)) {
    rows[key].sort((a, b) => sizeCm.get(b).vis.h - sizeCm.get(a).vis.h);
    rows[key] = centerWeighted(rows[key]);
  }

  const items = [];
  let z = 0;
  for (const tier of ['TRASERA', 'MEDIA', 'DELANTERA']) {
    const list = rows[tier];
    if (!list.length) continue;

    // Todo el reparto se hace con el ANCHO VISIBLE: si se usara el de la caja,
    // el aire de los recortes dejaría huecos entre productos.
    const sizes = list.map(p => {
      const { box, vis, trim } = sizeCm.get(p);
      return {
        p, trim,
        boxW: box.w * pxPerCm, boxH: box.h * pxPerCm,
        visW: vis.w * pxPerCm,
      };
    });

    const OVERLAP = tier === 'TRASERA' ? 0.04 : 0.10; // solape lateral
    let total = sizes.reduce((s, it) => s + it.visW, 0) * (1 - OVERLAP);
    const maxW = CANVAS_W * ROW_MAX_W;
    const shrink = total > maxW ? maxW / total : 1;
    total *= shrink;

    let x = (CANVAS_W - total) / 2;   // x = borde izquierdo VISIBLE del siguiente
    const baseY = CANVAS_H * BASELINE[tier];

    for (const { p, trim, boxW, boxH, visW } of sizes) {
      const bw = boxW * shrink;
      const bh = boxH * shrink;
      // Colocar la caja de forma que el producto visible quede pegado a `x` y
      // apoyado en la línea de suelo.
      items.push({
        sku: p.sku,
        x: (x - trim.l * bw) / CANVAS_W,
        y: (baseY - bh * (1 - trim.b)) / CANVAS_H,
        w: bw / CANVAS_W,
        h: bh / CANVAS_H,
        rot: 0,
        z: z++,
      });
      x += visW * shrink * (1 - OVERLAP);
    }
  }

  // Los jamones van aparte: en diagonal, al frente y a la derecha, que es como
  // los monta el cliente. Si entraran en el flujo de la fila delantera (miden
  // 80 cm) empujarían todo lo demás a los extremos.
  jamones.forEach((p, i) => {
    const { box, vis } = sizeCm.get(p);
    let dw = box.w * pxPerCm;
    let dh = box.h * pxPerCm;
    // Que no se coma el encuadre: como mucho media anchura de lienzo visible.
    const maxVis = CANVAS_W * 0.50;
    const visW = vis.w * pxPerCm;
    if (visW > maxVis) { const k = maxVis / visW; dw *= k; dh *= k; }
    items.push({
      sku: p.sku,
      x: (CANVAS_W * (0.50 + i * 0.06) - dw / 2) / CANVAS_W,
      y: (CANVAS_H * 0.90 - dh / 2) / CANVAS_H,
      w: dw / CANVAS_W,
      h: dh / CANVAS_H,
      rot: -28,        // diagonal con la pezuña arriba a la derecha
      z: 900 + i,      // por delante de todo
    });
  });

  return { version: LAYOUT_VERSION, canvas: { w: CANVAS_W, h: CANVAS_H }, items };
}

// Reordena [a,b,c,d,e] → [d,b,a,c,e]: los primeros (más altos) al centro.
function centerWeighted(list) {
  const out = [];
  list.forEach((item, i) => {
    if (i % 2 === 0) out.push(item);
    else out.unshift(item);
  });
  return out;
}

// ---------- render ----------

// Pinta la maqueta a un canvas y devuelve un Blob JPEG.
// `products` = catálogo (para resolver la imagen de cada sku).
export async function renderBlueprint(layout, products, opts = {}) {
  const metrics = opts.metrics || null;
  const scale = opts.scale || 1;
  const W = Math.round((layout?.canvas?.w || CANVAS_W) * scale);
  const H = Math.round((layout?.canvas?.h || CANVAS_H) * scale);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const bySku = new Map((products || []).map(p => [p.sku, p]));
  const items = [...(layout?.items || [])].sort((a, b) => (a.z || 0) - (b.z || 0));

  // Cargamos cada imagen una sola vez aunque el producto se repita.
  const urls = new Map();
  for (const it of items) {
    const p = bySku.get(it.sku);
    if (urls.has(it.sku)) continue;
    // Preferimos la versión sin fondo blanco que dejó loadMetrics.
    const src = metricOf(metrics, it.sku)?.src || p?.img;
    if (src) urls.set(it.sku, src.startsWith('data:') ? loadImageSrc(src) : loadImage(src));
  }
  const loaded = new Map();
  for (const [sku, promise] of urls) loaded.set(sku, await promise);

  for (const it of items) {
    const img = loaded.get(it.sku);
    if (!img) continue;
    // El ALTO manda (sale de las medidas en cm) y el ancho se deduce de la
    // proporción real de la foto: así el producto nunca se deforma y se pinta
    // exactamente igual que en el editor.
    const dh = it.h * H;
    const dw = dh * (img.naturalWidth / img.naturalHeight);
    const cx = (it.x + it.w / 2) * W;
    const cy = (it.y + it.h / 2) * H;
    ctx.save();
    ctx.translate(cx, cy);
    if (it.rot) ctx.rotate((it.rot * Math.PI) / 180);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  return await canvasToBlob(canvas, 0.92);
}

// Rejilla con todos los productos (uno por celda, sin repetir), en el MISMO
// orden que la lista PRODUCT #N del prompt. Sin texto ni números: cualquier
// texto en una referencia acaba filtrándose a la imagen generada.
export async function renderContactSheet(products, opts = {}) {
  const metrics = opts.metrics || null;
  const list = (products || []).filter(p => p?.img);
  if (!list.length) return null;

  const cell = opts.cell || 512;
  const cols = Math.ceil(Math.sqrt(list.length));
  const rows = Math.ceil(list.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const imgs = await Promise.all(list.map(p => {
    const src = metricOf(metrics, p.sku)?.src || p.img;
    return src.startsWith('data:') ? loadImageSrc(src) : loadImage(src);
  }));
  const PAD = Math.round(cell * 0.06);
  imgs.forEach((img, i) => {
    if (!img) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const box = cell - PAD * 2;
    const ratio = img.naturalWidth / img.naturalHeight;
    let dw = box, dh = box / ratio;
    if (dh > box) { dh = box; dw = box * ratio; }
    ctx.drawImage(img, col * cell + (cell - dw) / 2, row * cell + (cell - dh) / 2, dw, dh);
  });

  return await canvasToBlob(canvas, 0.92);
}

// Encaja una imagen de proporción `ratio` dentro de una caja, sin deformarla.
export function fitContain(box, ratio) {
  if (!ratio || !isFinite(ratio)) return { w: box.w, h: box.h };
  let w = box.w;
  let h = w / ratio;
  if (h > box.h) { h = box.h; w = h * ratio; }
  return { w, h };
}

// Ajusta el ancho de cada caja a la proporción REAL de su foto, manteniendo el
// alto (que es el que sale de las medidas en cm) y el centro. Así la caja y la
// foto tienen la misma proporción: la foto la llena entera sin deformarse y el
// producto se ve exactamente a la altura que le toca.
export function normalizeLayoutToImages(layout, metrics) {
  if (!layout?.items) return layout;
  const items = layout.items.map(it => {
    const ratio = metricOf(metrics, it.sku)?.ratio;
    if (!ratio || !isFinite(ratio)) return { ...it };
    const cx = it.x + it.w / 2;
    // El alto manda; el ancho se deduce de la proporción de la foto. Como el
    // lienzo no es cuadrado hay que pasar por píxeles para no sesgar el ratio.
    const hPx = it.h * CANVAS_H;
    const wPx = hPx * ratio;
    const w = wPx / CANVAS_W;
    return { ...it, w, x: cx - w / 2 };
  });
  return { ...layout, items };
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(b => resolve(b), 'image/jpeg', quality);
  });
}
