-- ============================================================================
-- MUESTRAS / MEDIDAS — productos del cliente (sin foto)
-- Generado desde MUESTRA MEDIDAS.xlsx el 2026-05-20
-- ============================================================================
-- Idempotente: usa ON CONFLICT (ref) DO NOTHING.
-- Ejecutar en Supabase → SQL Editor.
-- Las fotos y la marca se completan después manualmente desde la web.

INSERT INTO products (ref, nombre, marca, categoria, categoria_id, alto, ancho, fondo) VALUES
  ('06FS037', 'PASAS THOMSON PRUNITA 80 GRS. DOYPACK', '', 'snacks', 'snacks', 18, 12, 2),
  ('06CP044', 'BONITO DEL NORTE MSC EN ACEITE DE OLIVA EMPERATRIZ 212 ML. FRASCO', '', 'conservas', 'conservas', 9.5, 6.5, 6.5),
  ('04VA009', 'TURRON DE GUIRLACHE PREMIUM EDITION 1880 150 GRS.', '', 'turrones', 'turrones', 9, 26, 1.5),
  ('06CF024', 'MERMELADA EXTRA DE MANGO CON JENGIBRE ZUBIA 50 GRS. MARIDAJE QUESOS Y FOIE TARRO CRISTAL', '', 'dulces', 'dulces', 4, 4.5, 4.5),
  ('05BO105', 'AMATLLONS AMATLLER 65 GRS. ESTUCHE UNICS', '', 'dulces', 'dulces', 15, 9, 6),
  ('05GA103', 'NAPOLITANAS CARAMELIZADAS CON CANELA SPECULOOS CUETARA 150 GRS.', '', 'galletas', 'galletas', 24, 17, 6),
  ('09QU284', 'QUESO OVEJA CURADO CON AL ROMERO GRANJA RINYA 200 GRS.', '', 'quesos', 'quesos', 9, 10, 4),
  ('05GA230', 'GALLETAS RELLENAS DE CHOCOLATE ELGORRIAGA 90 GRS. RULO', '', 'galletas', 'galletas', 6, 8, 6),
  ('06CP159', 'BONITO DEL NORTE FRINSA LA CONSERVERA 115 GRS. RIAS GALLEGAS LATA REDONDA', '', 'conservas', 'conservas', 6.5, 10.5, 3),
  ('05GA369', 'FILIPINOS NEGRO DE ARTIACH 67 GRS.', '', 'galletas', 'galletas', 5, 17, 4),
  ('06VA008', 'SAL Y TRUFA CARMENCITA MOLINILLO GOURMET 105 GRS.', '', 'conservas', 'conservas', 13.5, 4.5, 4.5),
  ('06CP108', 'BRANDADA DE BACALAO LA CUNA 75 GRS. TARRO', '', 'conservas', 'conservas', 6.5, 6, 6),
  ('05VA034', 'TOSTAS MARIÑEIRAS CON OREGANO Y TOMATE DAVEIGA 50 GRS. BOLSA', '', 'snacks', 'snacks', 13.5, 9, 4),
  ('09LO056', 'LOMO DE CEBO IBERICO 50% RAZA IBERICA IZQUIERDO 300 GRS. APROX.', '', 'charcuteria', 'charcuteria', 19.5, 5, 5),
  ('06CF044', 'PICOS DE DULCE DE MEMBRILLO CALIDAD PRIMERA AG 170 GRS. CAJA 8 PORCIONES', '', 'dulces', 'dulces', 11, 11, 2),
  ('03BL120', 'VINO BLANCO CONDE VALDEMAR VIURA,MALVASIA,SB Y GARNACHA 75 CL. RIOJA 12% VOL.', '', 'vinos', 'vinos', 29, 7.5, 7.5),
  ('01GI002', 'GINEBRA PREMIUM SIDERIT CLASSIC 50 CL. 43% VOL.', '', 'bebidas', 'bebidas', 20, 8, 8),
  ('01VA069', 'CREMA DE CHOCOLATE DUBAI PANIZO 70 CL. 17% VOL.', '', 'bebidas', 'bebidas', 26, 8, 8),
  ('02CA182', 'CAVA BRUT NATURE TANTUM ERGO CHARDONNAY PINOT NOIR 2022 75 CL. 12% VOL.', '', 'bebidas', 'bebidas', 3.5, 9, 9),
  ('07IB077', 'PALETA  IBERICA BELLOTA BEHER ROJA 4,8-5,3 KGS. APROX. ENFUNDADA', '', 'ibericos', 'ibericos', 6.5, 26, 7)
ON CONFLICT (ref) DO NOTHING;

-- 20 productos insertados (los que ya existieran se ignoran).
