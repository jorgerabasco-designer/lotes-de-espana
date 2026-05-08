# Lotes de España · Generador de Bodegones IA

Web para gestionar el catálogo de productos gourmet y generar bodegones (still-life) con **Google Gemini**, guardar todo en **Supabase** y desplegar en **Netlify** desde **GitHub**.

> Esta guía está pensada para alguien **sin experiencia previa** en programación. Sigue los pasos en orden, con calma. Cada acción es un click o un copia/pega.

---

## Qué obtienes al final

- Una URL pública (Netlify) que puedes compartir con tu cliente.
- Un panel con **Catálogo**, **Productos**, **Historial** y **Configuración**.
- Subida de productos (foto + ficha) que se guardan en Supabase.
- Importación masiva desde Excel.
- Selección múltiple → "Crear bodegón" → Gemini genera la imagen → se guarda en el Historial.
- El **prompt** se puede editar desde la pantalla de Configuración sin tocar el código.
- Cada cambio que hagas en GitHub se publica solo en Netlify (auto-deploy).

---

## Mapa rápido

| Sistema | Para qué sirve | Coste |
|---|---|---|
| **GitHub** | Guarda el código de la web. | Gratis |
| **Supabase** | Base de datos + almacenamiento de fotos. | Plan Free (suficiente para empezar) |
| **Google AI Studio (Gemini)** | API de generación de imágenes. | Plan Free con cuota generosa; mira tu cuenta |
| **Netlify** | Sitio público + funciones serverless. | Plan Free |

---

# Parte A · Preparativos en tu Mac

## 1. Instala Node.js y Git

1. Abre **https://nodejs.org** y descarga la versión **LTS** (botón verde de la izquierda). Doble click al `.pkg` y siguiente, siguiente, siguiente.
2. Abre **https://git-scm.com/download/mac** y descarga Git. Mismo proceso.
3. Para verificar, abre **Terminal** (⌘ + Espacio → escribe "Terminal") y pega:
   ```bash
   node -v
   git --version
   ```
   Tienen que aparecer dos números de versión. Si aparecen, perfecto.

## 2. Abre el proyecto

En Terminal, copia y pega:
```bash
cd "/Users/jorgerabasco/Documents/Claude/Lotes_de_espana"
npm install
```
La primera vez tarda 1–2 min mientras instala todo. No te asustes con la cantidad de líneas que salen.

## 3. Pruébalo en local (todavía sin Supabase / Gemini)

```bash
npm run dev
```
Abre el navegador en **http://localhost:5173**. Verás la web con productos de ejemplo. Para parar, en Terminal pulsa `Ctrl + C`.

> En este modo demo todavía no puedes generar bodegones reales (necesitamos Gemini + Supabase). Pero ya puedes ver el diseño completo.

---

# Parte B · Crea las cuentas y conecta los servicios

## 4. Crear Supabase (base de datos + fotos)

1. Ve a **https://supabase.com** → **Start your project** → entra con GitHub o email.
2. Pulsa **New project**.
   - **Name**: `lotes-de-espana`
   - **Database password**: pulsa "Generate" y **guárdala** (la vas a necesitar luego, aunque no a diario).
   - **Region**: elige la más cerca de España (ej. `West EU (Ireland)` o `Frankfurt`).
   - Pulsa **Create new project**. Tarda ~2 min en preparar la base de datos.
3. Cuando esté listo, en el menú lateral izquierdo:
   - Pulsa **SQL Editor** → **New query**.
   - Abre el archivo `supabase/schema.sql` de este proyecto, copia **todo** su contenido y pégalo en el editor de Supabase.
   - Pulsa **Run** (esquina inferior derecha). Debe decir "Success. No rows returned".
4. Recoge tus claves: en el menú lateral, **Project Settings → API**.
   - Copia **Project URL** (algo como `https://xxxxxxxx.supabase.co`).
   - Copia **anon public** key (la larga que empieza por `eyJ…`).
   - Copia **service_role** key (también `eyJ…`). **Esta clave es secreta, no la enseñes a nadie**.

## 5. Crear API Key de Gemini (Google AI Studio)

1. Ve a **https://aistudio.google.com/app/apikey** y entra con tu Google.
2. Pulsa **Create API key** → elige tu proyecto (o uno nuevo) → **Create API key in new project**.
3. Copia la clave que empieza por `AIza…`. Guárdala bien.

> Si la web te dice "Image generation no está disponible en tu región", crea otro proyecto de Google con cuenta personal de gmail y vuelve a probar.

## 6. Configura las variables locales (opcional, sólo si quieres probar local con Supabase)

En Terminal, dentro de la carpeta del proyecto:
```bash
cp .env.example .env
open .env
```
Rellena los valores y guarda. Vuelve a `npm run dev` y ya verás tus productos reales (cuando los subas).

> Si solo quieres ir directo a Netlify, sáltate este paso.

---

# Parte C · Sube el código a GitHub

## 7. Crea el repositorio en GitHub

1. Ve a **https://github.com/new**.
2. **Repository name**: `lotes-de-espana`. Privado o público, da igual. **No marques** "Add README" ni nada (ya está creado).
3. **Create repository**.

## 8. Sube el código desde Terminal

Copia y pega bloque por bloque (cambia `TU_USUARIO` por tu nombre de usuario de GitHub):
```bash
cd "/Users/jorgerabasco/Documents/Claude/Lotes_de_espana"
git init
git add .
git commit -m "Lotes de España · primer commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/lotes-de-espana.git
git push -u origin main
```
La primera vez te pedirá usuario/contraseña de GitHub. La "contraseña" no es la del login web; es un **Personal Access Token**:
- Ve a **https://github.com/settings/tokens** → **Generate new token (classic)** → marca solo `repo` → **Generate**. Copia el token y úsalo como contraseña en el `git push`.

