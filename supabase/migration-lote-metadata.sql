-- ============================================================================
-- MIGRACIÓN — Tabla lote_metadata: títulos y descripciones sincronizadas
-- desde lotesdeespana.es (para usar en los PDFs de descripción).
-- ============================================================================
-- Pegar en Supabase → SQL Editor → Run. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lote_metadata (
  numero TEXT PRIMARY KEY,          -- '100', '104', '216', …
  titulo TEXT,                       -- H1 del lote en la web (ej. "Lote de Navidad Original 100")
  descripcion TEXT,                  -- Texto largo tal cual sale en la ficha
  imagen_url TEXT,                   -- URL absoluta de la foto grande
  page_url TEXT,                     -- URL absoluta de la ficha en lotesdeespana.es
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lote_metadata_updated ON lote_metadata(updated_at DESC);

ALTER TABLE lote_metadata ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lote_metadata_all" ON lote_metadata;
CREATE POLICY "lote_metadata_all" ON lote_metadata FOR ALL USING (true) WITH CHECK (true);

-- Trigger para mantener updated_at fresco al hacer UPSERT.
DROP TRIGGER IF EXISTS update_lote_metadata_updated_at ON lote_metadata;
CREATE TRIGGER update_lote_metadata_updated_at
  BEFORE UPDATE ON lote_metadata
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
