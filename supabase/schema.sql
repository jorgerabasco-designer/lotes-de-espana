-- ============================================================================
-- LOTES DE ESPAÑA · Generador de Bodegones IA
-- Esquema SQL para Supabase
-- ============================================================================
-- Ejecutar este script entero en Supabase:
--   Dashboard → SQL Editor → "New query" → pegar todo → "Run".
-- ============================================================================


-- ============================================================================
-- TABLA: products
-- Catálogo de productos (todos los del cliente)
-- ============================================================================
CREATE TABLE IF NOT EXISTS products (
  ref TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  marca TEXT NOT NULL,
  categoria TEXT,                          -- legacy / texto libre
  categoria_id TEXT,                       -- id slug ('vinos','aceites'…)
  descripcion TEXT,
  alto NUMERIC(6, 2) NOT NULL,
  ancho NUMERIC(6, 2) NOT NULL,
  fondo NUMERIC(6, 2) NOT NULL,
  tipo_envase TEXT,
  color_dominante TEXT,
  posicion TEXT CHECK (posicion IN ('TRASERA', 'MEDIA', 'DELANTERA') OR posicion IS NULL),
  descripcion_visual TEXT,
  notas TEXT,
  foto_path TEXT,
  tags TEXT[] DEFAULT '{}',
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT ref_format CHECK (ref ~ '^[0-9]{2}[A-Z]{2}[0-9]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_products_categoria_id ON products(categoria_id);
CREATE INDEX IF NOT EXISTS idx_products_marca ON products(marca);
CREATE INDEX IF NOT EXISTS idx_products_posicion ON products(posicion);


-- ============================================================================
-- TABLA: bodegones
-- Histórico de bodegones generados con Gemini
-- ============================================================================
CREATE TABLE IF NOT EXISTS bodegones (
  ref TEXT PRIMARY KEY,
  numero INTEGER,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  productos JSONB NOT NULL,
  imagen_path TEXT,
  -- Estados:
  --   generating: en proceso de creación con Gemini
  --   draft: generación terminada, esperando confirmación del usuario
  --   completed: usuario pulsó "Guardar en historial"
  --   failed: error en la generación
  estado TEXT DEFAULT 'generating' CHECK (estado IN ('generating', 'draft', 'completed', 'failed')),
  prompt_usado TEXT,
  error_mensaje TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT bodegon_ref_format CHECK (ref ~ '^[0-9]{2}[A-Z]{2}[0-9]{3}$')
);

-- Si la tabla ya existe con un constraint sin 'draft', actualízalo.
DO $$
DECLARE c text;
BEGIN
  SELECT con.conname INTO c
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'bodegones' AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%estado%' AND pg_get_constraintdef(con.oid) NOT ILIKE '%draft%';
  IF c IS NOT NULL THEN
    EXECUTE 'ALTER TABLE bodegones DROP CONSTRAINT ' || quote_ident(c);
    EXECUTE 'ALTER TABLE bodegones ADD CONSTRAINT bodegones_estado_check CHECK (estado IN (''generating'', ''draft'', ''completed'', ''failed''))';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bodegones_created ON bodegones(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bodegones_estado ON bodegones(estado);
CREATE INDEX IF NOT EXISTS idx_bodegones_numero ON bodegones(numero DESC);


-- ============================================================================
-- TABLA: settings (clave/valor para configuración global)
-- Aquí se guarda, entre otras cosas, el prompt editable de Gemini.
-- ============================================================================
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- TRIGGERS para mantener updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- STORAGE BUCKETS (públicos: se sirven desde el frontend)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('productos', 'productos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('bodegones', 'bodegones', true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Acceso completo desde el frontend (anon).
-- IMPORTANTE: si en el futuro añades login, restringir a usuarios autenticados.
-- ============================================================================
ALTER TABLE products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bodegones ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_all" ON products;
CREATE POLICY "products_all" ON products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bodegones_all" ON bodegones;
CREATE POLICY "bodegones_all" ON bodegones FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "settings_all" ON settings;
CREATE POLICY "settings_all" ON settings FOR ALL USING (true) WITH CHECK (true);


-- ============================================================================
-- POLICIES de Storage
-- ============================================================================
DROP POLICY IF EXISTS "productos_read"   ON storage.objects;
DROP POLICY IF EXISTS "productos_insert" ON storage.objects;
DROP POLICY IF EXISTS "productos_update" ON storage.objects;
DROP POLICY IF EXISTS "productos_delete" ON storage.objects;
DROP POLICY IF EXISTS "bodegones_read"   ON storage.objects;
DROP POLICY IF EXISTS "bodegones_insert" ON storage.objects;

CREATE POLICY "productos_read"   ON storage.objects FOR SELECT USING (bucket_id = 'productos');
CREATE POLICY "productos_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'productos');
CREATE POLICY "productos_update" ON storage.objects FOR UPDATE USING (bucket_id = 'productos');
CREATE POLICY "productos_delete" ON storage.objects FOR DELETE USING (bucket_id = 'productos');

CREATE POLICY "bodegones_read"   ON storage.objects FOR SELECT USING (bucket_id = 'bodegones');
CREATE POLICY "bodegones_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'bodegones');


-- ============================================================================
-- DATOS DE EJEMPLO — los 7 productos del Excel original
-- (se pueden borrar si no los quieres precargados)
-- ============================================================================
INSERT INTO products (ref, nombre, marca, categoria, categoria_id, alto, ancho, fondo, tipo_envase, color_dominante, posicion, descripcion_visual, notas, tags) VALUES
('03TC316', 'Bardos Viñedos de Altura', 'Bardos', 'Vino tinto', 'vinos', 30, 8, 8, 'botella vidrio oscuro', 'black and white', 'TRASERA', 'dark glass bottle with white capsule and white label showing bare winter tree illustrations, Ribera del Duero DO', 'Etiqueta blanca con árboles. DO Ribera del Duero.', ARRAY['con-alcohol']),
('06AC044', 'NOS Everyday Aceite de Oliva Virgen Extra', 'NOS', 'Aceite', 'aceites', 24, 5, 5, 'botella vidrio oscuro', 'purple and yellow', 'TRASERA', 'dark glass bottle with vibrant purple label, yellow sun graphic, purple cap', 'Etiqueta morada vibrante con sol amarillo.', ARRAY['bio','vegano']),
('04JI002', 'Picó Turrón de Jijona Calidad Suprema', 'Picó', 'Turrón', 'turrones', 9, 18.5, 2.2, 'caja cartón rectangular plana', 'white and burgundy', 'DELANTERA', 'flat rectangular cardboard box, landscape orientation, burgundy "PICÓ" lettering and craftsman illustration', 'Caja horizontal apaisada. Colocar tumbada en primer plano.', ARRAY['sin-gluten']),
('05BO127', 'Cudié Catanias Original', 'Cudié', 'Dulces', 'turrones', 16, 8.5, 3, 'caja cartón vertical estrecha', 'white and black', 'MEDIA', 'tall narrow vertical cardboard box with photographic image of cocoa-dusted almonds on the front', 'Caja vertical alta. Imagen de almendras en la cara.', ARRAY['sin-gluten']),
('05GA043', 'Lady Joseph Artisan Vegan Biscuits Chocolate Filled', 'Lady Joseph', 'Galletas', 'snacks', 15, 6.4, 6.4, 'caja cartón vertical cuadrada', 'mustard yellow and green', 'MEDIA', 'square vertical cardboard box, mustard yellow with green botanical illustrations of cocoa pods and leaves, white central label', 'Caja amarillo mostaza con ilustraciones botánicas.', ARRAY['vegano']),
('06CP103', 'Emperatriz Bonito del Norte en AOVE Bio', 'Emperatriz', 'Conservas', 'conservas', 6.8, 11, 3, 'lata rectangular plana', 'white and navy blue', 'DELANTERA', 'flat rectangular tin in landscape orientation, watercolor illustrations of fish and green olives around navy central label with gold lettering', 'Lata apaisada. Etiqueta con peces y olivas en acuarela.', ARRAY['bio','sin-gluten']),
('06FS069', 'Finca La Rosala Almendra Marcona AOVE & Sal', 'Finca La Rosala', 'Frutos secos', 'snacks', 6, 6, 6, 'tarro cristal con tapa negra', 'clear glass with green', 'DELANTERA', 'small cube glass jar with black metal lid and green spoon-shaped tag-style label hanging from the lid, roasted Marcona almonds visible inside', 'Tarro de cristal pequeño. Etiqueta verde tipo cuchara.', ARRAY['vegano','sin-gluten','bio'])
ON CONFLICT (ref) DO NOTHING;


-- ============================================================================
-- COMPROBACIÓN
-- ============================================================================
-- SELECT COUNT(*) FROM products;
-- SELECT COUNT(*) FROM bodegones;
-- SELECT id, name, public FROM storage.buckets WHERE id IN ('productos', 'bodegones');
