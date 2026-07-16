# Handoff — Lotes de España Studio

Fecha: 2026-07-16 · Último commit desplegado: `7afdd3a`

---

## 1. Contexto del proyecto

**Cliente**: Lotes de España — empresa española de cestas gourmet, 50 aniversario. Contacto Jorge (no técnico; hablar SIEMPRE en español, explicar step-by-step).

**App**: "Lotes de España Studio" — herramienta interna. Dos secciones principales:

1. **Generador de bodegones con IA** (histórico) — usa Gemini 3 Pro Image para componer fotos-catálogo a partir de fichas de producto. Funcional, no es el foco actual.
2. **PDFs Web** (foco actual) — genera los PDFs de las fichas de lote que el cliente sube a su web. Tres PDFs por lote empaquetados en ZIP.

**URL prod**: https://lotesdeespana.netlify.app
**URL de la sección actual**: https://lotesdeespana.netlify.app/pdfs-web

---

## 2. Stack

- **Frontend**: React 18 + Vite (SPA con routing por `pushState` — ver `src/App.jsx` líneas `VIEW_PATHS`).
- **Deploy**: Netlify, auto-deploy desde `main`.
- **BD / Storage**: Supabase — proyecto `bxxozgxnlupbjualxwbk`.
  - URL: `https://bxxozgxnlupbjualxwbk.supabase.co`
  - Anon key en `.env.example` (todas las policies son `bucket_id = X` sin auth, no hace falta service_role para lectura/escritura).
- **PDFs**: `jspdf` en cliente. Imágenes vía `pdfjs-dist` (para PDFs) o `Image`+canvas (para JPG/PNG).
- **Excel**: `xlsx` (SheetJS) con `cellStyles: true, cellHTML: true` para preservar rich text bold.
- **ZIP**: `jszip`.

---

## 3. Ficheros clave del proyecto

| Fichero | Contenido |
|---|---|
| `src/App.jsx` | State global, routing SPA, cola de generaciones IA |
| `src/components/WebScreen.jsx` | Pantalla "PDFs Web" (bloques Excel, subidas, generar ZIP, modales) |
| `src/lib/pdf-lotes.js` | Generación de PDF de descripción (QR) y de etiquetas traseras |
| `src/lib/web-files.js` | Helpers de Supabase Storage (subir/listar/borrar en cada bucket) |
| `src/lib/api.js` | API para el generador de bodegones |
| `public/pdf-header.jpg` | Cabecera decorativa CON logo (2480×400) |
| `public/pdf-header-nologo.jpg` | Cabecera decorativa SIN logo (2480×400) |
| `scripts/wipe-lotes.mjs` | One-shot para vaciar el bucket `lotes` (entre temporadas) |
| `scripts/import-lote-photos.mjs` | One-shot para importar fotos del sitemap de lotesdeespana.es (obsoleto ahora, se conservó por si acaso) |

---

## 4. Buckets Supabase Storage

| Bucket | Contenido | Formato de nombre |
|---|---|---|
| `productos` | Fotos individuales de productos (para bodegones IA) | libre |
| `bodegones` | Bodegones generados por Gemini | libre |
| `etiquetas` | Fotos de traseras de productos (input de PDF etiquetas) | `<RP>.<ext>`, ej. `06AC044.png`. **RP = 2 dígitos + 2 letras + 3 dígitos** |
| `lotes` | Fotos del lote completo (input de PDF QR) | `<NNN>_001.<ext>`, ej. `216_001.jpg`. **Todas 700×800** |
| `documents` | Los 3 Excels de configuración | Nombre fijo: `master-catalog.xlsx`, `tarifa-nacional.xlsx`, `nomenclatura-qr.xlsx` |

**Todos son públicos**. Se guarda con `upsert:true` — el helper `uploadEtiqueta` y `uploadLotePhoto` además borra explícitamente los ficheros con distinta extensión pero mismo RP/número (por si suben `.png` encima de `.jpg`).

---

## 5. Excels que sube el cliente

### Excel del catálogo (`master-catalog.xlsx`)
Una hoja por lote (nombre de hoja = nº lote: `100`, `513`, `802`, etc.). Columnas:
- **A**: ART (referencia RP del producto)
- **B**: UDS (nº de unidades)
- **C**: DESCRIPCION (rich text, la MARCA en negrita)

