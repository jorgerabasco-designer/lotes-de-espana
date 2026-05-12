/* eslint-disable */
// Genera la guía de fotografía para subida de productos.
// Ejecutar: node scripts/build-photo-guide.cjs
// Salida:   public/guia-fotografia.pdf

const path = require('path');
const fs = require('fs');

// jsPDF en Node
const { jsPDF } = require('jspdf');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'guia-fotografia.pdf');
const LOGO = path.join(ROOT, 'public', 'logo.png');

// Paleta
const C = {
  ink:    [45, 42, 38],
  ink2:   [91, 85, 76],
  muted:  [139, 131, 117],
  accent: [167, 77, 74],
  olive:  [47, 74, 61],
  paper:  [245, 241, 232],
  line:   [230, 222, 210],
  green:  [58, 122, 90],
};

const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
const W = doc.internal.pageSize.getWidth();
const H = doc.internal.pageSize.getHeight();
const M = 18; // margen

// ---------- Helpers ----------
function setColor(rgb)   { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }
function setFill(rgb)    { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
function setDraw(rgb)    { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); }
function font(name, style='normal') { doc.setFont(name, style); }
function size(pt)        { doc.setFontSize(pt); }

function eyebrow(label, y) {
  font('helvetica', 'bold'); size(8.5); setColor(C.muted);
  doc.text(label, M, y, { baseline: 'alphabetic' });
}
function h1(text, y) {
  font('times', 'normal'); size(28); setColor(C.ink);
  doc.text(text, M, y, { baseline: 'alphabetic' });
}
function h2(text, y) {
  font('times', 'normal'); size(17); setColor(C.ink);
  doc.text(text, M, y, { baseline: 'alphabetic' });
}
function body(text, x, y, maxW = W - M*2, opts = {}) {
  font('helvetica', opts.bold ? 'bold' : 'normal');
  size(opts.size || 10.5);
  setColor(opts.color || C.ink2);
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, x, y, { baseline: 'alphabetic', lineHeightFactor: 1.45 });
  return y + lines.length * (opts.lineH || 5.4);
}
function rule(y, full=false) {
  setDraw(C.line);
  doc.setLineWidth(0.25);
  doc.line(full ? 0 : M, y, full ? W : W - M, y);
}

function bullet(text, x, y, opts = {}) {
  setFill(opts.color || C.olive);
  doc.circle(x + 1.4, y - 1.4, 0.95, 'F');
  return body(text, x + 5.5, y, W - M - x - 6, { size: 10.5, color: C.ink2 });
}

function checkItem(text, x, y) {
  setDraw(C.olive);
  doc.setLineWidth(0.4);
  // Recuadro check
  doc.roundedRect(x, y - 4, 4.5, 4.5, 0.6, 0.6, 'S');
  return body(text, x + 8, y, W - M - x - 9, { size: 10.5, color: C.ink });
}

// ============================================================
// PÁGINA 1: PORTADA + INTRO + FORMATO Y RESOLUCIÓN + FONDO
// ============================================================

// Banda crudo superior
setFill(C.paper);
doc.rect(0, 0, W, 22, 'F');

// Texto cabecera
font('helvetica', 'bold'); size(11); setColor(C.ink);
doc.text('LOTES DE ESPAÑA', M, 12);
font('helvetica', 'normal'); size(7.5); setColor(C.muted);
doc.text('Studio · Guía de uso', M, 17);

font('helvetica', 'normal'); size(7.5); setColor(C.muted);
doc.text('FOTOGRAFÍA DE PRODUCTO', W - M, 12, { align: 'right' });
font('helvetica', 'normal'); size(8.5); setColor(C.ink2);
doc.text('v1 · 2026', W - M, 17, { align: 'right' });

rule(22);

// Título (sin logo en la cabecera — pendiente de SVG en alta resolución)
let y = 22 + 18 + (28 * 0.353);
h1('Guía de fotografía', y);
y += 12;

// Subtítulo
font('times', 'italic'); size(13); setColor(C.muted);
doc.text('Cómo preparar las imágenes para conseguir bodegones perfectos', M, y);
y += 14;

// Intro destacada
setFill([250, 250, 247]);
doc.roundedRect(M, y - 2, W - M*2, 22, 2, 2, 'F');
y += 5;
y = body(
  'La calidad de un bodegón generado con IA depende, sobre todo, de la calidad de las fotos de origen. ' +
  'Esta guía resume las recomendaciones para que cada producto rinda al máximo. Si las fotos cumplen estos ' +
  'criterios, la IA reproducirá las etiquetas con fidelidad y compondrá lotes profesionales.',
  M + 4, y, W - M*2 - 8, { size: 10, color: C.ink2 }
);
y += 8;

