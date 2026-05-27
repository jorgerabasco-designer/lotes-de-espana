-- ============================================================================
-- MIGRACIÓN — Etiquetas en lotes (no productos) + tiempo de generación
-- ============================================================================
-- Pegar en Supabase → SQL Editor → Run. Es idempotente, se puede ejecutar
-- varias veces sin problema.
--
-- Cambios:
--   1. Añade columnas `tags` y `generation_seconds` a `bodegones`.
--   2. Vacía las etiquetas de los productos (ahora se gestionan a nivel de
--      lote, no de producto). Si quieres conservar el dato como histórico,
--      comenta el UPDATE de products.tags.
-- ============================================================================

-- 1) bodegones: nuevas columnas
ALTER TABLE bodegones ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE bodegones ADD COLUMN IF NOT EXISTS generation_seconds INTEGER;

-- 2) products: limpiar etiquetas (las etiquetas ya no son de producto)
--    Si prefieres NO borrarlas, comenta el siguiente UPDATE.
UPDATE products SET tags = '{}' WHERE array_length(tags, 1) > 0;

-- ============================================================================
-- COMPROBACIÓN (opcional)
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'bodegones' AND column_name IN ('tags','generation_seconds');
-- SELECT COUNT(*) FROM products WHERE array_length(tags, 1) > 0; -- debe ser 0
