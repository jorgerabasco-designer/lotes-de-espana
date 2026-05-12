import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { I } from './icons.jsx';
import { useTaxonomy } from '../lib/taxonomy.jsx';
import { optimizeImage, formatBytes } from '../lib/image-optimize.js';

// Sinónimos aceptados en cabeceras del Excel (insensibles a mayúsculas/acentos)
const FIELD_ALIASES = {
  ref: ['ref', 'referencia', 'referencia (rp)', 'referencia (rp) *', 'rp', 'sku', 'codigo'],
  name: ['nombre', 'nombre *', 'producto', 'name', 'title'],
  brand: ['marca', 'marca *', 'brand', 'fabricante'],
  cat: ['categoria', 'categoria *', 'cat', 'familia', 'tipo', 'category'],
  h: ['alto', 'alto *', 'altura', 'h', 'height', 'alto (cm)', 'alto (cm) *'],
  w: ['ancho', 'ancho *', 'anchura', 'w', 'width', 'ancho (cm)', 'ancho (cm) *'],
  d: ['fondo', 'fondo *', 'profundidad', 'd', 'depth', 'fondo (cm)', 'fondo (cm) *'],
  posicion: ['posicion', 'posición', 'position', 'posicion sugerida', 'posición sugerida'],
  tags: ['tags', 'etiquetas', 'etiquetas (separadas por coma)', 'attributes'],
  descripcion_visual: ['descripcion visual', 'descripción visual', 'descripcion_visual', 'descripcion visual (ingles, para ia)', 'descripción visual (inglés, para ia)', 'visual description'],
  notas: ['notas', 'notas internas', 'notes', 'observaciones'],
};

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .trim();

function detectColumns(headers) {
  const map = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = headers.findIndex(h => aliases.includes(norm(h)));
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

function normalizeCat(raw) {
  if (!raw) return 'otros';
  const c = norm(raw);
  if (c.includes('vino')) return 'vinos';
  if (c.includes('aceite') || c.includes('aove')) return 'aceites';
  if (c.includes('turr')) return 'turrones';
  if (c.includes('conserva') || c.includes('lata')) return 'conservas';
  if (c.includes('galleta') || c.includes('biscuit')) return 'galletas';
  if (c.includes('dulce')) return 'dulces';
  if (c.includes('snack') || c.includes('frut')) return 'snacks';
  return c.replace(/\s+/g, '-');
}

function normalizePosicion(raw) {
  if (!raw) return null;
  const v = norm(raw);
  if (v.startsWith('tras') || v === 'back') return 'TRASERA';
  if (v.startsWith('med')  || v === 'middle') return 'MEDIA';
  if (v.startsWith('del')  || v === 'front') return 'DELANTERA';
  return null;
}

function parseTags(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;|]/)
    .map(t => norm(t).replace(/\s+/g, '-'))
    .filter(Boolean);
}

const REF_RE = /^[0-9]{2}[A-Z]{2}[0-9]{3}$/;