El código lee celda a celda con `XLSX.utils.decode_range` y extrae `cell.h` (HTML) para preservar el `<b>` de las marcas → runs `[{text, bold}]`.

### Tarifas nacionales (`tarifa-nacional.xlsx`)
Columnas: **A**=Ref, **B**=Pág, **C**=Nombre Artículo, **D**=B.Imp, **E**=IVA.

- **Precio del PDF QR con precio**: solo col D (B.Imp). El IVA no se suma; el PDF pone "N,NN€ + IVA".
- **Título del PDF**: col C, limpiando el sufijo `REF. NNN` del final. Ej: `PEQUEÑOS MOMENTOS REF. 100` → título `PEQUEÑOS MOMENTOS`. El PDF monta `PEQUEÑOS MOMENTOS - REF. 100`.

### Nomenclatura QR (`nomenclatura-qr.xlsx`)
Columnas: **A**=Ref, **B**=Nombre exacto del PDF fichero (`Cestas - Baúles y Lotes Sorteo 513.pdf`).

Se usa solo para el nombre del fichero dentro del ZIP. El título dentro del PDF sale de Tarifas.

---

## 6. Layout del PDF QR (`generateDescripcionPDF`)

Estructura fija (todos los lotes):

```
┌─────────────────────────────────────┐
│  BANDA DECORATIVA (2480×400 JPG)    │  ~34 mm
│  ── AIR_TOP = 3 mm ──               │
│  ┌─────────────────────────────┐    │
│  │      FOTO LOTE (fija)       │    │  115 mm alto
│  │  (auto-trim del padding)    │    │  ~100 mm ancho (ratio 0.875)
│  └─────────────────────────────┘    │
│  ── AIR_BOTTOM = 3 mm ──            │
│                                     │
│  TIPO - REF. NNN         PRECIO€    │  título 19pt bold
│  ────────────────────                │  línea gruesa
│                                     │
│  1  Producto MARCA info                8pt (adaptativo 6.5-9)
│  2  Otro producto CON MARCA info       marcas en negrita del Excel
│  ...                                   nunca invade el pie legal
│                                     │
│  ────────────────────                │
│  En caso de rotura de stock...      │  pie legal 8pt italic
└─────────────────────────────────────┘
```

**Constantes clave** (en `pdf-lotes.js`):
- `PHOTO_FIXED_H = 115` mm (foto siempre igual).
- `AIR_TOP = 3` mm, `AIR_BOTTOM = 3` mm.
- `FS_MAX = 9`, `FS_MIN = 6.5`, `FS_STEP = 0.25`.
- `FOOTER_RESERVE = 25` mm.

**Shrink-to-fit**: prueba de 9pt hacia abajo hasta encontrar el mayor tamaño en el que el listado quepa antes del pie legal. Si con 6.5 sigue sin caber, se queda en 6.5 (raro).

**Rich text** — parser `parseHtmlToRuns` con state machine (pila de bold). Entiende `<b>`, `<strong>`, `<span style="font-weight:bold|600|700...">`. El resto de tags se ignora manteniendo el estado.

**Auto-trim de foto** (`autoTrimPhoto`) — cuando la foto viene con padding uniforme (fondo azul del 802, blanco de otras), lo recorta. Toma media de las 4 esquinas como "color fondo", tolerancia 22/canal, permite hasta 1.5% de ruido por fila/columna. Si el padding es < 3%, no toca.

**Cabecera con cache-bust** — se sirve como `/pdf-header.jpg?v=<APP_LOAD_ID>` donde `APP_LOAD_ID = Date.now()` en tiempo de import del módulo. Cada nueva carga = URL nueva = cache miss = cliente ve la última versión sin hard refresh.

---

## 7. Layout del PDF de etiquetas (`generateEtiquetasPDF`)

- Cabecera: logo `/logo.png` con aspect ratio real + título `Lote NNN` en 22pt bold.
- Rejilla **2×2 (4 etiquetas por página)**.
- Cada celda: nombre corto arriba (extraído del rich text del Excel — solo runs bold; fallback a MAYÚSCULAS por regex) + foto de la etiqueta centrada con contain.
- Productos SIN etiqueta subida: no aparecen en el PDF, se devuelven en `missing` y el UI los muestra en un banner ámbar clickable → modal con tabla (RP, descripción, en qué lote/s aparecen).