// SECCIÓN 1: Formato y resolución
eyebrow('1', y); h2('Formato y resolución', y + 7);
y += 14;
y = bullet('PNG (preferido si el fondo es transparente) o JPG / WEBP de alta calidad.', M, y);
y = bullet('Resolución mínima: 1.500 px en el lado mayor del producto.', M, y);
y = bullet('Resolución recomendada: 2.000–3.000 px. La IA usa todo el detalle disponible.', M, y);
y = bullet('Peso: la app optimiza la imagen al subirla (resolución y peso), tú no te preocupes.', M, y);
y += 4;

// SECCIÓN 2: Fondo
eyebrow('2', y); h2('Fondo', y + 7);
y += 14;
y = bullet('Ideal: fondo BLANCO puro o transparente. Es lo que mejor encaja con el bodegón.', M, y);
y = bullet('Evita fondos de cocina, mesa de madera, mantel, paja, hojas o cualquier textura.', M, y);
y = bullet('Si la foto original tiene fondo: recorta el producto con removebg.com (gratis y rápido) antes de subirla.', M, y);
y = bullet('La sombra original tampoco hace falta: la IA aplica su propia sombra de estudio en el bodegón.', M, y);
y += 6;

// SECCIÓN 3: Encuadre
eyebrow('3', y); h2('Encuadre y ángulo', y + 7);
y += 14;
y = bullet('Producto centrado y completo (sin recortes). Mejor que sobre un poco de aire alrededor.', M, y);
y = bullet('Ángulo frontal, con la etiqueta principal mirando directamente a cámara.', M, y);
y = bullet('Sin perspectivas extremas, sin foto picada ni contrapicada.', M, y);
y = bullet('Todos los productos del catálogo, en el mismo tipo de ángulo. Da coherencia al bodegón.', M, y);

// ============================================================
// PÁGINA 2: ILUMINACIÓN, ETIQUETA, CALIDAD, NOMBRE
// ============================================================
doc.addPage();

setFill(C.paper);
doc.rect(0, 0, W, 22, 'F');
font('helvetica', 'bold'); size(11); setColor(C.ink);
doc.text('LOTES DE ESPAÑA', M, 12);
font('helvetica', 'normal'); size(7.5); setColor(C.muted);
doc.text('Studio · Guía de uso', M, 17);
font('helvetica', 'normal'); size(7.5); setColor(C.muted);
doc.text('FOTOGRAFÍA DE PRODUCTO · 2', W - M, 12, { align: 'right' });
font('helvetica', 'normal'); size(8.5); setColor(C.ink2);
doc.text('Página 2', W - M, 17, { align: 'right' });
rule(22);

y = 36;

// SECCIÓN 4: Iluminación
eyebrow('4', y); h2('Iluminación', y + 7);
y += 14;
y = bullet('Luz blanda y uniforme. Lo ideal: junto a una ventana con luz natural difusa o en estudio.', M, y);
y = bullet('Evita sombras duras, brillos quemados y reflejos del flash.', M, y);
y = bullet('Sin tinte de color: nada de luz amarilla de bombilla ni azul de pantalla. El blanco tiene que verse blanco.', M, y);
y = bullet('Si tienes que retocar, equilibra el balance de blancos antes de subir la imagen.', M, y);
y += 6;

// SECCIÓN 5: Etiqueta
eyebrow('5', y); h2('Etiqueta y logos', y + 7);
y += 14;
y = bullet('La etiqueta debe verse NÍTIDA y legible en la foto original.', M, y);
y = bullet('Si la etiqueta sale borrosa, ondulada o reflejada, la IA tendrá problemas para replicarla.', M, y);
y = bullet('Productos con dos caras (delantera y trasera): usa siempre la cara con el logo principal.', M, y);
y = bullet('Si hay sello de DO, BIO, premios o medallas, deben quedar visibles. Son detalles importantes para la marca.', M, y);
y += 6;

// SECCIÓN 6: Calidad técnica
eyebrow('6', y); h2('Calidad técnica', y + 7);
y += 14;
y = bullet('Foto enfocada en todo el producto (no solo en la etiqueta).', M, y);
y = bullet('Sin ruido, sin pixelación, sin granulado.', M, y);
y = bullet('Sin filtros de Instagram, sin viñetas, sin marcos. La foto debe ser limpia.', M, y);
y = bullet('Si usas el móvil, fotografía en horizontal y con la mejor cámara (trasera, no selfie).', M, y);
y += 6;

// SECCIÓN 7: Nombre del archivo
eyebrow('7', y); h2('Nombre del archivo', y + 7);
y += 14;
y = bullet('El archivo de cada producto debe llamarse igual que su REFERENCIA (RP).', M, y);
y = bullet('Ejemplo: el producto con referencia 03TC316 se llama 03TC316.png (mayúsculas, sin espacios).', M, y);
y = bullet('Esto permite a la web emparejar automáticamente cada foto con su producto al subir en lote.', M, y);
y = bullet('Si el archivo no se llama así, el sistema no lo asociará y la foto no se asignará a ningún producto.', M, y);

