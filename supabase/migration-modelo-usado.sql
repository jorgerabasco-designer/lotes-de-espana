-- ============================================================================
-- MIGRACIÓN — Guarda qué modelo de Gemini se usó para cada bodegón
-- ============================================================================
-- Pegar en Supabase → SQL Editor → Run. Idempotente.
-- ============================================================================

ALTER TABLE bodegones ADD COLUMN IF NOT EXISTS modelo_usado TEXT;