> Si te lías con la línea de comandos, usa **GitHub Desktop** (https://desktop.github.com): "File → Add local repository" → selecciona la carpeta → "Publish repository".

---

# Parte D · Despliega en Netlify

## 9. Conecta GitHub con Netlify

1. Ve a **https://app.netlify.com/start** → **Import from Git** → **GitHub** → autoriza.
2. Selecciona el repo `lotes-de-espana`.
3. **Build settings** (deberían rellenarse solas con `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Pulsa **Deploy site**. El primer build tarda 1–2 min.

## 10. Añade las variables de entorno en Netlify

Dentro del sitio recién creado: **Site settings → Environment variables → Add a variable** (de una en una):

| Key | Value | Comentario |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | URL del paso 4 |
| `VITE_SUPABASE_ANON_KEY` | `eyJ…` | anon key del paso 4 |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | igual que arriba (lo usa la función) |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` | service_role del paso 4 — **secreto** |
| `GEMINI_API_KEY` | `AIza…` | del paso 5 — **secreto** |
| `GEMINI_IMAGE_MODEL` | `gemini-2.5-flash-image-preview` | (opcional, ya viene por defecto) |

Cuando termines, ve a **Deploys → Trigger deploy → Clear cache and deploy site** para que el siguiente build use las variables.

## 11. Prueba la URL pública

Netlify te da una URL del estilo `https://elegant-cookie-123.netlify.app`.
- Si quieres una URL personalizada, ve a **Site configuration → Change site name** y pon `lotes-de-espana` (o el que quieras).
- Si tienes dominio propio, ve a **Domain management → Add custom domain**.

---

# Parte E · Día a día

## Subir productos
1. Catálogo → **Subir producto**.
2. Rellena ficha y arrastra una imagen (PNG con fondo transparente queda mejor).
3. **Guardar producto** → se guarda en Supabase.

## Importar Excel
1. Catálogo → **Importar Excel**.
2. Arrastra tu `.xlsx` con las columnas `Referencia, Nombre, Marca, Categoría, Alto, Ancho, Fondo`.
3. Confirma → todo a Supabase.

## Generar bodegón
1. Selecciona productos en el catálogo (cualquier número).
2. Pulsa **Crear bodegón**.
3. Espera 5–25 s. Gemini te devuelve una imagen, ajustada a tus dimensiones reales.
4. **Regenerar** si quieres otra variación, **Guardar en historial** cuando te guste.
5. Las imágenes generadas viven en el bucket `bodegones` de Supabase y aparecen en la pantalla **Historial**.

## Editar el prompt
- Ve a **Configuración → Prompt de generación**.
- Modifica lo que quieras. Las variables `{PRODUCTS}` y `{N}` las rellena automáticamente la función.
- **Guardar prompt**. La siguiente generación lo usará.

## Cambiar algo del código
1. Edita el archivo en tu Mac.
2. En Terminal:
   ```bash
   git add .
   git commit -m "ajuste"
   git push
   ```
3. Netlify lo despliega solo en 1–2 min.

---

# Estructura del proyecto

```
Lotes_de_espana/
├── README.md                   ← este archivo
├── package.json                ← dependencias
├── vite.config.js              ← config del bundler
├── netlify.toml                ← config de Netlify
├── .env.example                ← plantilla de variables
├── index.html
├── public/seed/                ← imágenes de ejemplo + logo
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── styles/globals.css
│   ├── lib/
│   │   ├── supabase.js
│   │   ├── api.js
│   │   └── constants.js        ← incluye DEFAULT_PROMPT_TEMPLATE
│   └── components/
│       ├── Sidebar.jsx
│       ├── Catalog.jsx
│       ├── ProductsScreen.jsx
│       ├── ProductEditOverlay.jsx
│       ├── HistoryScreen.jsx
│       ├── SettingsScreen.jsx
│       ├── BodegonOverlay.jsx
│       ├── ImportExcelModal.jsx
│       └── icons.jsx
├── netlify/functions/
│   └── generate-bodegon.js     ← función serverless que llama a Gemini
└── supabase/schema.sql         ← script SQL para crear tablas + buckets
```

---

# Problemas frecuentes

**"Falta GEMINI_API_KEY"** al generar.
Las variables de entorno en Netlify no estaban guardadas, o no has hecho un nuevo deploy. Revisa el paso 10 y vuelve a desplegar (`Trigger deploy → Clear cache and deploy site`).

**El bodegón se queda en "Generando..." sin parar**.
Mira en Netlify → **Functions → generate-bodegon → Logs**. Suele ser:
- Cuota de Gemini agotada.
- Producto sin foto en Supabase Storage.
- Modelo de Gemini no disponible en tu región (cambia `GEMINI_IMAGE_MODEL` por otro de imagen).

**No se ven mis productos**.
Revisa en Supabase → **Table editor → products**. Si la tabla está vacía, sube uno o ejecuta el bloque de "DATOS DE EJEMPLO" del `schema.sql`.

**Subida de imágenes falla**.
En Supabase → **Storage → productos** comprueba que el bucket existe y es **public**. Si no, el script `schema.sql` lo crea, vuélvelo a ejecutar.

**La web se ve sin estilos**.
Borra `node_modules` y `dist` y vuelve a `npm install && npm run build`. En Netlify, fuerza un nuevo deploy.

---

# Siguientes pasos (opcional)

- Activar **autenticación** (Supabase Auth) si no quieres que la web esté abierta a todo el mundo.
- Comprar dominio en Netlify y apuntar `lotesdeespana.es` al sitio.
- Mejorar el prompt iterando con casos reales (lo haces desde Configuración).

---

¡Disfruta!
