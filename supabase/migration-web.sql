-- ============================================================================
-- MIGRACIÓN — Sección "Web" del panel: buckets para etiquetas, fotos de
-- lotes y documento maestro (Excel de textos).
-- ============================================================================
-- Pegar en Supabase → SQL Editor → Run. Idempotente.
-- ============================================================================

-- Buckets nuevos, todos públicos (mismo patrón que productos / bodegones).
INSERT INTO storage.buckets (id, name, public)
VALUES ('etiquetas', 'etiquetas', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('lotes', 'lotes', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Policies de lectura/escritura abiertas (mientras la app no tiene login
-- todavía usamos anon como en el resto). Si en el futuro añades login,
-- restringir estas policies.
DROP POLICY IF EXISTS "etiquetas_read"   ON storage.objects;
DROP POLICY IF EXISTS "etiquetas_insert" ON storage.objects;
DROP POLICY IF EXISTS "etiquetas_update" ON storage.objects;
DROP POLICY IF EXISTS "etiquetas_delete" ON storage.objects;
DROP POLICY IF EXISTS "lotes_read"       ON storage.objects;
DROP POLICY IF EXISTS "lotes_insert"     ON storage.objects;
DROP POLICY IF EXISTS "lotes_update"     ON storage.objects;
DROP POLICY IF EXISTS "lotes_delete"     ON storage.objects;
DROP POLICY IF EXISTS "documents_read"   ON storage.objects;
DROP POLICY IF EXISTS "documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "documents_update" ON storage.objects;
DROP POLICY IF EXISTS "documents_delete" ON storage.objects;

CREATE POLICY "etiquetas_read"   ON storage.objects FOR SELECT USING (bucket_id = 'etiquetas');
CREATE POLICY "etiquetas_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'etiquetas');
CREATE POLICY "etiquetas_update" ON storage.objects FOR UPDATE USING (bucket_id = 'etiquetas');
CREATE POLICY "etiquetas_delete" ON storage.objects FOR DELETE USING (bucket_id = 'etiquetas');

CREATE POLICY "lotes_read"       ON storage.objects FOR SELECT USING (bucket_id = 'lotes');
CREATE POLICY "lotes_insert"     ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'lotes');
CREATE POLICY "lotes_update"     ON storage.objects FOR UPDATE USING (bucket_id = 'lotes');
CREATE POLICY "lotes_delete"     ON storage.objects FOR DELETE USING (bucket_id = 'lotes');

CREATE POLICY "documents_read"   ON storage.objects FOR SELECT USING (bucket_id = 'documents');
CREATE POLICY "documents_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documents');
CREATE POLICY "documents_update" ON storage.objects FOR UPDATE USING (bucket_id = 'documents');
CREATE POLICY "documents_delete" ON storage.objects FOR DELETE USING (bucket_id = 'documents');
