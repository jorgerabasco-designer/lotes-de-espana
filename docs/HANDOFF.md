# HANDOFF — Lotes de España · Generador de Bodegones IA

> **Para el siguiente Claude / desarrollador.** Este documento es el traspaso completo
> del proyecto. Léelo entero antes de tocar nada. El usuario (Jorge) **no tiene
> conocimientos de programación**: hay que guiarle paso a paso, con clics concretos,
> y explicarle todo. Habla en español.

Última actualización: 2026-05-12

---

## 1. QUÉ ES ESTE PROYECTO

Web para **Lotes de España** (empresa real de cestas/lotes gourmet, lotesdeespana.es).
Permite:
- Gestionar un **catálogo de productos** (vino, AOVE, turrones, conservas, snacks…) con foto, dimensiones reales, categoría, etiquetas.
- **Generar "bodegones"** (composiciones tipo still-life para catálogo) seleccionando varios productos y dejando que una IA los componga en una foto profesional sobre fondo blanco.
- Guardar esos bodegones en un **historial**, descargarlos (JPG en 3 calidades o PDF).

El usuario final por ahora es **interno** (el equipo de Lotes de España). En el futuro se quiere abrir un "configurador" para clientes finales (ver Roadmap).

---

## 2. STACK Y DÓNDE VIVE CADA COSA

| Pieza | Tecnología | Dónde |
|---|---|---|
| Frontend | React 18 + Vite | `src/` |
| Hosting + funciones serverless | **Netlify** | cuenta del usuario, plan **Personal ($9/mes)** |
| Base de datos + almacenamiento | **Supabase** (Postgres + Storage) | proyecto `bxxozgxnlupbjualxwbk` |
| Generación de imágenes (bodegones) | **Google Gemini 3 Pro Image** | API key en Netlify env vars |
| Descripción visual de productos | **Anthropic Claude Haiku 4.5** | API key en Netlify env vars |
| Repositorio | GitHub | `jorgerabasco-designer/lotes-de-espana` |

- **URL de producción**: la del sitio Netlify (`lotesdeespana.netlify.app` o similar).
- **Auto-deploy**: cada `git push` a `main` dispara un build en Netlify.
- **Diseño original**: el usuario lo facilitó como un .zip de JSX. Ya está portado a `src/`. No queda el original.

---

## 3. ESTRUCTURA DE ARCHIVOS

```
Lotes_de_espana/
├── README.md                       Guía de despliegue paso a paso (para el usuario)
├── docs/HANDOFF.md                 ESTE archivo
├── index.html                      Entry, favicon
├── package.json                    Deps: react, @supabase/supabase-js, xlsx, jspdf; dev: exceljs, vite
├── vite.config.js                  Proxy /api → :8888 en dev
├── netlify.toml                    Build config + redirects (/api/* → functions)
├── .env.example                    Plantilla de variables de entorno (documentación)
├── public/
│   ├── favicon.ico                 Favicon oficial del cliente (el oso)
│   ├── logo.png                    Logo (oso). OJO: baja resolución, pendiente SVG del cliente
│   ├── plantilla-productos.xlsx    Plantilla Excel descargable (generada por script)
│   ├── guia-fotografia.pdf         Guía de fotografía descargable (generada por script)
│   └── seed/                       Imágenes de los 7 productos demo + logo viejo
├── scripts/
│   ├── build-template.cjs          Genera public/plantilla-productos.xlsx (node scripts/build-template.cjs)
│   └── build-photo-guide.cjs       Genera public/guia-fotografia.pdf (node scripts/build-photo-guide.cjs)
├── src/
│   ├── main.jsx                    Entry React. Envuelve App en <TaxonomyProvider>
│   ├── App.jsx                     Orquestador: estado global, navegación entre pantallas
│   ├── styles/globals.css          Variables CSS + layout + TODO el responsive móvil
│   ├── lib/
│   │   ├── supabase.js             Cliente Supabase. SUPABASE_READY = hay credenciales o no
│   │   ├── api.js                  TODA la capa de datos (productos, bodegones, settings, describe)
│   │   ├── constants.js            DEFAULT_CATEGORIES, DEFAULT_TAGS, DEFAULT_PROMPT_TEMPLATE
│   │   ├── taxonomy.jsx            Context de categorías/etiquetas (CRUD, persiste en settings)
│   │   ├── seed.js                 7 productos demo + importSeedProducts()
│   │   ├── image-optimize.js       optimizeImage(): redimensiona+recomprime antes de subir
│   │   └── download.js             downloadFile / downloadImageWithQuality (descarga forzada)
│   └── components/
│       ├── Sidebar.jsx             Navegación lateral (en móvil = tabs horizontales)
│       ├── Catalog.jsx             Pantalla Catálogo + ProductCard + UploadCard + filtros móvil
│       ├── ProductsScreen.jsx      Pantalla Productos (tabla)
│       ├── ProductEditOverlay.jsx  Modal crear/editar producto (+ botón "Generar con IA")
│       ├── HistoryScreen.jsx       Pantalla Historial + lightbox
│       ├── SettingsScreen.jsx      Configuración: prompt editable + taxonomía
│       ├── BodegonOverlay.jsx      Modal de generación de bodegón + polling
│       ├── ImportExcelModal.jsx    Importación masiva (Excel + fotos, detección duplicados)
│       ├── DownloadModal.jsx       Modal de descarga (JPG 3 calidades + PDF)
│       └── icons.jsx               Set de iconos SVG (objeto I)
└── netlify/functions/
    ├── generate-bodegon-background.js   Background Function: genera el bodegón con Gemini
    └── describe-product.js              Function normal: describe foto con Claude Haiku
```