// ============================================================
// PÁGINA 3: CHECKLIST + EJEMPLOS DE BUENO / MALO
// ============================================================
doc.addPage();

setFill(C.paper);
doc.rect(0, 0, W, 22, 'F');
font('helvetica', 'bold'); size(11); setColor(C.ink);
doc.text('LOTES DE ESPAÑA', M, 12);
font('helvetica', 'normal'); size(7.5); setColor(C.muted);
doc.text('Studio · Guía de uso', M, 17);
font('helvetica', 'normal'); size(7.5); setColor(C.muted);
doc.text('FOTOGRAFÍA DE PRODUCTO · 3', W - M, 12, { align: 'right' });
font('helvetica', 'normal'); size(8.5); setColor(C.ink2);
doc.text('Página 3', W - M, 17, { align: 'right' });
rule(22);

y = 36;

eyebrow('CHECKLIST', y); h2('Antes de subir, comprueba que…', y + 7);
y += 16;

const checks = [
  'La foto está enfocada y bien iluminada.',
  'El producto se ve entero, sin recortes.',
  'El fondo es blanco o transparente (sin mesas, manteles, cocinas).',
  'La etiqueta principal mira a cámara y se lee claramente.',
  'No hay reflejos, brillos ni sombras duras.',
  'No tiene filtros, viñetas ni marcos decorativos.',
  'La resolución es al menos 1.500 px en el lado mayor.',
  'El archivo se llama igual que la referencia del producto (ej. 03TC316.png).',
];

checks.forEach((c) => {
  y = checkItem(c, M, y);
  y += 5;
});

y += 6;

// Sección de buenas vs malas prácticas
eyebrow('RESUMEN VISUAL', y); h2('Hazlo así · No lo hagas así', y + 7);
y += 16;

// Tabla de buenas / malas
const colW = (W - M*2 - 8) / 2;

setFill([249, 247, 240]);
doc.roundedRect(M, y - 4, colW, 64, 2, 2, 'F');
setFill([252, 247, 247]);
doc.roundedRect(M + colW + 8, y - 4, colW, 64, 2, 2, 'F');

font('helvetica', 'bold'); size(10); setColor(C.green);
doc.text('✓  SÍ', M + 5, y + 2);
font('helvetica', 'bold'); size(10); setColor(C.accent);
doc.text('✕  NO', M + colW + 13, y + 2);

const yes = [
  'Fondo blanco puro',
  'Botella o caja centrada',
  'Etiqueta nítida y de frente',
  'Luz natural difusa',
  'Foto a 2.000 px o más',
  'Archivo: 03TC316.png',
];
const no = [
  'Fondo de cocina, mesa, paja',
  'Producto inclinado o cortado',
  'Etiqueta torcida o borrosa',
  'Flash directo o foto en penumbra',
  'Capturas de Instagram',
  'Archivo: WhatsApp_Image_2024.jpg',
];

let yyL = y + 10;
yes.forEach((t) => {
  font('helvetica', 'normal'); size(9); setColor(C.ink);
  doc.text('•  ' + t, M + 5, yyL);
  yyL += 7;
});

let yyR = y + 10;
no.forEach((t) => {
  font('helvetica', 'normal'); size(9); setColor(C.ink2);
  doc.text('•  ' + t, M + colW + 13, yyR);
  yyR += 7;
});

y += 76;

// Cierre
y += 4;
setFill(C.paper);
doc.roundedRect(M, y - 4, W - M*2, 24, 2, 2, 'F');
font('times', 'italic'); size(12); setColor(C.ink2);
const closeLines = doc.splitTextToSize(
  'Si tienes dudas con alguna foto concreta, súbela igualmente: la app marcará automáticamente los productos sin foto adecuada y podrás reemplazarla más adelante. Una buena base de fotos es la inversión que más rendimiento da en los bodegones.',
  W - M*2 - 8
);
doc.text(closeLines, M + 4, y + 4, { baseline: 'alphabetic', lineHeightFactor: 1.5 });

// Pie
const footY = H - 12;
rule(footY - 4);
font('helvetica', 'normal'); size(7.5); setColor(C.muted);
doc.text('lotesdeespana.es', M, footY);
doc.text('Página 3 de 3', W - M, footY, { align: 'right' });

// ============================================================
// Guardar
// ============================================================
const pdfBytes = doc.output('arraybuffer');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(pdfBytes));
const stat = fs.statSync(OUT);
console.log(`OK · ${OUT} · ${(stat.size / 1024).toFixed(1)} KB`);
