// Optimiza imágenes en el navegador antes de subirlas a Supabase.
// - Redimensiona a un máximo de 2048 px de lado mayor (si ya es menor, no toca).
// - Mantiene PNG si la imagen tiene transparencia significativa.
// - Si no, convierte a WebP (cuando el navegador lo soporta) o a JPEG calidad ~0.88.
// - Si la "optimizada" no es más pequeña que la original, devuelve la original.

const DEFAULT_MAX_SIDE = 2048;
const DEFAULT_QUALITY = 0.88;

export async function optimizeImage(file, opts = {}) {
  const max = opts.maxSide ?? DEFAULT_MAX_SIDE;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const noop = { file, originalSize: file.size, newSize: file.size, optimized: false, format: file.type };

  if (!file || !file.type?.startsWith('image/')) return noop;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    console.warn('[optimize] no se pudo decodificar', file.name, e);
    return noop;
  }

  let { width, height } = bitmap;
  const longest = Math.max(width, height);
  if (longest > max) {
    const ratio = max / longest;
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const hasAlpha = await detectAlpha(bitmap);

  let outputType;
  if (hasAlpha) {
    outputType = 'image/png';
  } else if (await supportsWebp()) {
    outputType = 'image/webp';
  } else {
    outputType = 'image/jpeg';
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });

  if (outputType === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (bitmap.close) bitmap.close();

  const blob = await new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      outputType,
      outputType === 'image/png' ? undefined : quality,
    );
  });

  if (!blob) return noop;

  // Si la versión optimizada es prácticamente igual o mayor (margen 5%), descartar.
  if (blob.size >= file.size * 0.95) {
    return noop;
  }

  const newName = changeExt(file.name, extFromMime(outputType));
  const newFile = new File([blob], newName, { type: outputType });

  return {
    file: newFile,
    originalSize: file.size,
    newSize: blob.size,
    optimized: true,
    format: outputType,
  };
}

function changeExt(filename, newExt) {
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return `${base}.${newExt}`;
}

function extFromMime(mime) {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  return 'bin';
}

async function detectAlpha(bitmap) {
  // Renderizar a una versión pequeña y comprobar si hay píxeles con alpha < 250.
  const c = document.createElement('canvas');
  const max = 64;
  const ratio = Math.min(max / bitmap.width, max / bitmap.height, 1);
  c.width = Math.max(1, Math.round(bitmap.width * ratio));
  c.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = c.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  let data;
  try {
    data = ctx.getImageData(0, 0, c.width, c.height).data;
  } catch {
    return false;
  }
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}

let _webpCache = null;
async function supportsWebp() {
  if (_webpCache !== null) return _webpCache;
  try {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    _webpCache = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    _webpCache = false;
  }
  return _webpCache;
}

export function formatBytes(b) {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}