---

## 4. VARIABLES DE ENTORNO (en Netlify → Site config → Environment variables)

| Variable | Para qué | Notas |
|---|---|---|
| `VITE_SUPABASE_URL` | Cliente Supabase (frontend) | **Solo el host**, p.ej. `https://xxxx.supabase.co`. Sin `/rest/v1`. (Un error de esto causó un bug gordo.) |
| `VITE_SUPABASE_ANON_KEY` | Cliente Supabase (frontend) | anon public key |
| `SUPABASE_URL` | Funciones serverless | Mismo valor que VITE_SUPABASE_URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Función generate-bodegon | service_role key. SECRETA. |
| `GEMINI_API_KEY` | Función generate-bodegon | Google AI Studio. **Requiere billing activado** (los modelos de imagen NO están en free tier). |
| `GEMINI_IMAGE_MODEL` | (opcional) override del modelo | Por defecto el código prueba: gemini-3-pro-image-preview → gemini-3.1-flash-image-preview → gemini-2.5-flash-image |
| `ANTHROPIC_API_KEY` | Función describe-product | console.anthropic.com. Requiere saldo prepago. |
| `CLAUDE_DESCRIBE_MODEL` | (opcional) override | Por defecto `claude-haiku-4-5`. Si poca calidad → `claude-sonnet-4-5` |

En local, copiar `.env.example` a `.env`. Pero el usuario trabaja casi siempre directo en producción.

---

## 5. ESQUEMA DE SUPABASE

Script completo en `supabase/schema.sql`. **Es idempotente, se puede re-ejecutar.**

### Tabla `products`
- `ref` TEXT PK — formato OBLIGATORIO `^[0-9]{2}[A-Z]{2}[0-9]{3}$` (2 dígitos + 2 letras + 3 dígitos, p.ej. `03TC316`). Constraint `ref_format`.
- `nombre`, `marca`, `categoria`, `categoria_id`, `descripcion`
- `alto`, `ancho`, `fondo` NUMERIC (cm) — críticos: la IA respeta proporciones reales
- `posicion` TEXT CHECK IN (TRASERA, MEDIA, DELANTERA) o NULL
- `descripcion_visual` TEXT — descripción en inglés para el prompt (opcional, generable con IA)
- `notas`, `foto_path`, `tags` TEXT[], `used_count`, `created_at`, `updated_at`
- `tipo_envase` y `color_dominante` existen en BD pero **ya no se usan** (eliminados del UI)

