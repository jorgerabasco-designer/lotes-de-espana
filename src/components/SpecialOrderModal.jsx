import React, { useState } from 'react';
import { I } from './icons.jsx';
import { parseExcelOrder, parsePdfOrder, resolveOrder } from '../lib/parsers.js';

// Modal "Pedidos especiales": el usuario sube un PDF o Excel del cliente, se
// detectan los productos, se le muestra la lista con los matcheados y los
// que no están en el catálogo, y al confirmar se pasan al BodegonOverlay
// como pre-selección para arrancar la generación.
//
// Props:
//   open       boolean
//   onClose    () => void
//   products   array de productos del catálogo (para hacer el matching)
//   onConfirm  ({ items: [{sku, qty}], title, description }) => void
export default function SpecialOrderModal({ open, onClose, products, onConfirm }) {
  // Etapa actual: 'upload' | 'parsing' | 'confirm' | 'error'
  const [stage, setStage] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState(''); // 'pdf' | 'excel'
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState(null);   // resultado del parser
  const [resolved, setResolved] = useState(null); // { matched, unmatched }
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState({});  // { sku: qty } sobreescritura local
  const [removed, setRemoved] = useState(new Set());
  const [dragOver, setDragOver] = useState(false);

  if (!open) return null;

  const reset = () => {
    setStage('upload');
    setFileName('');
    setFileType('');
    setError('');
    setParsed(null);
    setResolved(null);
    setTitle('');
    setDescription('');
    setEditing({});
    setRemoved(new Set());
  };

  const handleClose = () => {
    reset();
    onClose && onClose();
  };

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    const ext = file.name.toLowerCase().split('.').pop();
    const isPdf = ext === 'pdf' || file.type === 'application/pdf';
    const isExcel = ['xlsx', 'xls', 'xlsm'].includes(ext) || /spreadsheet|excel/i.test(file.type);
    if (!isPdf && !isExcel) {
      setError('Formato no soportado. Sube un PDF (.pdf) o un Excel (.xlsx).');
      setStage('error');
      return;
    }
    setFileType(isPdf ? 'pdf' : 'excel');
    setStage('parsing');
    setError('');
    try {
      const parser = isPdf ? parsePdfOrder : parseExcelOrder;
      const p = await parser(file);
      if (!p.items || p.items.length === 0) {
        throw new Error('No se ha detectado ningún producto en el fichero.');
      }
      setParsed(p);
      setTitle(p.title || file.name.replace(/\.[^.]+$/, ''));
      const r = resolveOrder(p, products);
      setResolved(r);
      setStage('confirm');
    } catch (e) {
      console.error('[SpecialOrderModal] Error parseando', e);
      setError(e.message || 'No se ha podido leer el fichero.');
      setStage('error');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };

  // Items finales a generar, aplicando ediciones y eliminaciones locales.
  const finalItems = (resolved?.matched || [])
    .filter(m => !removed.has(m.sku))
    .map(m => ({
      sku: m.sku,
      qty: editing[m.sku] != null ? editing[m.sku] : m.qty,
    }))
    .filter(m => m.qty > 0);

  const totalUnits = finalItems.reduce((s, x) => s + x.qty, 0);
  const numUnmatched = (resolved?.unmatched || []).length;

  const setQty = (sku, n) => {
    const v = Math.max(0, Math.round(Number(n) || 0));
    setEditing(e => ({ ...e, [sku]: v }));
    if (v === 0) setRemoved(r => new Set([...r, sku]));
    else if (removed.has(sku)) {
      setRemoved(r => { const c = new Set(r); c.delete(sku); return c; });
    }
  };
  const incQty = (sku, m) => {
    setRemoved(r => { const c = new Set(r); c.delete(sku); return c; });
    setEditing(e => ({
      ...e,
      [sku]: Math.max(0, (e[sku] != null ? e[sku] : m.qty) + 1),
    }));
  };
  const decQty = (sku, m) => {
    setEditing(e => {
      const cur = e[sku] != null ? e[sku] : m.qty;
      const next = Math.max(0, cur - 1);
      if (next === 0) setRemoved(r => new Set([...r, sku]));
      return { ...e, [sku]: next };
    });
  };
  const removeItem = (sku) => setRemoved(r => new Set([...r, sku]));
  const restoreItem = (sku) => setRemoved(r => { const c = new Set(r); c.delete(sku); return c; });

  const handleConfirm = () => {
    if (!finalItems.length) return;
    onConfirm && onConfirm({
      items: finalItems,
      title: title || 'Pedido especial',
      description: description || '',
    });
    // El padre debería cerrar la modal; por si acaso, la limpiamos.
    reset();
  };

  return (
    <div className="so-back" onClick={handleClose}>
      <div className="so-modal" onClick={e => e.stopPropagation()}>
        <button className="so-close" onClick={handleClose} aria-label="Cerrar">
          {I.close({ size: 18 })}
        </button>

        <header className="so-head">
          <div className="so-eye">Pedidos especiales</div>
          <h2 className="so-title">
            {stage === 'upload' && 'Sube un PDF o Excel'}
            {stage === 'parsing' && 'Leyendo el fichero…'}
            {stage === 'confirm' && 'Confirma los productos detectados'}
            {stage === 'error' && 'No se ha podido procesar'}
          </h2>
          <p className="so-sub">
            {stage === 'upload' && 'Arrastra aquí el presupuesto del cliente y detectamos los productos automáticamente.'}
            {stage === 'parsing' && fileName}
            {stage === 'confirm' && fileName}
            {stage === 'error' && fileName}
          </p>
        </header>

        {stage === 'upload' && (
          <div
            className={`so-drop ${dragOver ? 'over' : ''}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
          >
            <div className="so-drop-icon">{I.upload({ size: 28 })}</div>
            <div className="so-drop-t">Arrastra aquí el PDF o el Excel</div>
            <div className="so-drop-s">o pulsa para seleccionar un fichero</div>
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.xlsm,application/pdf"
              onChange={e => handleFile(e.target.files?.[0])}
              className="so-drop-input"
            />
            <div className="so-formats">
              <span><b>PDF</b>: detectamos referencias y nombre del cliente.</span>
              <span><b>Excel</b>: detectamos por nombre del producto.</span>
            </div>
          </div>
        )}

        {stage === 'parsing' && (
          <div className="so-busy">
            <div className="so-busy-orb"/>
            <div className="so-busy-t">Procesando {fileType === 'pdf' ? 'el PDF' : 'el Excel'}…</div>
            <div className="so-busy-s">Esto suele tardar 1–3 segundos.</div>
          </div>
        )}

        {stage === 'error' && (
          <div className="so-err">
            <div className="so-err-t">{error}</div>
            <button className="so-btn so-btn-ghost" onClick={reset}>
              {I.refresh({ size: 14 })} Empezar de nuevo
            </button>
          </div>
        )}

        {stage === 'confirm' && resolved && (
          <div className="so-body">
            <div className="so-field">
              <label className="so-label">Nombre del bodegón</label>
              <input
                className="so-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ej. ITACA — ALTADIA-1 ( PALETA IBÉRICA )"
              />
            </div>

            <div className="so-stats">
              <span className="so-stat">
                <b>{finalItems.length}</b> {finalItems.length === 1 ? 'producto' : 'productos'} para generar
              </span>
              {totalUnits > finalItems.length && (
                <span className="so-stat">· <b>{totalUnits}</b> unidades en total</span>
              )}
              {numUnmatched > 0 && (
                <span className="so-stat warn">· <b>{numUnmatched}</b> sin coincidencia</span>
              )}
            </div>

            {/* Encontrados */}
            <div className="so-section-h">
              Productos detectados
              <span className="so-section-c">{finalItems.length} de {resolved.matched.length}</span>
            </div>
            <div className="so-list">
              {resolved.matched.map(m => {
                const isRemoved = removed.has(m.sku);
                const qty = editing[m.sku] != null ? editing[m.sku] : m.qty;
                const product = products.find(p => p.sku === m.sku);
                return (
                  <div key={m.sku} className={`so-item ${isRemoved ? 'gone' : ''}`}>
                    <div className="so-item-img">
                      {product?.img ? <img src={product.img} alt=""/> : <div className="so-item-noimg">{I.upload({ size: 14 })}</div>}
                    </div>
                    <div className="so-item-info">
                      <div className="so-item-n">{m.name}</div>
                      <div className="so-item-m">
                        <span className="so-sku">{m.sku}</span>
                        {m.source === 'name' && (
                          <span className="so-tag" title="Detectado por nombre, no por referencia">
                            por nombre · {Math.round(m.score * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                    {isRemoved ? (
                      <button className="so-item-restore" onClick={() => restoreItem(m.sku)}>
                        Recuperar
                      </button>
                    ) : (
                      <>
                        <div className="so-stepper">
                          <button className="so-step" onClick={() => decQty(m.sku, m)} aria-label="-1">−</button>
                          <input
                            className="so-step-input"
                            type="text"
                            inputMode="numeric"
                            value={qty}
                            onChange={e => setQty(m.sku, e.target.value)}
                          />
                          <button className="so-step" onClick={() => incQty(m.sku, m)} aria-label="+1">+</button>
                        </div>
                        <button
                          className="so-item-x"
                          onClick={() => removeItem(m.sku)}
                          title="Quitar del bodegón"
                        >{I.close({ size: 14 })}</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* No encontrados */}
            {numUnmatched > 0 && (
              <>
                <div className="so-section-h warn">
                  No encontrados en el catálogo
                  <span className="so-section-c">{numUnmatched}</span>
                </div>
                <div className="so-warn-box">
                  <div className="so-warn-icon">{I.warning ? I.warning({ size: 16 }) : '!'}</div>
                  <div>
                    <div className="so-warn-t">
                      Algunos productos del pedido no están en el catálogo
                      {fileType === 'pdf' && ' (suelen ser referencias de IVA, cajas, regalos…).'}
                      {fileType === 'excel' && ' (no se ha encontrado un nombre parecido).'}
                    </div>
                    <div className="so-warn-s">
                      Puedes continuar y generar el bodegón solo con los disponibles, o cancelar y revisar el fichero.
                    </div>
                  </div>
                </div>
                <div className="so-list small">
                  {resolved.unmatched.map((u, i) => (
                    <div key={i} className="so-item unmatched">
                      <div className="so-item-info">
                        <div className="so-item-n">
                          {u.original.ref && <span className="so-sku-inline">{u.original.ref}</span>}
                          {u.original.name || (u.original.ref ? '' : '(sin nombre)')}
                        </div>
                        <div className="so-item-m">{u.reason}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {stage === 'confirm' && (
          <footer className="so-foot">
            <button className="so-btn so-btn-ghost" onClick={reset}>
              {I.refresh({ size: 14 })} Subir otro fichero
            </button>
            <button
              className="so-btn so-btn-primary"
              onClick={handleConfirm}
              disabled={finalItems.length === 0}
            >
              {I.sparkle({ size: 14 })} Generar bodegón con {finalItems.length} {finalItems.length === 1 ? 'producto' : 'productos'}
            </button>
          </footer>
        )}

        <style>{`
          .so-back{position:fixed;inset:0;background:rgba(20,16,12,.62);backdrop-filter:blur(10px);z-index:600;display:grid;place-items:center;padding:24px;animation:fadeIn .2s ease}
          .so-modal{position:relative;background:#FAFAF7;border-radius:18px;width:min(720px,96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 40px 90px -20px rgba(0,0,0,.4);animation:popIn .3s cubic-bezier(.2,.8,.2,1)}
          .so-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.9);border:1px solid var(--line);color:var(--ink);transition:all .15s;z-index:10}
          .so-close:hover{background:#fff;transform:scale(1.05);border-color:var(--ink)}

          .so-head{padding:26px 28px 16px;border-bottom:1px solid var(--line);background:#fff;flex-shrink:0}
          .so-eye{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:8px}
          .so-title{font-family:'Fraunces',serif;font-size:24px;font-weight:500;color:var(--ink);letter-spacing:-.012em;margin:0}
          .so-sub{color:var(--muted);font-size:12.5px;margin:6px 0 0;line-height:1.4}

          .so-drop{margin:28px;padding:48px 28px;border:1.5px dashed var(--line);border-radius:14px;background:#fff;display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;transition:all .15s;cursor:pointer}
          .so-drop:hover{border-color:var(--accent);background:rgba(167,77,74,.02)}
          .so-drop.over{border-color:var(--accent);border-style:solid;background:var(--accent-soft)}
          .so-drop-icon{width:54px;height:54px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;margin-bottom:8px}
          .so-drop-t{font-size:15px;font-weight:600;color:var(--ink)}
          .so-drop-s{font-size:12.5px;color:var(--muted)}
          .so-drop-input{position:absolute;inset:0;opacity:0;cursor:pointer}
          .so-formats{display:flex;gap:18px;margin-top:14px;font-size:11.5px;color:var(--muted);text-align:center;flex-wrap:wrap;justify-content:center}
          .so-formats b{color:var(--ink-2)}

          .so-busy{padding:64px 28px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px}
          .so-busy-orb{width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,var(--accent-soft));animation:boOrb 1.4s ease-in-out infinite}
          .so-busy-t{font-family:'Fraunces',serif;font-size:17px;color:var(--ink);margin-top:8px}
          .so-busy-s{font-size:12.5px;color:var(--muted)}

          .so-err{padding:36px 28px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px}
          .so-err-t{font-size:14px;color:var(--accent);font-weight:500;max-width:420px;line-height:1.5}

          .so-body{padding:20px 28px 12px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:6px;min-height:0}
          .so-field{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
          .so-label{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600}
          .so-input{font-family:inherit;font-size:14px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 13px;outline:none;transition:all .15s}
          .so-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}

          .so-stats{font-size:12px;color:var(--ink-2);display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 4px}
          .so-stat b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
          .so-stat.warn b{color:var(--accent)}

          .so-section-h{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:14px 0 8px;display:flex;align-items:center;gap:8px}
          .so-section-h.warn{color:var(--accent)}
          .so-section-c{font-weight:500;letter-spacing:.04em;text-transform:none;font-size:11px;color:var(--muted);background:var(--bg);padding:2px 8px;border-radius:99px}

          .so-list{display:flex;flex-direction:column;gap:4px}
          .so-list.small .so-item{padding:8px 10px;background:rgba(167,77,74,.04)}
          .so-item{display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fff;border:1px solid var(--line);border-radius:10px;transition:all .15s}
          .so-item.gone{opacity:.55}
          .so-item.unmatched{background:rgba(167,77,74,.05);border-color:rgba(167,77,74,.15)}
          .so-item-img{width:36px;height:36px;border-radius:6px;background:#fff;border:1px solid var(--line);overflow:hidden;flex-shrink:0;padding:3px;display:grid;place-items:center}
          .so-item-img img{width:100%;height:100%;object-fit:contain}
          .so-item-noimg{color:var(--muted);opacity:.5}
          .so-item-info{flex:1;min-width:0}
          .so-item-n{font-size:13px;font-weight:600;color:var(--ink);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .so-item-m{font-size:11px;color:var(--muted);margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
          .so-sku{letter-spacing:.4px;font-weight:600;font-variant-numeric:tabular-nums}
          .so-sku-inline{display:inline-block;background:var(--bg);padding:1px 6px;border-radius:4px;font-weight:700;font-size:10.5px;letter-spacing:.3px;margin-right:6px;color:var(--ink-2)}
          .so-tag{font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);background:var(--accent-soft);padding:1px 7px;border-radius:99px;font-weight:600}

          .so-stepper{display:flex;align-items:center;gap:1px;background:#fff;border:1px solid var(--line);border-radius:99px;padding:2px;flex-shrink:0}
          .so-step{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:15px;font-weight:600;line-height:1;color:var(--ink-2);transition:all .12s}
          .so-step:hover{background:var(--accent);color:#fff}
          .so-step-input{width:34px;height:24px;border:none;outline:none;text-align:center;font-size:12px;font-weight:600;color:var(--ink);background:transparent;font-variant-numeric:tabular-nums}

          .so-item-x{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:var(--muted);background:transparent;border:1px solid transparent;flex-shrink:0;transition:all .15s}
          .so-item-x:hover{background:var(--accent-soft);color:var(--accent);border-color:var(--accent-soft)}
          .so-item-restore{font-size:11px;font-weight:600;color:var(--accent);background:transparent;border:1px solid var(--accent);border-radius:99px;padding:5px 12px;transition:all .15s;flex-shrink:0}
          .so-item-restore:hover{background:var(--accent);color:#fff}

          .so-warn-box{display:flex;gap:10px;padding:12px 14px;background:rgba(167,77,74,.06);border:1px solid rgba(167,77,74,.2);border-radius:10px;align-items:flex-start;margin-top:6px}
          .so-warn-icon{width:24px;height:24px;flex-shrink:0;border-radius:6px;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px;font-family:'Fraunces',serif}
          .so-warn-t{font-size:12.5px;font-weight:600;color:var(--ink);line-height:1.35}
          .so-warn-s{font-size:11.5px;color:var(--ink-2);margin-top:3px;line-height:1.45}

          .so-foot{display:flex;gap:8px;padding:14px 28px;border-top:1px solid var(--line);background:#fff;flex-shrink:0}
          .so-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;transition:all .15s;cursor:pointer;border:1px solid transparent}
          .so-btn:disabled{opacity:.5;cursor:not-allowed}
          .so-btn-ghost{background:#fff;color:var(--ink-2);border:1px solid var(--line)}
          .so-btn-ghost:hover:not(:disabled){border-color:var(--ink-2);color:var(--ink)}
          .so-btn-primary{background:var(--accent);color:#fff;flex:1;box-shadow:0 1px 2px rgba(167,77,74,.3),0 4px 12px -4px rgba(167,77,74,.45)}
          .so-btn-primary:hover:not(:disabled){background:var(--accent-2);transform:translateY(-1px)}

          @media (max-width: 700px){
            .so-modal{max-height:96vh}
            .so-head{padding:22px 20px 14px}
            .so-body{padding:18px 18px 10px}
            .so-foot{padding:12px 20px;flex-direction:column-reverse}
            .so-foot .so-btn{width:100%}
            .so-drop{margin:20px;padding:32px 20px}
            .so-item-info{min-width:0}
            .so-item-n{font-size:12.5px}
          }
        `}</style>
      </div>
    </div>
  );
}
