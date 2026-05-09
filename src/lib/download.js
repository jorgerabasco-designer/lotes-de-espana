// Descarga forzada de un fichero. El atributo `download` del <a> no funciona
// con URLs cross-origin (Supabase Storage), así que primero descargamos el
// fichero en memoria y luego creamos un blob URL local.

export async function downloadFile(url, filename) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`No se pudo descargar (${res.status})`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || 'descarga';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

// Reescala una imagen a una calidad/tamaño concreto y descarga el resultado.
// quality: 0..1 · maxSide: número máximo de px del lado mayor (null = original).
export async function downloadImageWithQuality(url, filename, { quality = 0.92, maxSide = null, format = 'image/jpeg' } = {}) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`No se pudo descargar (${res.status})`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);

  let { width, height } = bitmap;
  if (maxSide && Math.max(width, height) > maxSide) {
    const ratio = maxSide / Math.max(width, height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // Fondo blanco para JPG (no admite transparencia)
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  const out = await new Promise(resolve => canvas.toBlob(resolve, format, quality));
  if (!out) throw new Error('No se pudo procesar la imagen.');
  const blobUrl = URL.createObjectURL(out);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  return { width, height, size: out.size };
}