---

## 8. UI de la pantalla "PDFs Web"

Orden actual (arriba abajo):
1. **Generar PDFs** — input de números (soporta `104, 200-205, 300`), botón Generar. Al terminar aparece card con el ZIP + banner ámbar si hay etiquetas faltantes.
2. **Etiquetas traseras + Fotos de lotes** (2 columnas) — arrastrar y soltar. Cada bloque tiene contador y botón "Ver listado" → modal con miniaturas, buscador, botón "Descargar todas (ZIP)" y borrar individual.
3. **Excel del catálogo + Tarifas + Nomenclatura QR** (3 columnas) — cada uno con icono de descarga + botón Sustituir.

**URLs internas**: `/`, `/productos`, `/historial`, `/configuracion`, `/pdfs-web` (routing manual, Netlify SPA fallback).

---

## 9. Convenciones con Jorge (feedback en memoria)

- **Nunca desproporcionar imágenes** — logos, banners, fotos: siempre respetar aspect ratio real. `contain` por defecto, nunca `stretch`. Ya me lo ha corregido varias veces.
- **Hablar en español**, explicar step-by-step con clicks. Jorge no es técnico.
- **No pushear sin confirmación** salvo que sea un fix directo pedido explícitamente.
- **Preferir soluciones que no rompan lo existente**.
- **Verificar en navegador antes de dar por hecho**, sobre todo cambios de UI.
- **Cuando hay una decisión que puede ir por 2 caminos** — proponer con recomendación, no elegir a la brava.

Ver memoria completa: `/Users/jorgerabasco/.claude/projects/-Users-jorgerabasco-Documents-Claude-Lotes-de-espana/memory/`

---

## 10. Estado desplegado hoy (últimos 5 commits)

```
7afdd3a  PDF QR: 3 mm de aire arriba y abajo de la foto
20d6204  PDF QR: auto-crop del padding uniforme de la foto del lote
555a20b  PDF QR: foto tamaño fijo, 0 mm de aire y texto adaptativo 6.5-9 pt
05de23d  PDF QR: texto objetivo 8pt y foto que se adapte al espacio sobrante
23e6929  PDF QR: layout adaptativo — foto se ajusta para no pisar el pie legal
```

En Netlify hay auto-deploy desde `main` (~2 min).

---

## 11. Cosas para tener en cuenta

- **Los permisos de macOS** son inestables. A veces no puedo leer del Escritorio del user. Si le pides un fichero, dile que lo copie a `/tmp/` con Terminal:
  ```bash
  cp ~/Desktop/fichero.png /tmp/
  ```
- **El shell puede perder el CWD** con error `uv_cwd EPERM`. Solución: reiniciar Claude Code o pedir al user que ejecute manualmente en Terminal.
- **jsPDF** genera con `compress: true`. JPEG quality = 0.95, max long side 2500px (redimensiona lo que exceda).
- **El fallback SPA** de Netlify (`netlify.toml`) redirige cualquier ruta a `index.html`. Las rutas del routing manual funcionan en producción tal cual.

---

## 12. Trabajo iniciado hoy pendiente de validación por el cliente

Los últimos cambios (3mm aire + auto-trim) están desplegados a espera de confirmación del cliente. Si vuelve a haber feedback sobre el layout del PDF QR (foto pequeña/grande/pegada/aire), los sitios a tocar son:

- `AIR_TOP` / `AIR_BOTTOM` en `pdf-lotes.js` (líneas ~340)
- `PHOTO_FIXED_H` (línea ~360)
- `FS_MAX` / `FS_MIN` (línea ~350)
- `autoTrimPhoto` tolerance (línea ~110) — si algún fondo no se detecta bien
- La banda decorativa `public/pdf-header.jpg` / `public/pdf-header-nologo.jpg` (2480×400)

---

## 13. Cómo arrancar el proyecto

```bash
cd ~/Documents/Claude/Lotes_de_espana/.claude/worktrees/dazzling-dhawan-f94ff5
npm install    # (si es la primera vez)
npm run dev    # Vite en http://localhost:5173
```

Repo: https://github.com/jorgerabasco-designer/lotes-de-espana
Rama actual: `claude/dazzling-dhawan-f94ff5`
Push directo a `main` (sin PR).