export default function ImportExcelModal({ open, onClose, onImport, existingSkus = [] }) {
  const [stage, setStage] = useState('drop'); // drop | review | importing | done
  const [dragOver, setDragOver] = useState(false);
  const [parsedProducts, setParsedProducts] = useState([]); // [{ data, photoFile, status }]
  const [duplicateSkus, setDuplicateSkus] = useState([]); // SKUs ya existentes en BD
  const [invalidRows, setInvalidRows] = useState([]); // [{ rowNumber, reason }]
  const [excelName, setExcelName] = useState('');
  const [photoFiles, setPhotoFiles] = useState([]); // File[]
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [doneCount, setDoneCount] = useState(0);
  const [savingsInfo, setSavingsInfo] = useState(null);
  const fileRef = useRef(null);
  const { } = useTaxonomy();

  const existingSet = useMemo(
    () => new Set((existingSkus || []).map(s => String(s).toUpperCase())),
    [existingSkus]
  );

  useEffect(() => {
    if (!open) {
      setStage('drop');
      setDragOver(false);
      setParsedProducts([]);
      setDuplicateSkus([]);
      setInvalidRows([]);
      setExcelName('');
      setPhotoFiles([]);
      setBusy(false);
      setProgress(null);
      setDoneCount(0);
      setSavingsInfo(null);
    }
  }, [open]);

  if (!open) return null;

  // ---------- Procesar archivos arrastrados ----------
  const processFiles = async (files) => {
    const fileArr = Array.from(files || []);
    const excelFile = fileArr.find(f => /\.(xlsx|xlsm|csv)$/i.test(f.name));
    const imageFiles = fileArr.filter(f => f.type.startsWith('image/'));

    if (!excelFile) {
      alert('No se ha encontrado un archivo Excel (.xlsx o .csv) en lo que has arrastrado. Asegúrate de incluirlo.');
      return;
    }

    setExcelName(excelFile.name);
    setPhotoFiles(imageFiles);

    // Mapear imágenes por referencia (nombre del archivo sin extensión)
    const imageMap = {};
    imageFiles.forEach(f => {
      const base = f.name.replace(/\.[^.]+$/, '').toUpperCase().trim();
      if (!imageMap[base]) imageMap[base] = f;
    });

    // Parsear el Excel
    const buf = await excelFile.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    // Hoja "Productos" si existe, si no la primera
    const sheetName = wb.SheetNames.find(n => norm(n) === 'productos') || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 2) {
      alert('El Excel está vacío o no tiene cabecera reconocible.');
      return;
    }

    // Detectar la fila de cabecera (puede haber filas de título arriba)
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const candidate = rows[i].map(String);
      const m = detectColumns(candidate);
      if (m.ref != null && m.name != null) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx < 0) {
      alert('No se han detectado las columnas obligatorias en las primeras 10 filas. Usa la plantilla descargable.');
      return;
    }
    const headers = rows[headerRowIdx].map(String);
    const colMap = detectColumns(headers);
    const dataRows = rows.slice(headerRowIdx + 1);

    // Convertir filas en productos
    const products = [];
    const dups = [];
    const invalid = [];
    const seenRefs = new Set();

    dataRows.forEach((r, idx) => {
      // saltar filas totalmente vacías
      if (!r.some(c => c !== '' && c != null)) return;

      const get = (k) => colMap[k] != null ? r[colMap[k]] : '';
      const refRaw = String(get('ref') || '').trim().toUpperCase();
      const name = String(get('name') || '').trim();
      const brand = String(get('brand') || '').trim();
      const rowNumber = headerRowIdx + 2 + idx; // fila visible en Excel (1-indexed)

      if (!refRaw && !name) return; // fila vacía

      // Saltar fila de ejemplo (texto en cursiva en plantilla)
      if (refRaw === '07VR221' && name.toLowerCase().includes('cava brut reserva carta nevada')) return;

      if (!REF_RE.test(refRaw)) {
        invalid.push({ rowNumber, reason: `Referencia "${refRaw || '(vacía)'}" no válida (formato 00XX000)` });
        return;
      }
      if (!name) {
        invalid.push({ rowNumber, reason: `Falta el nombre (ref. ${refRaw})` });
        return;
      }
      if (seenRefs.has(refRaw)) {
        invalid.push({ rowNumber, reason: `Referencia "${refRaw}" duplicada en el Excel` });
        return;
      }
      seenRefs.add(refRaw);

      if (existingSet.has(refRaw)) {
        dups.push(refRaw);
        return;
      }

      const product = {
        sku: refRaw,
        name,
        brand,
        cat: normalizeCat(get('cat')),
        h: Number(get('h') || 0),
        w: Number(get('w') || 0),
        d: Number(get('d') || 0),
        posicion: normalizePosicion(get('posicion')),
        tags: parseTags(get('tags')),
        descripcion_visual: String(get('descripcion_visual') || '').trim(),
        notas: String(get('notas') || '').trim(),
      };

      products.push({
        data: product,
        photoFile: imageMap[refRaw] || null,
      });
    });

    setParsedProducts(products);
    setDuplicateSkus(dups);
    setInvalidRows(invalid);
    setStage('review');
  };

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    processFiles(e.dataTransfer?.files);
  };
  const handleFileInput = (e) => {
    processFiles(e.target.files);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeProduct = (sku) => {
    setParsedProducts(items => items.filter(it => it.data.sku !== sku));
  };

  const newWithPhoto = parsedProducts.filter(p => p.photoFile).length;
  const newWithoutPhoto = parsedProducts.length - newWithPhoto;

  const handleConfirm = async () => {
    if (parsedProducts.length === 0) return;
    setBusy(true);
    setStage('importing');
    setDoneCount(0);
    let totalSaved = 0; // bytes ahorrados por compresión
    let totalOptimized = 0; // nº fotos optimizadas
    try {
      let i = 0;
      for (const item of parsedProducts) {
        setProgress({ current: item.data.sku, name: item.data.name, i, total: parsedProducts.length, phase: 'optimize' });
        let finalItem = item;
        if (item.photoFile) {
          try {
            const result = await optimizeImage(item.photoFile);
            if (result.optimized) {
              totalSaved += (result.originalSize - result.newSize);
              totalOptimized++;
            }
            finalItem = { ...item, photoFile: result.file };
          } catch (e) {
            console.warn('Sin optimización para', item.data.sku, e);
          }
        }
        setProgress({ current: item.data.sku, name: item.data.name, i, total: parsedProducts.length, phase: 'upload' });
        await onImport(finalItem);
        i++;
        setDoneCount(i);
      }
      setStage('done');
      setSavingsInfo({ optimized: totalOptimized, saved: totalSaved });
    } catch (e) {
      alert('Error durante la importación: ' + (e.message || e));
      setStage('review');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="dl-back" onClick={busy ? undefined : onClose}>
      <div className="ie-modal" onClick={e => e.stopPropagation()}>
        <div className="ie-head">
          <div>
            <div className="ie-eye">Importación</div>
            <div className="ie-title">Importar productos</div>
          </div>
          <button className="ie-x" onClick={onClose} disabled={busy}>{I.close({ size: 18 })}</button>
        </div>

        <div className="ie-steps">
          {['Subir archivos', 'Revisar', 'Confirmar'].map((s, i) => {
            const idx = ['drop', 'review', 'importing', 'done'].indexOf(stage);
            const stepIdx = stage === 'importing' || stage === 'done' ? 2 : (stage === 'review' ? 1 : 0);
            const on = i <= stepIdx;
            return (
              <div key={s} className={`ie-step ${i === stepIdx ? 'cur' : ''} ${on ? 'on' : ''}`}>
                <span className="ie-step-n">{i + 1}</span>
                <span>{s}</span>
              </div>
            );
          })}
        </div>

        <div className="ie-body">
          {stage === 'drop' && (
            <>
              <div
                className={`ie-drop ${dragOver ? 'over' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="ie-drop-icon">{I.upload({ size: 28 })}</div>
                <div className="ie-drop-title">Arrastra aquí el Excel y las fotos</div>
                <div className="ie-drop-sub">
                  Selecciona el Excel rellenado y, si quieres, todas las fotos de los productos a la vez.
                  Los nombres de las fotos deben ser la referencia (p.ej. <code>03TC316.png</code>).
                </div>
                <button className="ie-drop-btn" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
                  Seleccionar archivos
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileInput}
                />
              </div>

              <div className="ie-tip">
                <div className="ie-tip-l">{I.sparkle({ size: 14 })}</div>
                <div>
                  <div className="ie-tip-t">Subida automatizada</div>
                  <div className="ie-tip-s">
                    Sube el Excel y las fotos de los productos con la referencia como nombre del archivo.
                    Los productos con referencia ya existente en tu catálogo se omitirán automáticamente
                    para no crear duplicados.
                    <span className="ie-tip-links">
                      <a href="/plantilla-productos.xlsx" download className="ie-template-link">Descargar plantilla Excel</a>
                      <span className="ie-link-sep">·</span>
                      <a href="/guia-fotografia.pdf" target="_blank" rel="noopener" className="ie-template-link">Guía de fotografía (PDF)</a>
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {stage === 'review' && (
            <>
              <div className="ie-summary">
                <div className="ie-sum-stat new">
                  <span className="ie-sum-n">{parsedProducts.length}</span>
                  <span className="ie-sum-l">productos nuevos</span>
                </div>
                <div className="ie-sum-stat">
                  <span className="ie-sum-n">{newWithPhoto}</span>
                  <span className="ie-sum-l">con foto</span>
                </div>
                <div className="ie-sum-stat">
                  <span className="ie-sum-n">{newWithoutPhoto}</span>
                  <span className="ie-sum-l">sin foto</span>
                </div>
                <div className="ie-sum-stat dup">
                  <span className="ie-sum-n">{duplicateSkus.length}</span>
                  <span className="ie-sum-l">duplicados (omitidos)</span>
                </div>
              </div>

              {invalidRows.length > 0 && (
                <div className="ie-warn">
                  <strong>{invalidRows.length}</strong> filas tienen errores y se omitirán:
                  <ul>
                    {invalidRows.slice(0, 5).map((r, i) => (
                      <li key={i}>Fila {r.rowNumber}: {r.reason}</li>
                    ))}
                    {invalidRows.length > 5 && <li>+ {invalidRows.length - 5} más…</li>}
                  </ul>
                </div>
              )}

              {parsedProducts.length === 0 ? (
                <div className="ie-empty">
                  No hay productos nuevos para importar. Quizá ya están todos en tu catálogo,
                  o hubo errores en el Excel.
                </div>
              ) : (
                <div className="ie-list">
                  <div className="ie-list-head">
                    <span>Referencia</span>
                    <span>Producto</span>
                    <span>Foto</span>
                    <span></span>
                  </div>
                  {parsedProducts.map((item) => (
                    <div key={item.data.sku} className="ie-list-row">
                      <span className="ie-mono">{item.data.sku}</span>
                      <span>
                        <div className="ie-list-name">{item.data.name}</div>
                        <div className="ie-list-meta">
                          {item.data.brand} · {item.data.cat}
                          {item.data.h ? ` · ${item.data.h}×${item.data.w}×${item.data.d}cm` : ''}
                        </div>
                      </span>
                      <span>
                        {item.photoFile ? (
                          <span className="ie-photo-yes">{I.check({ size: 12 })} {item.photoFile.name}</span>
                        ) : (
                          <span className="ie-photo-no">Sin foto</span>
                        )}
                      </span>
                      <button
                        className="ie-row-del"
                        onClick={() => removeProduct(item.data.sku)}
                        title="Quitar de la importación"
                      >{I.close({ size: 14 })}</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {stage === 'importing' && (
            <div className="ie-importing">
              <div className="ie-prog-orb"/>
              <div className="ie-prog-t">Importando productos…</div>
              <div className="ie-prog-s">
                {progress?.current ? (
                  <>
                    {progress.phase === 'optimize' ? 'Optimizando' : 'Subiendo'} <strong>{progress.current}</strong> · {progress.i + 1} de {progress.total}
                  </>
                ) : 'Preparando…'}
              </div>
              <div className="ie-prog-bar">
                <div
                  className="ie-prog-fill"
                  style={{ width: `${parsedProducts.length ? (doneCount / parsedProducts.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {stage === 'done' && (
            <div className="ie-done">
              <div className="ie-done-ic">{I.check({ size: 28 })}</div>
              <div className="ie-done-t">Importación completada</div>
              <div className="ie-done-s">
                {doneCount} {doneCount === 1 ? 'producto añadido' : 'productos añadidos'} a tu catálogo
                {newWithPhoto > 0 && ` (${newWithPhoto} con foto)`}.
              </div>
              {savingsInfo && savingsInfo.saved > 0 && (
                <div className="ie-done-savings">
                  Optimizamos {savingsInfo.optimized} {savingsInfo.optimized === 1 ? 'imagen' : 'imágenes'} y ahorramos {formatBytes(savingsInfo.saved)} de almacenamiento.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ie-foot">
          {stage === 'drop' && (
            <>
              <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary" disabled style={{ opacity: .4, cursor: 'not-allowed' }}>Continuar</button>
            </>
          )}
          {stage === 'review' && (
            <>
              <button className="btn btn-ghost" onClick={() => setStage('drop')}>← Volver</button>
              <button
                className="btn btn-primary"
                onClick={handleConfirm}
                disabled={parsedProducts.length === 0 || busy}
              >
                {I.upload({ size: 14 })} Importar {parsedProducts.length} {parsedProducts.length === 1 ? 'producto' : 'productos'}
              </button>
            </>
          )}
          {stage === 'importing' && (
            <button className="btn btn-ghost" disabled>Importando…</button>
          )}
          {stage === 'done' && (
            <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
          )}
        </div>

        <style>{`
          .dl-back{position:fixed;inset:0;background:rgba(20,16,12,.45);backdrop-filter:blur(6px);z-index:200;display:grid;place-items:center;animation:fadeIn .2s ease;padding:30px}
          .ie-modal{background:#fff;border-radius:18px;width:min(820px,96vw);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 30px 80px -20px rgba(45,42,38,.35);overflow:hidden;animation:slideIn .3s cubic-bezier(.2,.8,.2,1)}
          .ie-head{display:flex;justify-content:space-between;align-items:flex-start;padding:24px 26px 18px;border-bottom:1px solid var(--line)}
          .ie-eye{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:6px}
          .ie-title{font-family:'Fraunces',serif;font-weight:500;font-size:24px;letter-spacing:-.01em;color:var(--ink)}
          .ie-x{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;color:var(--muted);transition:all .15s;background:transparent}
          .ie-x:hover:not(:disabled){background:var(--bg);color:var(--ink)}
          .ie-x:disabled{opacity:.3}

          .ie-steps{display:flex;gap:8px;padding:14px 26px;border-bottom:1px solid var(--line);background:var(--paper);flex-wrap:wrap}
          .ie-step{display:flex;align-items:center;gap:7px;padding:6px 12px;border-radius:99px;font-size:12px;color:var(--muted);font-weight:500}
          .ie-step.on{color:var(--ink)}
          .ie-step.cur{background:var(--ink);color:#fff}
          .ie-step-n{width:18px;height:18px;border-radius:50%;background:var(--line);color:var(--ink);display:grid;place-items:center;font-size:10.5px;font-weight:600}
          .ie-step.cur .ie-step-n{background:#fff;color:var(--ink)}
          .ie-step.on:not(.cur) .ie-step-n{background:var(--accent);color:#fff}

          .ie-body{padding:24px 26px;flex:1;overflow-y:auto;min-height:280px}
          .ie-drop{border:1.5px dashed var(--line);border-radius:14px;padding:46px 24px;text-align:center;cursor:pointer;transition:all .15s;background:var(--paper)}
          .ie-drop:hover{border-color:var(--accent);background:rgba(167,77,74,.03)}
          .ie-drop.over{border-style:solid;border-color:var(--accent);background:var(--accent-soft)}
          .ie-drop-icon{width:60px;height:60px;border-radius:14px;background:#fff;border:1px solid var(--line);color:var(--accent);display:grid;place-items:center;margin:0 auto 14px}
          .ie-drop-title{font-family:'Fraunces',serif;font-size:19px;color:var(--ink);font-weight:500}
          .ie-drop-sub{font-size:12.5px;color:var(--muted);margin:8px auto 0;max-width:480px;line-height:1.55}
          .ie-drop-sub code{font-family:ui-monospace,Menlo,monospace;background:#fff;padding:1px 5px;border-radius:4px;border:1px solid var(--line);font-size:11px;color:var(--ink)}
          .ie-drop-btn{margin-top:16px;padding:9px 20px;border-radius:9px;background:var(--ink);color:#fff;font-size:12.5px;font-weight:600;border:none;cursor:pointer}
          .ie-drop-btn:hover{background:#000}

          .ie-tip{display:flex;gap:10px;padding:14px 16px;border-radius:10px;background:var(--accent-soft);margin-top:18px;align-items:flex-start}
          .ie-tip-l{color:var(--accent);margin-top:1px}
          .ie-tip-t{font-size:13px;font-weight:600;color:var(--ink)}
          .ie-tip-s{font-size:12px;color:var(--ink-2);margin-top:3px;line-height:1.55}
          .ie-tip-links{display:inline-flex;align-items:center;gap:4px;margin-top:4px;display:block}
          .ie-template-link{color:var(--accent);font-weight:600;text-decoration:underline}
          .ie-template-link:hover{text-decoration:none}
          .ie-link-sep{color:var(--muted);margin:0 6px}

          .ie-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
          .ie-sum-stat{padding:14px;background:var(--paper);border:1px solid var(--line);border-radius:10px;text-align:center}
          .ie-sum-stat.new{background:rgba(58,122,90,.06);border-color:rgba(58,122,90,.3)}
          .ie-sum-stat.dup{background:rgba(167,77,74,.04);border-color:rgba(167,77,74,.2)}
          .ie-sum-n{display:block;font-family:'Fraunces',serif;font-size:26px;color:var(--ink);font-weight:500}
          .ie-sum-stat.new .ie-sum-n{color:#3a7a5a}
          .ie-sum-stat.dup .ie-sum-n{color:var(--accent)}
          .ie-sum-l{font-size:11px;color:var(--muted);margin-top:2px;line-height:1.3;display:block}

          .ie-warn{padding:12px 14px;border-radius:10px;background:rgba(167,77,74,.06);border:1px solid var(--accent);color:var(--ink-2);font-size:12px;margin-bottom:14px}
          .ie-warn strong{color:var(--accent)}
          .ie-warn ul{margin:6px 0 0 18px;padding:0}
          .ie-warn li{margin-top:2px}

          .ie-empty{padding:40px 20px;text-align:center;color:var(--muted);font-size:13.5px;border:1px dashed var(--line);border-radius:10px}

          .ie-list{border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:12.5px;background:#fff}
          .ie-list-head{display:grid;grid-template-columns:90px 1fr 1.4fr 32px;gap:12px;padding:10px 14px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600;background:var(--paper);border-bottom:1px solid var(--line)}
          .ie-list-row{display:grid;grid-template-columns:90px 1fr 1.4fr 32px;gap:12px;padding:11px 14px;border-bottom:1px solid var(--line);align-items:center}
          .ie-list-row:last-child{border-bottom:none}
          .ie-list-row:hover{background:var(--paper)}
          .ie-list-name{font-weight:600;color:var(--ink)}
          .ie-list-meta{font-size:11px;color:var(--muted);margin-top:2px}
          .ie-mono{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--ink-2)}
          .ie-photo-yes{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#3a7a5a;font-weight:500}
          .ie-photo-no{font-size:11px;color:var(--accent);font-weight:500;background:var(--accent-soft);padding:3px 8px;border-radius:99px}
          .ie-row-del{width:24px;height:24px;border-radius:6px;background:transparent;color:var(--muted);display:grid;place-items:center;border:none;cursor:pointer;transition:all .12s}
          .ie-row-del:hover{background:var(--accent-soft);color:var(--accent)}

          .ie-importing{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:40px 20px;text-align:center;min-height:240px}
          .ie-prog-orb{width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,var(--accent-soft));box-shadow:0 0 0 0 var(--accent-soft);animation:ieOrb 1.4s ease-in-out infinite}
          @keyframes ieOrb{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(167,77,74,.4)}50%{transform:scale(1.08);box-shadow:0 0 0 18px rgba(167,77,74,0)}}
          .ie-prog-t{font-family:'Fraunces',serif;font-size:18px;color:var(--ink);margin-top:14px}
          .ie-prog-s{font-size:12.5px;color:var(--muted)}
          .ie-prog-bar{width:80%;height:6px;background:var(--line);border-radius:99px;overflow:hidden;margin-top:14px}
          .ie-prog-fill{height:100%;background:var(--accent);transition:width .3s}

          .ie-done{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:40px 20px;text-align:center;min-height:240px}
          .ie-done-ic{width:62px;height:62px;border-radius:50%;background:linear-gradient(135deg,#3a7a5a,#2F4A3D);color:#fff;display:grid;place-items:center;animation:donePop .5s cubic-bezier(.2,.8,.2,1)}
          @keyframes donePop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
          .ie-done-t{font-family:'Fraunces',serif;font-size:22px;color:var(--ink);margin-top:8px}
          .ie-done-s{font-size:13px;color:var(--muted);max-width:400px;line-height:1.55}
          .ie-done-savings{margin-top:14px;padding:8px 14px;background:rgba(58,122,90,.08);border:1px solid rgba(58,122,90,.3);border-radius:99px;font-size:12px;color:#3a7a5a;font-weight:500;max-width:480px;line-height:1.5}

          .ie-foot{display:flex;justify-content:space-between;gap:8px;padding:16px 26px;border-top:1px solid var(--line);background:var(--paper)}
          .btn{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:550;transition:all .15s;border:1px solid transparent;cursor:pointer}
          .btn:disabled{opacity:.55;cursor:not-allowed}
          .btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}
          .btn-ghost:hover:not(:disabled){border-color:#cdc4b3}
          .btn-primary{background:var(--accent);color:#fff;border:1px solid var(--accent)}
          .btn-primary:hover:not(:disabled){background:var(--accent-2)}

          @media (max-width: 720px){
            .ie-summary{grid-template-columns:repeat(2,1fr)}
            .ie-list-head, .ie-list-row{grid-template-columns:80px 1fr 80px 28px;font-size:11.5px}
          }
        `}</style>
      </div>
    </div>
  );
}
