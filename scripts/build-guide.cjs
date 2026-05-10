/* eslint-disable */
// Genera la Guía de uso de Lotes de España · Studio en formato .docx
// Ejecutar: node scripts/build-guide.js
// Output:   ./Guia_Lotes_de_Espana.docx

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, PageBreak, Table, TableRow, TableCell,
  WidthType, ShadingType,
} = require('docx');

const ROOT = path.join(__dirname, '..');
const LOGO_PATH = path.join(ROOT, 'public', 'seed', 'logo.png');
const OUT = path.join(ROOT, 'Guia_Lotes_de_Espana.docx');

// ---------- Paleta (alineada con la web) ----------
const C = {
  ink: '2D2A26',
  ink2: '5B554C',
  muted: '8B8375',
  accent: 'A74D4A',
  olive: '2F4A3D',
  paper: 'FAFAF7',
  bg: 'F5F1E8',
  line: 'E6DED2',
};

// ---------- Helpers ----------
const text = (str, opts = {}) => new TextRun({ text: str, ...opts });
const p = (children, opts = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], ...opts });
const space = (size = 200) => new Paragraph({ children: [text('')], spacing: { after: size } });

const h1 = (str) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [text(str)],
  spacing: { before: 480, after: 200 },
  pageBreakBefore: false,
});
const h2 = (str) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  children: [text(str)],
  spacing: { before: 360, after: 160 },
});
const h3 = (str) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  children: [text(str)],
  spacing: { before: 280, after: 120 },
});
const body = (str) => p([text(str)], { spacing: { after: 160 }, alignment: AlignmentType.JUSTIFIED });

// Lista con bullets
const bullet = (str, level = 0) => new Paragraph({
  numbering: { reference: 'bullets', level },
  children: typeof str === 'string'
    ? [text(str)]
    : (Array.isArray(str) ? str : [str]),
  spacing: { after: 80 },
});

// Lista numerada
const step = (str, level = 0) => new Paragraph({
  numbering: { reference: 'steps', level },
  children: typeof str === 'string'
    ? [text(str)]
    : (Array.isArray(str) ? str : [str]),
  spacing: { after: 100 },
});

// Bloque destacado (callout)
const callout = (title, body, color = C.olive) => {
  const border = { style: BorderStyle.SINGLE, size: 4, color };
  const padding = { top: 200, bottom: 200, left: 240, right: 240 };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9360, type: WidthType.DXA },
            borders: { top: border, bottom: border, left: border, right: border },
            shading: { fill: C.paper, type: ShadingType.CLEAR },
            margins: padding,
            children: [
              new Paragraph({
                children: [text(title.toUpperCase(), { bold: true, color, size: 18, characterSpacing: 30 })],
                spacing: { after: 100 },
              }),
              new Paragraph({
                children: Array.isArray(body) ? body : [text(body, { color: C.ink2, size: 22 })],
                spacing: { after: 0 },
              }),
            ],
          }),
        ],
      }),
    ],
  });
};

// Tabla simple de pasos (#, descripción)
const stepsTable = (rows) => {
  const border = { style: BorderStyle.SINGLE, size: 1, color: C.line };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [720, 8640],
    rows: rows.map((row, i) => new TableRow({
      children: [
        new TableCell({
          width: { size: 720, type: WidthType.DXA },
          borders,
          shading: { fill: C.paper, type: ShadingType.CLEAR },
          margins: { top: 140, bottom: 140, left: 120, right: 120 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [text(String(i + 1), { bold: true, color: C.accent, size: 24 })],
          })],
        }),
        new TableCell({
          width: { size: 8640, type: WidthType.DXA },
          borders,
          shading: { fill: 'FFFFFF', type: ShadingType.CLEAR },
          margins: { top: 140, bottom: 140, left: 200, right: 200 },
          children: row.lines.map(line => new Paragraph({
            children: typeof line === 'string'
              ? [text(line, { color: C.ink2, size: 22 })]
              : line,
            spacing: { after: 60 },
          })),
        }),
      ],
    })),
  });
};

const eyebrow = (str) => p([text(str.toUpperCase(), { bold: true, color: C.accent, size: 18, characterSpacing: 40 })], { spacing: { after: 80 } });

// ---------- Logo (en cabecera y portada) ----------
const logoData = fs.readFileSync(LOGO_PATH);

