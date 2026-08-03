// fitWebImage.js — procesa una imagen en el navegador: 700×800, fondo blanco,
// sin recortar, centrada, orientación EXIF respetada. Salida JPEG optimizado.
// Formatos: jpg/png/webp. TIFF no soportado (el navegador no lo decodifica).
//
// Regla de negocio: NUNCA se sube una foto de lote que no esté exactamente a
// 700×800. Toda subida de la sección PDFs Web pasa por aquí.

export const TARGET_W = 700;
export const TARGET_H = 800;
const BG = '#ffffff';
const DEFAULT_QUALITY = 0.9;
const SUPPORTED_MIME = /^image\/(jpeg|png|webp)$/i;
const TIFF_HINT = /\.tiff?$/i;

export class FitWebImageError extends Error {
  constructor(message, code) { super(message); this.name = 'FitWebImageError'; this.code = code; }
}

export async function fitWebImage(file, opts = {}) {
  const quality = opts.quality ?? DEFAULT_QUALITY;

  if (!file || !file.type?.startsWith('image/')) {
    if (file && TIFF_HINT.test(file.name || '')) {
      throw new FitWebImageError('Los archivos TIFF (.tif) no se pueden procesar en el navegador. Convierte la imagen a JPG o PNG antes de subirla.', 'tiff');
    }
    throw new FitWebImageError('El archivo no es una imagen válida.', 'not-image');
  }
  if (TIFF_HINT.test(file.name || '') || /tiff/i.test(file.type)) {
    throw new FitWebImageError('Los archivos TIFF (.tif) no se pueden procesar en el navegador. Convierte la imagen a JPG o PNG antes de subirla.', 'tiff');
  }
  if (!SUPPORTED_MIME.test(file.type)) {
    throw new FitWebImageError(`Formato no soportado (${file.type}). Sube la imagen en JPG, PNG o WEBP.`, 'unsupported');
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    throw new FitWebImageError('No se pudo abrir la imagen. Puede estar dañada.', 'decode');
  }

  const { width: srcW, height: srcH } = bitmap;
  const scale = Math.min(TARGET_W / srcW, TARGET_H / srcH);
  const drawW = Math.max(1, Math.round(srcW * scale));
  const drawH = Math.max(1, Math.round(srcH * scale));
  const dx = Math.floor((TARGET_W - drawW) / 2);
  const dy = Math.floor((TARGET_H - drawH) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_W; canvas.height = TARGET_H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = BG; ctx.fillRect(0, 0, TARGET_W, TARGET_H);
  ctx.drawImage(bitmap, dx, dy, drawW, drawH);
  if (bitmap.close) bitmap.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new FitWebImageError('No se pudo generar la imagen final.', 'decode'))), 'image/jpeg', quality);
  });

  const outName = ensureJpgName(opts.name || file.name || 'imagen.jpg');
  const outFile = new File([blob], outName, { type: 'image/jpeg' });
  return { file: outFile, width: TARGET_W, height: TARGET_H, originalSize: file.size, newSize: blob.size };
}

function ensureJpgName(name) {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.jpg`;
}