### Tabla `bodegones`
- `ref` TEXT PK — mismo formato que products
- `numero` INTEGER — correlativo (#1, #2…)
- `nombre`, `descripcion`
- `productos` JSONB — **OJO formato nuevo**: `[{sku, qty}]`. El código normaliza el formato viejo `['sku']` automáticamente.
- `imagen_path`, `prompt_usado`, `error_mensaje`
- `estado` TEXT CHECK IN (`generating`, `draft`, `completed`, `failed`)
  - `generating`: en curso
  - `draft`: generación lista, esperando que el usuario pulse "Guardar en historial"
  - `completed`: guardado en historial (lo que ve HistoryScreen)
  - `failed`: error
- `created_at`

### Tabla `settings`
- `key` TEXT PK, `value` JSONB
- Claves usadas: `prompt_template` (el prompt de Gemini editable), `categories`, `tags`

### Storage buckets (públicos)
- `productos` — fotos de productos
- `bodegones` — imágenes generadas

### RLS
Políticas abiertas (`USING (true) WITH CHECK (true)`) — no hay autenticación todavía. Si se añade login en el futuro, restringir.

---

## 6. CÓMO FUNCIONA EL FLUJO PRINCIPAL (generar bodegón)

1. Usuario selecciona productos en el Catálogo. Cada click suma 1 unidad (`App.jsx`: estado `selected` array de SKUs + `qtys` objeto `{sku: cantidad}`).
2. Pulsa "Crear bodegón" → se abre `BodegonOverlay`.
3. `BodegonOverlay` llama a `startBodegonGeneration({ items: [{sku,qty}], title, description })` en `api.js`:
   - Crea fila en `bodegones` con estado `generating`, `productos` = `[{sku,qty}]`
   - Dispara `POST /api/generate-bodegon` (que redirige a la **Background Function**)
   - Background Functions de Netlify devuelven 202 al instante → por eso usamos **polling**
4. `BodegonOverlay` hace polling con `pollBodegon(ref)` cada 2.5s sobre la fila de Supabase.
5. La Background Function `generate-bodegon-background.js`:
   - Lee la fila, normaliza `productos`, carga los productos de la tabla
   - Construye el prompt: plantilla (de `settings.prompt_template` o `DEFAULT_PROMPT_TEMPLATE`) + bloque `{PRODUCTS}` con cada producto y su `QUANTITY` + bloque fijo `QUANTITY_RULES` inyectado SIEMPRE al final
   - Descarga las fotos de referencia (en el mismo orden que el bloque de texto)
   - Llama a Gemini (prueba varios modelos en cascada)
   - Sube la imagen resultante a Storage bucket `bodegones`
   - Pone la fila en estado `draft`
6. El polling ve `draft` → muestra la imagen al usuario.
7. Usuario pulsa "Guardar en historial" → `commitBodegon` pone estado `completed`.
   Si cierra sin guardar → `discardBodegon` borra la fila y la imagen.

**Tiempo de generación**: 30-90s con Gemini 3 Pro y muchos productos. Es normal, el modelo es así. La Background Function tiene 15 min de margen, así que no hay timeout — solo es espera del usuario.

---

## 7. DECISIONES TÉCNICAS CLAVE (y por qué)

- **Background Function para generar bodegones**: las funciones Netlify normales tienen 10s de timeout (free) — Gemini tarda mucho más. Las Background Functions dan 15 min. Por eso el patrón crear-fila → disparar → polling.
- **Gemini 3 Pro para imágenes**: mejor calidad fotorealista. Hay fallback a Flash y 2.5 si Pro falla. El código prueba modelos en cascada porque Google renombra/deprecia modelos a menudo.
- **Claude Haiku para descripciones de producto**: Gemini Flash daba descripciones malas/truncadas. Claude tiene mejor visión. Es el botón "Generar con IA" en el editor de producto — uso MANUAL, no automático (decisión consciente: en imports masivos no aporta y suma coste/tiempo).
- **El prompt vive en Supabase** (`settings.prompt_template`), editable desde Configuración SIN deploy. El `DEFAULT_PROMPT_TEMPLATE` del código es solo el fallback.
- **Optimización de imágenes en cliente** antes de subir (`image-optimize.js`): redimensiona a máx 2048px, recomprime WebP/JPEG. Mantiene a Supabase Free dentro de cuota (500 productos ≈ 300MB en vez de 2.5GB).
- **Sistema de unidades** (lo último que se hizo): `selected` (orden) + `qtys` (cantidades). El prompt incluye `QUANTITY` por producto. Resuelve el problema de que la IA metía 2-3 copias del mismo producto.
- **Taxonomía dinámica** (categorías/etiquetas) en Context, persiste en `settings`. Al borrar una etiqueta, se quita de los productos que la tenían.

---

## 8. HISTORIAL DE PROBLEMAS RESUELTOS (para no repetirlos)

| Problema | Causa | Solución |
|---|---|---|
| "Invalid path specified in request URL" en Storage | `VITE_SUPABASE_URL` tenía `/rest/v1` al final | La URL debe ser SOLO el host |
| Bucket sin permisos de escritura | Faltaban políticas RLS en `storage.objects` | Re-ejecutar las políticas del schema.sql |
| Gemini "model not found" | Google renombró los modelos de imagen | Cascada de modelos + fallback |
| Gemini "quota exceeded, limit: 0" | API key sin billing | Activar billing en Google AI Studio (los modelos de imagen no son free) |
| Función colgada / "Unexpected token '<'" | Timeout de función normal (10s) | Migrar a Background Function + polling |
| Netlify "deploys paused, credit limit" | Demasiados deploys durante desarrollo | Plan Personal $9/mes. **Agrupar cambios, pocos deploys.** |
| Error `ref_format` crudo al guardar producto | Referencia con formato inválido | Validación inline + maxLength=7 + mensajes amigables |
| Descripción IA mala/truncada | Gemini Flash flojo en visión | Migrado a Claude Haiku |
| IA metía 2-3 unidades del mismo producto | El prompt no controlaba cantidades | Sistema de unidades + bloque QUANTITY_RULES en el prompt |

---

## 9. REGLAS DE TRABAJO CON EL USUARIO

1. **El usuario NO programa.** Explícale todo con clics concretos. Nada de jerga sin traducir.
2. **Cuida los créditos de Netlify.** Cada `git push` = 1 build = ~15 credits. Plan Personal tiene 1000/mes. **Agrupa cambios**, avisa antes de hacer push, no hagas push por cada cambio pequeño.
3. **Prueba en local** (`npm run dev` en `http://localhost:5173`) antes de pushear cuando se pueda.
4. **No hagas push sin que el usuario lo pida** explícitamente ("súbelo").
5. Trabaja en local, acumula, y haz UN push por tanda.
6. El usuario presenta a su cliente a menudo — prioriza estabilidad sobre features a medias.

---

## 10. COMANDOS ÚTILES

```bash
cd "/Users/jorgerabasco/Documents/Claude/Lotes_de_espana"
npm install                          # primera vez
npm run dev                          # desarrollo local → http://localhost:5173
npx vite build                       # verificar que compila (hazlo antes de cada push)
node scripts/build-template.cjs      # regenerar plantilla Excel
node scripts/build-photo-guide.cjs   # regenerar guía de fotografía PDF

# Push (solo cuando el usuario lo pida):
git add -A && git commit -m "..." && git push
```

---

## 11. ROADMAP / PENDIENTES

### Pendiente inmediato (lo que quedó en el aire)
- **Prompt estilo "perspectiva"**: el usuario quiere probar un prompt donde los productos tengan algo más de perspectiva/sombra y los de atrás "apoyados sobre superficie blanca" (no flotando). Se le pasó el texto del nuevo prompt para que lo pegue él en Configuración → Prompt (porque el prompt activo vive en Supabase, no en el código). Debe guardar el actual antes por si quiere volver. **Ver el texto al final de este documento.**
- **Logo en buena resolución**: el actual (`public/logo.png`) es de baja calidad (extraído de un .ico 32x32). El usuario va a conseguir un SVG. Cuando lo tenga: reemplazar `public/logo.png` y volver a meter el logo en los PDFs (`DownloadModal.jsx` y `scripts/build-photo-guide.cjs` — ahora mismo el logo está QUITADO de ambos PDFs).

### Roadmap a medio plazo (hablado con el usuario)
1. **Precios en productos** (campo `precio` + `coste`) → total del lote en pantalla → presupuestos. Es el quick-win con más valor.
2. Duplicar bodegón, favoritos, lotes-plantilla.
3. Métricas internas (productos más usados, lotes/semana).
4. **Configurador para cliente final**: página pública donde el cliente compone su propio lote con presupuesto en tiempo real.
5. Multiusuario con roles.
6. Integración con **PrestaShop** (su tienda real) — sincronizar productos.
7. Checkout / pasarela de pago.

### Ideas a futuro (no priorizadas)
- Selector de estilo de fondo al generar (blanco / color / rústico).
- Comparador A/B de modelos (Gemini vs FLUX).
- WhatsApp / email transaccional del bodegón.
- Editor post-generación.

---

## 12. ESTADO ACTUAL (qué está hecho y funciona)

✅ Catálogo con filtros (categoría, etiqueta, marca), ordenación (más usados, recientes, A-Z, Z-A)
✅ CRUD de productos con foto, optimización automática de imágenes
✅ Sistema de unidades (click suma, badge ×N, botón restar)
✅ Importación masiva Excel + fotos con detección de duplicados
✅ Generación de bodegones con Gemini 3 Pro (Background Function + polling)
✅ Historial con lightbox, título editable, vaciar historial
✅ Descarga JPG (3 calidades) + PDF con descripción y listado
✅ Configuración: prompt editable + gestión de categorías/etiquetas
✅ Botón "Generar con IA" para descripción visual (Claude Haiku)
✅ Plantilla Excel + guía de fotografía descargables
✅ Responsive móvil (sidebar como tabs, filtros en bottom-sheet, etc.)
✅ Favicon oficial del cliente

⚠️ Logo en baja resolución (pendiente SVG)
⚠️ Prompt de estilo "perspectiva" pendiente de que el usuario lo aplique en Configuración
⚠️ Sin autenticación (RLS abierta) — OK para uso interno actual

---

## 13. CÓMO ARRANCAR UNA NUEVA SESIÓN

El usuario abrirá un chat nuevo y pegará este documento. El nuevo Claude debe:
1. Leer este HANDOFF entero.
2. Leer `README.md`, `supabase/schema.sql`, `src/App.jsx`, `src/lib/api.js` y `netlify/functions/generate-bodegon-background.js` para tener el contexto del código.
3. Preguntar al usuario en qué quiere trabajar.
4. Respetar las REGLAS DE TRABAJO (sección 9).