const headerLogo = new Paragraph({
  alignment: AlignmentType.LEFT,
  children: [
    new ImageRun({
      type: 'png',
      data: logoData,
      transformation: { width: 24, height: 24 },
      altText: { title: 'Logo Lotes de España', description: 'Logo Lotes de España', name: 'logo' },
    }),
    text('   '),
    text('LOTES DE ESPAÑA', { bold: true, size: 18, color: C.ink, characterSpacing: 60 }),
    text('  ·  ', { color: C.muted, size: 18 }),
    text('Studio · Guía de uso', { color: C.muted, size: 18, italics: true }),
  ],
});

// ---------- Portada ----------
const cover = [
  new Paragraph({ children: [text('')], spacing: { before: 1200 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: 'png',
        data: logoData,
        transformation: { width: 90, height: 90 },
        altText: { title: 'Logo', description: 'Logo Lotes de España', name: 'logo-portada' },
      }),
    ],
  }),
  new Paragraph({ children: [text('')], spacing: { after: 400 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [text('GUÍA DE USO', { bold: true, color: C.accent, size: 22, characterSpacing: 80 })],
    spacing: { after: 200 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [text('Lotes de España · Studio', { color: C.ink, size: 56, font: 'Cambria' })],
    spacing: { after: 200 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [text(
      'Generador de bodegones IA para tu catálogo de productos gourmet',
      { color: C.muted, size: 24, italics: true }
    )],
    spacing: { after: 600 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      text('Versión 1.0  ·  ', { color: C.muted, size: 20 }),
      text(new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }), { color: C.muted, size: 20 }),
    ],
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ---------- Índice ----------
const tocLine = (n, title) => new Paragraph({
  spacing: { after: 120 },
  children: [
    text(`${n}.`, { bold: true, color: C.accent, size: 22 }),
    text(`   ${title}`, { color: C.ink, size: 22 }),
  ],
});

const toc = [
  eyebrow('Índice'),
  new Paragraph({
    children: [text('Qué hay dentro', { color: C.ink, size: 44, font: 'Cambria' })],
    spacing: { after: 320 },
  }),
  tocLine('01', 'Para qué sirve esta web'),
  tocLine('02', 'Cómo entrar'),
  tocLine('03', 'Conoce el menú lateral'),
  tocLine('04', 'Catálogo'),
  tocLine('05', 'Subir un producto'),
  tocLine('06', 'Importar productos desde Excel'),
  tocLine('07', 'Pantalla "Productos"'),
  tocLine('08', 'Crear un bodegón con IA'),
  tocLine('09', 'Historial'),
  tocLine('10', 'Descargar (JPG y PDF)'),
  tocLine('11', 'Configuración'),
  tocLine('12', 'Buenas prácticas y trucos'),
  tocLine('13', 'Preguntas frecuentes'),
  new Paragraph({ children: [new PageBreak()] }),
];

// ---------- 1. Para qué sirve ----------
const sec1 = [
  eyebrow('Sección 01'),
  h1('Para qué sirve esta web'),
  body(
    'Lotes de España · Studio es una herramienta interna para crear automáticamente fotografías de bodegón (composiciones de productos) usando inteligencia artificial. ' +
    'En lugar de fotografiar manualmente cada combinación de productos para tu catálogo, esta web genera la imagen final en pocos segundos a partir de las fotos individuales de cada producto.'
  ),
  h2('Qué puedes hacer'),
  bullet('Mantener un catálogo digital de productos con foto, marca, dimensiones reales y etiquetas.'),
  bullet('Importar productos masivamente desde un Excel.'),
  bullet('Seleccionar varios productos y generar una imagen tipo "bodegón" (lote) profesional con un solo clic.'),
  bullet('Guardar las composiciones en un historial y volver a usarlas cuando quieras.'),
  bullet('Descargar las imágenes en distintas calidades (web / catálogo / imprenta) o como PDF con descripción.'),
  h2('Quién la usa'),
  body('Esta guía está pensada para cualquier persona del equipo, sin necesidad de conocimientos técnicos. Si sabes navegar por una web normal, sabes usar esto.'),
];

// ---------- 2. Cómo entrar ----------
const sec2 = [
  eyebrow('Sección 02'),
  h1('Cómo entrar'),
  body('La aplicación está disponible 24/7 en cualquier ordenador con conexión a internet. Funciona mejor en pantallas grandes (ordenador o portátil), aunque también es responsive para móvil/tableta.'),
  stepsTable([
    { lines: ['Abre tu navegador (Chrome, Safari, Firefox o Edge actualizado).'] },
    { lines: ['Escribe la URL de la herramienta en la barra de direcciones (te la facilita el administrador del proyecto).'] },
    { lines: ['Listo. La pantalla principal es el Catálogo.'] },
  ]),
  space(200),
  callout('Recomendado', 'Marca la URL como favorito en el navegador para tenerla siempre a mano.'),
];

// ---------- 3. Menú lateral ----------
const sec3 = [
  eyebrow('Sección 03'),
  h1('Conoce el menú lateral'),
  body('A la izquierda tienes siempre 4 pantallas accesibles. Pinchando en cualquiera vas a esa sección.'),
  bullet([
    text('Catálogo · ', { bold: true, color: C.accent }),
    text('vista principal con todos los productos en cards. Aquí seleccionas los que quieres incluir en un bodegón.'),
  ]),
  bullet([
    text('Productos · ', { bold: true, color: C.accent }),
    text('vista en tabla. Útil para gestionar / editar / eliminar productos rápidamente.'),
  ]),
  bullet([
    text('Historial · ', { bold: true, color: C.accent }),
    text('todos los bodegones que has guardado. Puedes verlos, descargarlos o eliminarlos.'),
  ]),
  bullet([
    text('Configuración · ', { bold: true, color: C.accent }),
    text('opciones avanzadas: editar el prompt de la IA, gestionar categorías y etiquetas.'),
  ]),
  space(200),
  body('Debajo del menú, en la zona del Catálogo, tienes filtros rápidos por Categorías, Etiquetas y Marcas para encontrar productos al instante.'),
];

// ---------- 4. Catálogo ----------
const sec4 = [
  eyebrow('Sección 04'),
  h1('Catálogo'),
  body('Es la pantalla principal. Aquí ves todos los productos que tienes cargados en forma de tarjetas. Cada tarjeta enseña la foto, el nombre, la categoría, la referencia y hasta 3 etiquetas.'),
  h2('Buscar y filtrar'),
  bullet([text('Buscador (arriba): ', { bold: true }), text('escribe nombre, marca o referencia y los productos se filtran al instante.')]),
  bullet([text('Sidebar - Categorías: ', { bold: true }), text('chips para filtrar por categoría (Vinos, Aceites, Turrones…).')]),
  bullet([text('Sidebar - Etiquetas: ', { bold: true }), text('Vegano, Bio, Sin gluten… puedes seleccionar varias a la vez.')]),
  bullet([text('Sidebar - Marcas: ', { bold: true }), text('filtra por marca específica.')]),
  bullet([text('Ordenar: ', { bold: true }), text('por más usados, más recientes, A→Z o Z→A.')]),
  bullet([text('Densidad: ', { bold: true }), text('cambia entre 4, 6 u 8 columnas para ver más o menos productos a la vez.')]),
  h2('Seleccionar productos'),
  body('Haz clic sobre una tarjeta para seleccionarla — se marca con un círculo numerado y un borde rojo. Vuelve a hacer clic para deseleccionarla. Puedes seleccionar tantos como quieras.'),
  callout(
    'Mínimo para crear un bodegón',
    'Necesitas al menos 2 productos seleccionados. Si seleccionas 1, el botón "Crear bodegón" no se activará.'
  ),
  h2('Productos sin foto'),
  body('Si un producto no tiene foto subida, aparece con una marca de agua "Sin foto" y el fondo a rayas. NO se puede incluir en un bodegón hasta que le subas una imagen.'),
];

// ---------- 5. Subir un producto ----------
const sec5 = [
  eyebrow('Sección 05'),
  h1('Subir un producto'),
  body('Hay 3 formas de añadir un producto nuevo al catálogo:'),
  h2('A. Botón "Subir producto"'),
  stepsTable([
    { lines: ['En la pantalla Catálogo, pulsa el botón rojo "Subir producto" (arriba a la derecha).'] },
    { lines: ['Se abre el modal de "Nuevo producto". Sube la imagen arrastrándola al recuadro o haciendo clic.'] },
    { lines: ['Rellena los campos del formulario (ver tabla más abajo).'] },
    { lines: ['Pulsa "Guardar producto". Aparecerá una animación de confirmación y el modal se cierra solo.'] },
  ]),
  h2('B. Drag & drop sobre la última tarjeta del Catálogo'),
  body('La última tarjeta del catálogo es siempre una zona "Subir producto" con borde discontinuo. Si arrastras una imagen desde tu Finder/Explorador y la sueltas encima, se abre el modal con la imagen ya pre-cargada. Solo tienes que rellenar los datos y guardar.'),
  h2('C. Importar Excel (ver Sección 06)'),
  body('Para añadir muchos productos a la vez.'),
  h2('Campos del formulario de producto'),
  stepsTable([
    { lines: [[text('Nombre  ', { bold: true }), text('· obligatorio. Nombre comercial del producto. Ej: "Bardos Viñedos de Altura".')]] },
    { lines: [[text('Marca  ', { bold: true }), text('· obligatorio. Ej: "Bardos", "NOS", "Picó".')]] },
    { lines: [[text('Referencia (RP)  ', { bold: true }), text('· obligatorio. Código único interno. Formato: 2 dígitos + 2 letras + 3 dígitos. Ej: 03TC316.')]] },
    { lines: [[text('Categoría  ', { bold: true }), text('· desplegable. Vinos, Aceites, Turrones, Conservas, etc. Editable desde Configuración.')]] },
    { lines: [[text('Dimensiones reales (Alto · Ancho · Fondo)  ', { bold: true }), text('· en cm. Importantísimo: la IA usa estas medidas para mantener la proporción correcta entre productos en el bodegón.')]] },
    { lines: [[text('Posición sugerida  ', { bold: true }), text('· dónde colocar en el bodegón. Auto (decide la app por la altura), TRASERA (alto, fondo), MEDIA (mediano), DELANTERA (pequeño, primer plano).')]] },
    { lines: [[text('Etiquetas  ', { bold: true }), text('· chips. Vegano, Bio, Sin gluten, Con alcohol, Artesano. Pulsa para activar/desactivar.')]] },
    { lines: [[text('Descripción visual (para el prompt de IA)  ', { bold: true }), text('· en inglés, en una frase. Describe lo que se ve en la foto. Ej: "dark glass bottle with white capsule, white label with bare winter trees illustrations". Cuanto más precisa, mejor lo entiende la IA.')]] },
    { lines: [[text('Notas (uso interno)  ', { bold: true }), text('· opcional. Apuntes que solo verás tú. La IA también los recibe como contexto extra.')]] },
  ]),
  space(200),
  callout(
    'La descripción visual es clave',
    'La IA usa la imagen como referencia principal, pero la descripción visual le ayuda a interpretarla mejor (sobre todo para conservar el color y los grafismos). Tómate 30 segundos en redactarla bien para cada producto.'
  ),
];

// ---------- 6. Importar Excel ----------
const sec6 = [
  eyebrow('Sección 06'),
  h1('Importar productos desde Excel'),
  body('Si ya tienes una hoja Excel con tu catálogo, puedes subir cientos de productos de una sola vez.'),
  stepsTable([
    { lines: ['En el Catálogo, pulsa "Importar Excel" (botón blanco arriba a la derecha).'] },
    { lines: ['Se abre el modal con un asistente de 3 pasos. Arrastra el archivo .xlsx o .csv (máximo 10 MB).'] },
    { lines: ['La app detecta automáticamente las columnas. Si alguna no se detectó, mapéala manualmente desde el desplegable.'] },
    { lines: ['Pulsa "Vista previa" para revisar lo que se va a importar.'] },
    { lines: ['Si todo está bien, pulsa "Importar X productos". Se añaden a tu catálogo.'] },
  ]),
  space(200),
  body('Las columnas que la app reconoce automáticamente son: Referencia, Nombre, Marca, Categoría, Alto (cm), Ancho (cm), Fondo (cm). Los nombres de las columnas pueden estar en español ("Marca", "Categoría", "Alto"…) o en inglés ("Brand", "Category", "Height"…) — la app entiende ambos.'),
  callout(
    'Importante',
    'La importación desde Excel NO sube fotos. Tendrás que añadir la foto a cada producto después, editándolo desde el Catálogo o desde Productos. Si la idea es importar muchos productos con foto, lo más cómodo es ir uno por uno con drag & drop.'
  ),
];

// ---------- 7. Productos ----------
const sec7 = [
  eyebrow('Sección 07'),
  h1('Pantalla "Productos"'),
  body('Es la vista en tabla del catálogo. Útil para gestionar productos rápidamente sin tantos elementos visuales.'),
  bullet('Buscador y chips de categoría arriba.'),
  bullet('Cada fila muestra miniatura, nombre, marca, referencia, categoría, etiquetas y dimensiones.'),
  bullet('Pulsa cualquier fila para abrir el modal de edición.'),
  bullet('Pulsa el icono de la papelera para eliminar (te pide confirmación).'),
  bullet('Pulsa "Nuevo producto" arriba a la derecha para añadir uno desde aquí.'),
];

// ---------- 8. Crear bodegón ----------
const sec8 = [
  eyebrow('Sección 08'),
  h1('Crear un bodegón con IA'),
  body('Es el corazón de la herramienta. Una vez tienes productos en el catálogo, este flujo genera la imagen tipo "lote" en cuestión de segundos.'),
  h2('Paso a paso'),
  stepsTable([
    { lines: ['Ve al Catálogo. Busca o filtra los productos que quieres incluir.'] },
    { lines: ['Haz clic sobre cada tarjeta para seleccionarla. Se marca con un número (1, 2, 3…) y borde rojo. Mínimo 2 productos.'] },
    { lines: ['Aparece una barra verde oliva arriba: "X productos seleccionados". Pulsa "Crear bodegón".'] },
    { lines: ['Se abre el modal de generación. Verás un círculo animado y el contador de segundos. La IA tarda entre 8 y 15 segundos.'] },
    { lines: ['Cuando acaba, aparece la imagen generada a la izquierda y el detalle a la derecha (título, descripción, productos incluidos).'] },
  ]),
  h2('Qué puedes hacer con el bodegón generado'),
  bullet([text('Editar el título  ', { bold: true }), text('· haz clic en el título "Bodegón IA #X" para renombrarlo.')]),
  bullet([text('Añadir descripción  ', { bold: true }), text('· en el cuadro "Descripción" puedes escribir notas sobre el lote (ocasión, cliente, ingredientes destacados…).')]),
  bullet([text('Ampliar imagen  ', { bold: true }), text('· haz clic sobre la imagen para verla a pantalla completa con animación. Pulsa fuera para cerrar.')]),
  bullet([text('Regenerar  ', { bold: true }), text('· botón en la parte inferior. La IA genera una variación nueva con los mismos productos. Cada regeneración es distinta.')]),
  bullet([text('Eliminar  ', { bold: true }), text('· descarta el bodegón sin guardarlo. La imagen se borra automáticamente.')]),
  bullet([text('Descargar  ', { bold: true }), text('· abre el modal de descarga (ver Sección 10).')]),
  bullet([text('Guardar en historial  ', { bold: true }), text('· lo añade al Historial para volver a usarlo cuando quieras.')]),
  space(200),
  callout(
    'Importante: el modal NO se cierra solo',
    'El modal del bodegón solo se cierra al pulsar la X (esquina superior derecha), Eliminar, o tras Guardar en historial. Esto evita perder accidentalmente un bodegón generado al hacer clic fuera.',
    C.accent
  ),
  space(200),
  callout(
    'Si no guardas, el bodegón se borra',
    'Las imágenes generadas no se guardan automáticamente. Si cierras el modal sin pulsar "Guardar en historial", el bodegón y su imagen se borran. Esto es a propósito para no llenar el historial de pruebas.'
  ),
];

// ---------- 9. Historial ----------
const sec9 = [
  eyebrow('Sección 09'),
  h1('Historial'),
  body('Aquí están todos los bodegones que has guardado. Funciona como una galería organizada por fecha.'),
  h2('Ver y filtrar'),
  bullet('Buscador por título arriba.'),
  bullet('Filtro de período: Todas, Hoy, Ayer, Esta semana, Este mes.'),
  bullet('Densidad: 4, 6 u 8 columnas.'),
  bullet('Los bodegones se agrupan automáticamente por sección temporal (Hoy, Ayer, Esta semana, Anteriores).'),
  h2('Acciones sobre cada bodegón'),
  bullet([text('Click en la card  ', { bold: true }), text('· abre el modal con imagen grande y detalle de productos.')]),
  bullet([text('Renombrar título  ', { bold: true }), text('· haz clic sobre el título del card para editarlo en línea.')]),
  bullet([text('Ampliar imagen  ', { bold: true }), text('· dentro del modal, click en la imagen para verla a pantalla completa.')]),
  bullet([text('Descargar  ', { bold: true }), text('· abre el modal de descarga con todas las opciones.')]),
  bullet([text('Eliminar  ', { bold: true }), text('· borra el bodegón individualmente.')]),
  h2('Vaciar historial completo'),
  body('Si quieres limpiar todo el historial de un golpe, en la cabecera de la pantalla hay un botón "Vaciar historial" (solo aparece si hay bodegones guardados). Te pide confirmación. Atención: borra todos los bodegones y sus imágenes, no se puede deshacer.'),
];

// ---------- 10. Descargar ----------
const sec10 = [
  eyebrow('Sección 10'),
  h1('Descargar (JPG y PDF)'),
  body('Cuando pulsas "Descargar" en cualquier bodegón (sea desde la generación o desde el historial), se abre un modal con varias opciones:'),
  h2('Calidades JPG'),
  stepsTable([
    { lines: [[text('Media  ', { bold: true }), text('· 1280 px de lado mayor, ~250 KB. Para web ligera, redes sociales, vistas previas. Bajada rápida.')]] },
    { lines: [[text('Alta  ', { bold: true }), text('· 2560 px, ~1.5 MB. Para presentaciones, catálogos digitales, emails. Calidad de pantalla óptima.')]] },
    { lines: [[text('Muy alta  ', { bold: true }), text('· resolución original sin reescalar, ~4 MB. Para imprenta, gran formato, retoque profesional.')]] },
  ]),
  h2('PDF completo'),
  body('Genera un documento A4 con el logo de la empresa, el título del bodegón, la fecha, la imagen, la descripción y el listado de productos incluidos (nombre, marca, referencia). Ideal para enviar al cliente o presentar el lote como propuesta formal.'),
  callout(
    'Cómo se descarga',
    'El archivo se baja directamente a la carpeta de Descargas de tu ordenador. NO se abre en una pestaña nueva. Una vez descargado puedes mover el archivo donde quieras.'
  ),
];

// ---------- 11. Configuración ----------
const sec11 = [
  eyebrow('Sección 11'),
  h1('Configuración'),
  body('Esta pantalla tiene 3 secciones (menú lateral interno):'),
  h2('Prompt de generación'),
  body('Es el "guión" que la IA usa para generar cada bodegón. Está escrito en inglés porque la IA funciona mejor así. Aquí defines la estética: fondo, iluminación, tipo de composición, restricciones de etiquetas, etc. Las variables {PRODUCTS} y {N} se sustituyen automáticamente por los productos seleccionados y su número.'),
  bullet('Puedes editarlo libremente.'),
  bullet('Pulsa "Guardar prompt" cuando termines.'),
  bullet('Si te equivocas, "Restaurar original" devuelve el prompt por defecto.'),
  callout(
    'Consejo',
    'Antes de cambiar el prompt, genera 5–10 bodegones con la versión actual y anota qué falla. Cambia el prompt en pequeños incrementos para ver el efecto de cada cambio. Cambios masivos a ciegas suelen empeorar el resultado.'
  ),
  h2('Categorías y etiquetas'),
  body('Aquí gestionas las listas de Categorías y Etiquetas que aparecen al subir/editar productos.'),
  bullet('Pulsa sobre un nombre para editarlo en línea.'),
  bullet('Pulsa la X para eliminar (avisa si está en uso).'),
  bullet('Escribe en el campo de abajo y pulsa "Añadir" para crear nuevas.'),
  body('Si eliminas una categoría que está en uso, los productos que la tenían NO se borran — solo pierden esa clasificación hasta que les asignes otra.'),
  h2('Acerca de'),
  body('Información sobre la herramienta y los servicios que usa por debajo (Supabase, Gemini, Netlify, GitHub).'),
];

// ---------- 12. Buenas prácticas ----------
const sec12 = [
  eyebrow('Sección 12'),
  h1('Buenas prácticas y trucos'),
  h2('Para que la IA genere mejores bodegones'),
  bullet('Sube fotos de producto de alta calidad, con fondo blanco y bien iluminadas. La IA copia la imagen tal cual la ve.'),
  bullet('Rellena la "descripción visual" en inglés y con detalles concretos.'),
  bullet('Marca correctamente las dimensiones reales (Alto × Ancho × Fondo). La proporción entre productos depende de esto.'),
  bullet('Define la posición sugerida si conoces el producto: TRASERA (alto), MEDIA (mediano), DELANTERA (bajo).'),
  bullet('Mezcla productos de distintas alturas para que el bodegón tenga una pirámide visual interesante.'),
  h2('Generación y costes'),
  bullet('Cada generación de bodegón tiene un coste pequeño (~0,03 € por imagen con el modelo Pro). Regenera con cabeza.'),
  bullet('Si la primera tirada no te convence, en lugar de regenerar 10 veces, fíjate en qué falla y ajústalo (cambia productos, edita el prompt).'),
  bullet('Las descargas en distintas calidades NO suponen coste extra de IA — el bodegón ya está generado y guardado.'),
  h2('Organización del catálogo'),
  bullet('Mantén el catálogo limpio: si un producto se descontinúa, elimínalo o marca alguna etiqueta interna (puedes crear etiquetas como "Descatalogado" desde Configuración).'),
  bullet('Usa nombres descriptivos y referencias coherentes. Eso facilita mucho buscar después.'),
  bullet('Las etiquetas no son solo decorativas: filtrar por "Bio + Sin gluten" en el catálogo te da resultados al instante.'),
];

// ---------- 13. FAQ ----------
const sec13 = [
  eyebrow('Sección 13'),
  h1('Preguntas frecuentes'),
  h3('¿Por qué tarda 8-15 segundos en generar un bodegón?'),
  body('La IA está procesando todas las fotos de referencia + el prompt + las dimensiones. Es normal. Verás un contador de segundos en pantalla.'),
  h3('Le di a "Crear bodegón" pero el botón está gris'),
  body('Necesitas tener al menos 2 productos seleccionados, y todos deben tener foto. Si alguno no tiene foto, no se puede usar.'),
  h3('La IA me cambió la etiqueta de un producto'),
  body('Aunque el prompt le pide ser fiel a la imagen, la IA tiene cierta libertad creativa. Soluciones:'),
  bullet('Regenerar (cada tirada es distinta).'),
  bullet('Usar fotos de mayor resolución como referencia.'),
  bullet('Reforzar el prompt en Configuración con instrucciones más estrictas.'),
  body('Conseguir 100% de fidelidad de etiquetas con cualquier IA hoy es complicado. Lo normal es 90-95% bien y, si no es perfecto, retocarlo.'),
  h3('Cerré el modal sin querer y perdí el bodegón'),
  body('Solo se cierra con la X explícita o tras pulsar Eliminar / Guardar. Si lo cerraste con la X y se borró, tendrás que regenerarlo.'),
  h3('Quiero cambiar el logo o los colores'),
  body('Habla con tu administrador. El logo y los colores los configura el equipo de desarrollo.'),
  h3('¿Funciona en móvil?'),
  body('Sí, es responsive. Pero la experiencia óptima es en ordenador o tableta grande, sobre todo para el modal de generación.'),
  h3('¿Mis datos están seguros?'),
  body('Todos los productos e imágenes se almacenan en una base de datos privada (Supabase) bajo control del administrador del proyecto. Solo personas con la URL pueden acceder.'),
];

// ---------- Document ----------
const doc = new Document({
  creator: 'Lotes de España · Studio',
  title: 'Guía de uso',
  description: 'Guía paso a paso de la web de generación de bodegones IA',
  styles: {
    default: { document: { run: { font: 'Calibri', size: 22 } } },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 44, bold: false, color: C.ink, font: 'Cambria' },
        paragraph: { spacing: { before: 480, after: 200 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 28, bold: true, color: C.ink, font: 'Calibri' },
        paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 1 },
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 24, bold: true, color: C.olive, font: 'Calibri' },
        paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 540, hanging: 280 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 280 } } } },
        ],
      },
      {
        reference: 'steps',
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 540, hanging: 280 } } } },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4 portrait
          margin: { top: 1700, right: 1440, bottom: 1700, left: 1440 },
        },
      },
      headers: {
        default: new Header({ children: [headerLogo] }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [text('Lotes de España · Studio · Guía de uso v1.0', { color: C.muted, size: 18 })],
          })],
        }),
      },
      children: [
        ...cover,
        ...toc,
        ...sec1,
        ...sec2,
        ...sec3,
        ...sec4,
        ...sec5,
        ...sec6,
        ...sec7,
        ...sec8,
        ...sec9,
        ...sec10,
        ...sec11,
        ...sec12,
        ...sec13,
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf);
  console.log('OK ·', OUT, '·', (buf.length / 1024).toFixed(1), 'KB');
}).catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
