import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { I } from './icons.jsx';
import { CAT_LABELS } from '../lib/constants.js';

const FIELD_ALIASES = {
  ref:   ['ref','referencia','rp','sku','codigo','código'],
  name:  ['nombre','producto','name','title','descripcion','descripción'],
  brand: ['marca','brand','fabricante'],
  cat:   ['categoria','categoría','cat','familia','tipo'],
  h:     ['alto','altura','h','height'],
  w:     ['ancho','anchura','w','width'],
  d:     ['fondo','profundidad','d','depth','prof'],
};

function detectColumns(headers) {
  const map = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = headers.findIndex(h => {
      const norm = String(h || '').toLowerCase().trim();
      return aliases.includes(norm);
    });
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

function normalizeCat(raw) {
  if (!raw) return 'otros';
  const c = String(raw).toLowerCase();
  if (c.includes('vino')) return 'vinos';
  if (c.includes('aceite') || c.includes('aove')) return 'aceites';
  if (c.includes('turr')) return 'turrones';
  if (c.includes('conserva') || c.includes('lata')) return 'conservas';
  if (c.includes('galleta')) return 'galletas';
  if (c.includes('dulce')) return 'dulces';
  if (c.includes('snack') || c.includes('frut')) return 'snacks';
  return c.replace(/\s+/g, '-');
}

export default function ImportExcelModal({ open, onClose, onImport }) {
  const [stage, setStage] = useState('drop');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [colMap, setColMap] = useState({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  if (!open) return null;

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length < 2) {
      alert('El archivo está vacío o no tiene cabecera.');
      return;
    }
    const hdrs = data[0].map(String);
    const detect = detectColumns(hdrs);
    setHeaders(hdrs);
    setColMap(detect);
    setRows(data.slice(1).filter(r => r.some(c => c !== '')));
    setStage('mapping');
  };

  const products = rows.map(r => {
    const get = (k) => colMap[k] != null ? r[colMap[k]] : '';
    return {
      sku: String(get('ref') || '').trim().toUpperCase(),
      name: String(get('name') || '').trim(),
      brand: String(get('brand') || '').trim(),
      cat: normalizeCat(get('cat')),
      h: Number(get('h') || 0),
      w: Number(get('w') || 0),
      d: Number(get('d') || 0),
      tags: [],
    };
  }).filter(p => p.sku && p.name);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onImport(products);
      onClose();
      setStage('drop');
      setRows([]); setFileName('');
    } catch (e) {
      alert('Error al importar: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dl-back" onClick={onClose}>
      <div className="ie-modal" onClick={e => e.stopPropagation()}>
        <div className="ie-head">
          <div>
            <div className="ie-eye">Importación</div>
            <div className="ie-title">Importar productos desde Excel</div>
          </div>
          <button className="ie-x" onClick={onClose}>{I.close({ size: 18 })}</button>
        </div>

        <div className="ie-steps">
          {['Subir archivo', 'Revisar columnas', 'Confirmar'].map((s, i) => {
            const idx = ['drop', 'mapping', 'preview'].indexOf(stage);
            const on = i <= idx;
            return (
              <div key={s} className={`ie-step ${i === idx ? 'cur' : ''} ${on ? 'on' : ''}`}>
                <span className="ie-step-n">{i + 1}</span>
                <span>{s}</span>
              </div>
            );
          })}
        </div>

        <div className="ie-body">
          {stage === 'drop' && (
            <>
              <div className="ie-drop" onClick={() => fileRef.current?.click()}>
                <div className="ie-drop-icon">{I.excel({ size: 28 })}</div>
                <div className="ie-drop-title">Arrastra tu archivo Excel aquí</div>
                <div className="ie-drop-sub">o haz clic para seleccionar · .xlsx, .csv hasta 10 MB</div>
                <button className="ie-drop-btn" onClick={(e)=>{e.stopPropagation();fileRef.current?.click();}}>Seleccionar archivo</button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={e => handleFile(e.target.files?.[0])}
                />
              </div>
              <div className="ie-tip">
                <div className="ie-tip-l">{I.sparkle({ size: 14 })}</div>
                <div>
                  <div className="ie-tip-t">Mapeo automático</div>
                  <div className="ie-tip-s">Detectamos automáticamente referencia, nombre, marca, categoría y dimensiones aunque las columnas tengan nombres distintos.</div>
                </div>
              </div>
            </>
          )}

          {stage === 'mapping' && (
            <>
              <div className="ie-file">
                <div className="ie-file-l">
                  <div className="ie-file-ic">{I.excel({ size: 18 })}</div>
                  <div>
                    <div className="ie-file-n">{fileName}</div>
                    <div className="ie-file-s">{rows.length} filas detectadas · {headers.length} columnas</div>
                  </div>
                </div>
                <button className="ie-file-x" onClick={() => { setStage('drop'); setRows([]); }}>Cambiar</button>
              </div>
              <div className="ie-map">
                <div className="ie-map-h">
                  <span>Campo Lotes</span>
                  <span>Columna detectada</span>
                </div>
                {[
                  { key: 'ref',   label: 'Referencia (RP)' },
                  { key: 'name',  label: 'Nombre' },
                  { key: 'brand', label: 'Marca' },
                  { key: 'cat',   label: 'Categoría' },
                  { key: 'h',     label: 'Alto (cm)' },
                  { key: 'w',     label: 'Ancho (cm)' },
                  { key: 'd',     label: 'Fondo (cm)' },
                ].map(c => (
                  <div key={c.key} className="ie-map-row">
                    <div className="ie-map-l">{c.label}</div>
                    <div className="ie-map-arr">→</div>
                    <div className="ie-map-r">
                      <select
                        value={colMap[c.key] != null ? colMap[c.key] : ''}
                        onChange={e => setColMap({ ...colMap, [c.key]: e.target.value === '' ? null : Number(e.target.value) })}
                      >
                        <option value="">— sin mapear —</option>
                        {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                      {colMap[c.key] != null && <span className="ie-map-ok">{I.check({ size: 13 })}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {stage === 'preview' && (
            <>
              <div className="ie-summary">
                <div className="ie-sum-stat">
                  <span className="ie-sum-n">{products.length}</span>
                  <span className="ie-sum-l">productos listos</span>
                </div>
                <div className="ie-sum-stat">
                  <span className="ie-sum-n">{rows.length - products.length}</span>
                  <span className="ie-sum-l">omitidos (sin RP/nombre)</span>
                </div>
                <div className="ie-sum-stat">
                  <span className="ie-sum-n">0</span>
                  <span className="ie-sum-l">errores</span>
                </div>
              </div>
              <div className="ie-table">
                <div className="ie-table-h">
                  <span>Referencia</span><span>Producto</span><span>Marca</span><span>Categoría</span><span>Dimensiones</span>
                </div>
                {products.slice(0, 8).map(p => (
                  <div key={p.sku} className="ie-table-row">
                    <span className="ie-mono">{p.sku}</span>
                    <span className="ie-name">{p.name}</span>
                    <span>{p.brand}</span>
                    <span className="ie-cat">{CAT_LABELS[p.cat] || p.cat}</span>
                    <span className="ie-mono">{p.h}×{p.w}×{p.d}</span>
                  </div>
                ))}
                {products.length > 8 && <div className="ie-table-more">+ {products.length - 8} productos más</div>}
              </div>
            </>
          )}
        </div>

        <div className="ie-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          {stage === 'drop' && <button className="btn btn-primary" disabled style={{ opacity: .4, cursor: 'not-allowed' }}>Continuar</button>}
          {stage === 'mapping' && (
            <button className="btn btn-primary" onClick={() => setStage('preview')} disabled={colMap.ref == null || colMap.name == null}>
              Vista previa →
            </button>
          )}
          {stage === 'preview' && (
            <button className="btn btn-primary" onClick={handleConfirm} disabled={busy}>
              {busy ? 'Importando…' : `Importar ${products.length} productos`}
            </button>
          )}
        </div>

        <style>{`
          .dl-back{position:fixed;inset:0;background:rgba(20,16,12,.45);backdrop-filter:blur(6px);z-index:200;display:grid;place-items:center;animation:fadeIn .2s ease;padding:30px}
          .ie-modal{background:#fff;border-radius:18px;width:min(720px,94vw);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 30px 80px -20px rgba(45,42,38,.35);overflow:hidden;animation:slideIn .3s cubic-bezier(.2,.8,.2,1)}
          .ie-head{display:flex;justify-content:space-between;align-items:flex-start;padding:24px 26px 18px;border-bottom:1px solid var(--line)}
          .ie-eye{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:6px}
          .ie-title{font-family:'Fraunces',serif;font-weight:500;font-size:22px;letter-spacing:-.01em;color:var(--ink)}
          .ie-x{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;color:var(--muted);transition:all .15s}
          .ie-x:hover{background:var(--bg);color:var(--ink)}
          .ie-steps{display:flex;gap:8px;padding:14px 26px;border-bottom:1px solid var(--line);background:var(--paper);flex-wrap:wrap}
          .ie-step{display:flex;align-items:center;gap:7px;padding:6px 12px;border-radius:99px;font-size:12px;color:var(--muted);font-weight:500}
          .ie-step.on{color:var(--ink)}
          .ie-step.cur{background:var(--ink);color:#fff}
          .ie-step-n{width:18px;height:18px;border-radius:50%;background:var(--line);color:var(--ink);display:grid;place-items:center;font-size:10.5px;font-weight:600}
          .ie-step.cur .ie-step-n{background:#fff;color:var(--ink)}
          .ie-step.on:not(.cur) .ie-step-n{background:var(--accent);color:#fff}

          .ie-body{padding:24px 26px;flex:1;overflow-y:auto;min-height:280px}
          .ie-drop{border:1.5px dashed var(--line);border-radius:14px;padding:38px 20px;text-align:center;cursor:pointer;transition:all .15s;background:var(--paper)}
          .ie-drop:hover{border-color:var(--accent);background:rgba(167,77,74,.03)}
          .ie-drop-icon{width:54px;height:54px;border-radius:14px;background:#fff;border:1px solid var(--line);color:var(--accent);display:grid;place-items:center;margin:0 auto 12px}
          .ie-drop-title{font-family:'Fraunces',serif;font-size:17px;color:var(--ink);font-weight:500}
          .ie-drop-sub{font-size:12.5px;color:var(--muted);margin-top:6px}
          .ie-drop-btn{margin-top:16px;padding:8px 18px;border-radius:9px;background:var(--ink);color:#fff;font-size:12.5px;font-weight:600}
          .ie-tip{display:flex;gap:10px;padding:12px 14px;border-radius:10px;background:var(--accent-soft);margin-top:16px;align-items:flex-start}
          .ie-tip-l{color:var(--accent);margin-top:1px}
          .ie-tip-t{font-size:12.5px;font-weight:600;color:var(--ink)}
          .ie-tip-s{font-size:11.5px;color:var(--ink-2);margin-top:2px;line-height:1.5}

          .ie-file{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:10px;margin-bottom:18px;background:var(--paper)}
          .ie-file-l{display:flex;gap:10px;align-items:center}
          .ie-file-ic{width:32px;height:32px;border-radius:8px;background:rgba(47,74,61,.08);color:var(--olive);display:grid;place-items:center}
          .ie-file-n{font-size:13px;font-weight:600;color:var(--ink)}
          .ie-file-s{font-size:11px;color:var(--muted);margin-top:2px}
          .ie-file-x{font-size:11.5px;color:var(--accent);font-weight:600;padding:4px 8px;border-radius:6px}
          .ie-file-x:hover{background:var(--accent-soft)}

          .ie-map{border:1px solid var(--line);border-radius:10px;overflow:hidden}
          .ie-map-h{display:grid;grid-template-columns:1fr auto 1.4fr;gap:14px;padding:10px 14px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600;background:var(--paper);border-bottom:1px solid var(--line)}
          .ie-map-row{display:grid;grid-template-columns:1fr auto 1.4fr;gap:14px;align-items:center;padding:11px 14px;border-bottom:1px solid var(--line);font-size:13px}
          .ie-map-row:last-child{border-bottom:none}
          .ie-map-l{font-weight:600;color:var(--ink)}
          .ie-map-arr{color:var(--muted);font-size:14px}
          .ie-map-r{display:flex;justify-content:space-between;align-items:center;gap:8px}
          .ie-map-r select{flex:1;padding:6px 10px;border:1px solid var(--line);border-radius:7px;background:#fff;font-size:12px}
          .ie-map-ok{color:var(--olive);font-weight:600}

          .ie-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
          .ie-sum-stat{padding:14px;background:var(--paper);border:1px solid var(--line);border-radius:10px;text-align:center}
          .ie-sum-n{display:block;font-family:'Fraunces',serif;font-size:24px;color:var(--ink);font-weight:500}
          .ie-sum-l{font-size:11px;color:var(--muted);margin-top:2px}
          .ie-table{border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:12px}
          .ie-table-h{display:grid;grid-template-columns:90px 1.6fr 1fr 1fr 100px;gap:10px;padding:10px 14px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600;background:var(--paper);border-bottom:1px solid var(--line)}
          .ie-table-row{display:grid;grid-template-columns:90px 1.6fr 1fr 1fr 100px;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line);align-items:center}
          .ie-table-row:last-of-type{border-bottom:none}
          .ie-mono{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--ink-2)}
          .ie-name{font-weight:600;color:var(--ink)}
          .ie-cat{font-size:11px;color:var(--ink-2)}
          .ie-table-more{padding:10px 14px;text-align:center;font-size:11.5px;color:var(--muted);background:var(--paper);border-top:1px solid var(--line);font-style:italic}

          .ie-foot{display:flex;justify-content:flex-end;gap:8px;padding:16px 26px;border-top:1px solid var(--line);background:var(--paper)}
          .btn{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:550;transition:all .15s;border:1px solid transparent}
          .btn:disabled{opacity:.55;cursor:not-allowed}
          .btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}
          .btn-ghost:hover{border-color:#cdc4b3}
          .btn-primary{background:var(--accent);color:#fff}
          .btn-primary:hover{background:var(--accent-2)}
        `}</style>
      </div>
    </div>
  );
}
