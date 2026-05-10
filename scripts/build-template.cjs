/* eslint-disable */
// Genera la plantilla Excel para importación masiva de productos.
// Ejecutar: node scripts/build-template.cjs
// Salida:   public/plantilla-productos.xlsx

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'plantilla-productos.xlsx');

const C = {
  ink: 'FF2D2A26',
  inkLight: 'FF5B554C',
  muted: 'FF8B8375',
  accent: 'FFA74D4A',
  olive: 'FF2F4A3D',
  paper: 'FFFAFAF7',
  bg: 'FFF5F1E8',
  beige: 'FFEAE3D6',
  line: 'FFE6DED2',
  white: 'FFFFFFFF',
};

(async () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lotes de España · Studio';
  wb.created = new Date();
  wb.modified = new Date();

  // ============================================================
  // HOJA 1: Productos
  // ============================================================
  const sh = wb.addWorksheet('Productos', {
    properties: { defaultRowHeight: 22, tabColor: { argb: C.accent } },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4, showGridLines: false }],
  });

  // Definición de columnas
  const cols = [
    { key: 'ref', header: 'Referencia (RP) *', width: 16, example: '07VR221' },
    { key: 'nombre', header: 'Nombre *', width: 38, example: 'Cava Brut Reserva Carta Nevada' },
    { key: 'marca', header: 'Marca *', width: 22, example: 'Freixenet' },
    { key: 'categoria', header: 'Categoría *', width: 16, example: 'vinos' },
    { key: 'alto', header: 'Alto (cm) *', width: 12, example: 30 },
    { key: 'ancho', header: 'Ancho (cm) *', width: 12, example: 8 },
    { key: 'fondo', header: 'Fondo (cm) *', width: 12, example: 8 },
    { key: 'posicion', header: 'Posición sugerida', width: 18, example: 'TRASERA' },
    { key: 'tags', header: 'Etiquetas (separadas por coma)', width: 32, example: 'con-alcohol' },
    { key: 'descripcion_visual', header: 'Descripción visual (inglés, para IA)', width: 56, example: 'Dark glass bottle with silver label, classic Cava design' },
    { key: 'notas', header: 'Notas internas', width: 32, example: 'Botella clásica, etiqueta brillante' },
  ];

  // -- Banda título (fila 1) --
  sh.mergeCells(1, 1, 1, cols.length);
  const title = sh.getCell(1, 1);
  title.value = 'LOTES DE ESPAÑA · Plantilla de importación de productos';
  title.font = { name: 'Cambria', size: 16, bold: false, color: { argb: C.ink } };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.bg } };
  sh.getRow(1).height = 32;

  // -- Subtítulo / instrucciones (fila 2) --
  sh.mergeCells(2, 1, 2, cols.length);
  const subtitle = sh.getCell(2, 1);
  subtitle.value =
    'Rellena una fila por producto. Los campos marcados con * son obligatorios. ' +
    'Las referencias deben tener el formato 2 dígitos + 2 letras + 3 dígitos (p.ej. 03TC316). Borra la fila de ejemplo antes de importar.';
  subtitle.font = { name: 'Calibri', size: 10, italic: true, color: { argb: C.muted } };
  subtitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  sh.getRow(2).height = 32;

  // -- Fila 3 vacía (separador) --
  sh.getRow(3).height = 8;

  // -- Cabeceras (fila 4) --
  cols.forEach((c, i) => {
    const cell = sh.getCell(4, i + 1);
    cell.value = c.header;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.olive } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
    cell.border = {
      top:    { style: 'thin', color: { argb: C.olive } },
      bottom: { style: 'medium', color: { argb: C.olive } },
      left:   { style: 'thin', color: { argb: C.olive } },
      right:  { style: 'thin', color: { argb: C.olive } },
    };
    sh.getColumn(i + 1).width = c.width;
  });
  sh.getRow(4).height = 36;

  // -- Fila 5: ejemplo (gris claro, en cursiva) --
  cols.forEach((c, i) => {
    const cell = sh.getCell(5, i + 1);
    cell.value = c.example;
    cell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: C.muted } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.paper } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: C.line } },
      left:   { style: 'thin', color: { argb: C.line } },
      right:  { style: 'thin', color: { argb: C.line } },
    };
  });
  sh.getRow(5).height = 24;

  // -- Filas vacías (6 a 200) con borde claro para que sean obvias dónde escribir --
  for (let r = 6; r <= 200; r++) {
    cols.forEach((_, i) => {
      const cell = sh.getCell(r, i + 1);
      cell.border = {
        bottom: { style: 'hair', color: { argb: C.line } },
        left:   { style: 'hair', color: { argb: C.line } },
        right:  { style: 'hair', color: { argb: C.line } },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: false };
      cell.font = { name: 'Calibri', size: 10, color: { argb: C.ink } };
    });
    sh.getRow(r).height = 22;
  }

  // -- Validaciones de datos --
  // Categorías (lista desplegable)
  const cats = ['vinos', 'aceites', 'turrones', 'conservas', 'galletas', 'snacks', 'dulces'];
  for (let r = 5; r <= 200; r++) {
    sh.getCell(r, 4).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${cats.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Categoría no válida',
      error: `Usa una de: ${cats.join(', ')}`,
    };
  }

  // Posición sugerida
  const positions = ['TRASERA', 'MEDIA', 'DELANTERA', ''];
  for (let r = 5; r <= 200; r++) {
    sh.getCell(r, 8).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${positions.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Posición no válida',
      error: 'Usa: TRASERA, MEDIA, DELANTERA o déjalo vacío para auto.',
    };
  }

  // Numéricos (alto/ancho/fondo)
  for (let r = 5; r <= 200; r++) {
    [5, 6, 7].forEach(col => {
      sh.getCell(r, col).dataValidation = {
        type: 'decimal',
        operator: 'greaterThan',
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: 'Valor no válido',
        error: 'Debe ser un número positivo (en cm).',
      };
      sh.getCell(r, col).numFmt = '0.0';
    });
  }

  // ============================================================
  // HOJA 2: Instrucciones
  // ============================================================
  const inst = wb.addWorksheet('Instrucciones', {
    properties: { defaultRowHeight: 22, tabColor: { argb: C.olive } },
    views: [{ showGridLines: false }],
  });

  inst.getColumn(1).width = 4;
  inst.getColumn(2).width = 34;
  inst.getColumn(3).width = 80;

  // Cabecera grande
  inst.mergeCells(1, 1, 1, 3);
  const ih = inst.getCell(1, 1);
  ih.value = 'Cómo rellenar la plantilla';
  ih.font = { name: 'Cambria', size: 22, color: { argb: C.ink } };
  ih.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  inst.getRow(1).height = 50;

  inst.mergeCells(2, 1, 2, 3);
  const isub = inst.getCell(2, 1);
  isub.value =
    'Esta plantilla es la forma rápida de añadir muchos productos a la vez. Una vez rellena, arrástrala a la web junto a las fotos de los productos (con la referencia como nombre del archivo).';
  isub.font = { name: 'Calibri', size: 11, italic: true, color: { argb: C.muted } };
  isub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  inst.getRow(2).height = 50;

  // Encabezado de tabla
  const setCellStyle = (c, fill, font) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    c.font = font;
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  };

  let row = 4;
  setCellStyle(inst.getCell(row, 2), C.olive, { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } });
  inst.getCell(row, 2).value = 'CAMPO';
  setCellStyle(inst.getCell(row, 3), C.olive, { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } });
  inst.getCell(row, 3).value = 'DESCRIPCIÓN';
  inst.getRow(row).height = 28;
  row++;

  const fields = [
    ['Referencia (RP) *', 'Código único interno. Formato exacto: 2 dígitos + 2 letras + 3 dígitos. Ejemplos: 03TC316, 06AC044, 11VR021.'],
    ['Nombre *', 'Nombre comercial del producto. Ejemplo: "Bardos Viñedos de Altura".'],
    ['Marca *', 'Marca del producto. Ejemplo: "Bardos", "NOS", "Picó".'],
    ['Categoría *', 'Una de: vinos, aceites, turrones, conservas, galletas, snacks, dulces. (Hay desplegable.)'],
    ['Alto · Ancho · Fondo *', 'Dimensiones reales en centímetros. Importantísimo: la IA mantiene la proporción real entre productos en el bodegón.'],
    ['Posición sugerida', 'Opcional. TRASERA (alto, fondo), MEDIA (mediano), DELANTERA (bajo, primer plano). Si lo dejas vacío, la app lo decide por la altura.'],
    ['Etiquetas', 'Opcional. Separadas por comas. Ejemplos: "vegano, bio", "sin-gluten", "con-alcohol".'],
    ['Descripción visual', 'En inglés. Una frase describiendo cómo se ve la foto. Ejemplo: "dark glass bottle with white capsule and white label showing winter trees illustrations". Cuanto más precisa, mejor genera la IA.'],
    ['Notas internas', 'Apuntes opcionales para uso interno. La IA también los recibe como contexto.'],
  ];

  fields.forEach(([k, v], i) => {
    const isEven = i % 2 === 0;
    const fill = isEven ? C.paper : C.white;
    setCellStyle(inst.getCell(row, 2), fill, { name: 'Calibri', size: 10, bold: true, color: { argb: C.ink } });
    inst.getCell(row, 2).value = k;
    setCellStyle(inst.getCell(row, 3), fill, { name: 'Calibri', size: 10, color: { argb: C.inkLight } });
    inst.getCell(row, 3).value = v;
    inst.getRow(row).height = 38;
    row++;
  });

  // Sección "Fotos"
  row += 1;
  inst.mergeCells(row, 1, row, 3);
  const photosTitle = inst.getCell(row, 1);
  photosTitle.value = 'Fotos de los productos';
  photosTitle.font = { name: 'Cambria', size: 16, color: { argb: C.ink } };
  photosTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  inst.getRow(row).height = 36;
  row += 1;

  const photoNotes = [
    'Cuando arrastres esta plantilla a la web, puedes arrastrar también todas las fotos de los productos al mismo tiempo.',
    'IMPORTANTE: el nombre de cada foto debe ser exactamente la referencia del producto + extensión. Ejemplos: 03TC316.png, 06AC044.jpg, 07VR221.png.',
    'Los formatos válidos son: PNG, JPG, JPEG, WEBP.',
    'Recomendado: PNG con fondo transparente o blanco, alta resolución.',
    'Si un producto no tiene foto, se subirá igualmente, pero NO se podrá incluir en bodegones hasta que le subas una imagen desde la pestaña Productos.',
    'La web detecta automáticamente qué referencias ya tienes en tu catálogo y solo importa las nuevas.',
  ];

  photoNotes.forEach((note, i) => {
    inst.mergeCells(row, 2, row, 3);
    const c = inst.getCell(row, 2);
    c.value = `•  ${note}`;
    c.font = { name: 'Calibri', size: 10.5, color: { argb: C.inkLight } };
    c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
    inst.getRow(row).height = note.length > 90 ? 38 : 24;
    row++;
  });

  // Guardar
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await wb.xlsx.writeFile(OUT);
  const stat = fs.statSync(OUT);
  console.log('OK ·', OUT, '·', (stat.size / 1024).toFixed(1), 'KB');
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
