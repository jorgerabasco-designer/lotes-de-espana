import React, { useMemo, useState } from 'react';
import { I } from './icons.jsx';
import { useTaxonomy } from '../lib/taxonomy.jsx';

// Edición de un bodegón existente, a dos paneles:
//   · Izquierda  "En el lote"   → productos actuales (qty +/-, quitar).
//   · Derecha    "Catálogo"     → buscador + productos disponibles para añadir.
// Se puede mover entre paneles con CLIC o arrastrando (drag & drop).
//
// Dos formas de guardar:
//   · "Guardar cambios"     → solo metadatos (nombre, descripción, etiquetas).
//                             Actualiza el bodegón EN SITIO, sin regenerar la
//                             imagen. Activo solo si NO cambiaste productos.
//   · "Crear nueva versión" → genera un bodegón NUEVO con los productos
//                             actuales (el original se conserva en historial).
//
// Props:
//   bodegon, products, onClose
//   onConfirm({ items, title, description, tags })  → crear nueva versión
//   onSaveMeta(id, { nombre, descripcion, tags })   → guardar metadatos
//   showInfo(cfg)                                    → modal informativo
export default function BodegonEditOverlay({ bodegon, products, onClose, onConfirm, onSaveMeta, showInfo }) {
  if (!bodegon) return null;

  const initialItems = (bodegon.items && bodegon.items.length
    ? bodegon.items
    : (bodegon.skus || []).map(s => ({ sku: s, qty: 1 }))
  ).filter(it => it && it.sku).map(it => ({ sku: it.sku, qty: Number(it.qty) || 1 }));

  const [items, setItems] = useState(initialItems);
  const [title, setTitle] = useState(bodegon.title || '');
  const [description, setDescription] = useState(bodegon.description || '');
  const [tags, setTags] = useState(Array.isArray(bodegon.tags) ? bodegon.tags : []);
  const [query, setQuery] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [savedHint, setSavedHint] = useState(false);
  // Drag & drop
  const [dragSku, setDragSku] = useState(null);
  const [dragFrom, setDragFrom] = useState(null); // 'cat' | 'lote'
  const [dropZone, setDropZone] = useState(null);  // 'lote' | 'cat' | null

  const { tags: allTags } = useTaxonomy();
  const toggleTag = (id) =>
    setTags(tags.includes(id) ? tags.filter(t => t !== id) : [...tags, id]);

  const selectedSkus = useMemo(() => new Set(items.map(i => i.sku)), [items]);

  const availableProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products || [])
      .filter(p => !selectedSkus.has(p.sku))
      .filter(p => !!p.img) // sin foto no se puede componer
      .filter(p => {
        if (!q) return true;
        return (p.name + ' ' + (p.brand || '') + ' ' + p.sku).toLowerCase().includes(q);
      })
      .slice(0, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, query, items]);

  const totalUnits = items.reduce((s, x) => s + (x.qty || 1), 0);

  // ---- mutaciones ----
  const inc = (sku) => setItems(is => is.map(it => it.sku === sku ? { ...it, qty: (it.qty || 1) + 1 } : it));
  const dec = (sku) => setItems(is =>
    is.map(it => it.sku === sku ? { ...it, qty: Math.max(0, (it.qty || 1) - 1) } : it).filter(it => it.qty > 0)
  );
  const removeItem = (sku) => setItems(is => is.filter(it => it.sku !== sku));
  const addItem = (sku) => setItems(is => is.find(it => it.sku === sku) ? is : [...is, { sku, qty: 1 }]);

  // ---- detección de cambios ----
  const productsChanged = useMemo(() => {
    if (items.length !== initialItems.length) return true;
    const a = new Map(items.map(i => [i.sku, i.qty]));
    for (const it of initialItems) {
      if (a.get(it.sku) !== it.qty) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const tagsEqual = (a, b) => a.length === b.length && a.every(t => b.includes(t));
  const metaChanged =
    title !== (bodegon.title || '') ||
    description !== (bodegon.description || '') ||
    !tagsEqual(tags, Array.isArray(bodegon.tags) ? bodegon.tags : []);

  // ---- drag & drop ----
  const startDrag = (e, sku, from) => {
    setDragSku(sku);
    setDragFrom(from);
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', sku);
    } catch {}
  };
  const endDrag = () => { setDragSku(null); setDragFrom(null); setDropZone(null); };
  const overZone = (e, zone) => {
    // Solo resaltar si el origen es del otro panel
    if ((zone === 'lote' && dragFrom === 'cat') || (zone === 'cat' && dragFrom === 'lote')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropZone !== zone) setDropZone(zone);
    }
  };
  const dropOn = (e, zone) => {
    e.preventDefault();
    const sku = dragSku || e.dataTransfer.getData('text/plain');
    if (!sku) return endDrag();
    if (zone === 'lote' && dragFrom === 'cat') addItem(sku);
    if (zone === 'cat' && dragFrom === 'lote') removeItem(sku);
    endDrag();
  };

  // ---- guardado ----
  const handleSaveMeta = async () => {
    if (!metaChanged || productsChanged) return;
    setSavingMeta(true);
    try {
      await onSaveMeta?.(bodegon.id, {
        nombre: title || bodegon.title,
        descripcion: description || null,
        tags: tags || [],
      });
      setSavedHint(true);
    } catch (e) {
      setSavingMeta(false);
      const cfg = {
        icon: 'trash', tone: 'danger',
        title: 'No se pudieron guardar los cambios',
        description: e.message || 'Error desconocido.',
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      };
      if (showInfo) showInfo(cfg); else alert(cfg.description);
    }
  };

  const handleCreateVersion = () => {
    const finalItems = items.filter(it => it.qty > 0);
    if (finalItems.length < 2) {
      const cfg = {
        icon: 'sparkle', tone: 'info',
        title: 'Necesitas al menos 2 productos',
        description: 'Un bodegón se compone con un mínimo de 2 productos. Añade alguno desde el catálogo.',
        confirmLabel: 'Entendido', confirmTone: 'neutral',
      };
      if (showInfo) showInfo(cfg); else alert(cfg.description);
      return;
    }
    onConfirm?.({ items: finalItems, title: title || bodegon.title, description: description || '', tags: tags || [] });
  };

  return (
    <div className="be-back" onClick={onClose}>
      <div className="be-modal" onClick={e => e.stopPropagation()}>
        <button className="be-close" onClick={onClose} aria-label="Cerrar">{I.close({ size: 18 })}</button>

        <header className="be-head">
          <div className="be-eye">Editar bodegón</div>
          <h2 className="be-title">{bodegon.title}</h2>
          <p className="be-sub">
            Cambia nombre, descripción o etiquetas y pulsa <b>Guardar cambios</b>.
            Si tocas los productos, usa <b>Crear nueva versión</b> (el original se conserva).
          </p>
        </header>

        {/* Metadatos */}
        <div className="be-meta">
          <div className="be-meta-grid">
            <div className="be-field">
              <label className="be-label">Nombre</label>
              <input className="be-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Nombre del lote" />
            </div>
            <div className="be-field">
              <label className="be-label">Descripción</label>
              <input className="be-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Notas del lote (opcional)" />
            </div>
          </div>
          {allTags.length > 0 && (
            <div className="be-field">
              <label className="be-label">Etiquetas del lote</label>
              <div className="be-tags">
                {allTags.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`be-tag ${tags.includes(t.id) ? 'on' : ''}`}
                    onClick={() => toggleTag(t.id)}
                  >
                    {tags.includes(t.id) && I.check({ size: 11 })}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dos paneles */}
        <div className="be-cols">
          {/* EN EL LOTE */}
          <div className="be-col">
            <div className="be-col-head">
              <span>En el lote</span>
              <span className="be-col-count">{items.length} · {totalUnits} ud{totalUnits === 1 ? '' : 's'}</span>
            </div>
            <div
              className={`be-col-list ${dropZone === 'lote' ? 'drop-on' : ''}`}
              onDragOver={(e) => overZone(e, 'lote')}
              onDragLeave={() => dropZone === 'lote' && setDropZone(null)}
              onDrop={(e) => dropOn(e, 'lote')}
            >
              {items.length === 0 && (
                <div className="be-empty">Arrastra o pulsa productos del catálogo para añadirlos.</div>
              )}
              {items.map(it => {
                const p = (products || []).find(x => x.sku === it.sku);
                return (
                  <div
                    key={it.sku}
                    className={`be-item ${!p ? 'orphan' : ''} ${dragSku === it.sku ? 'dragging' : ''}`}
                    draggable={!!p}
                    onDragStart={(e) => startDrag(e, it.sku, 'lote')}
                    onDragEnd={endDrag}
                  >
                    <div className="be-grip" aria-hidden>{I.grip ? I.grip({ size: 14 }) : '⋮⋮'}</div>
                    <div className="be-item-img">
                      {p?.img ? <img src={p.img} alt=""/> : <div className="be-item-noimg">{I.upload({ size: 14 })}</div>}
                    </div>
                    <div className="be-item-info">
                      <div className="be-item-n">{p?.name || it.sku}</div>
                      <div className="be-item-m">
                        <span className="be-sku">{it.sku}</span>
                        {p?.brand && <span>· {p.brand}</span>}
                        {!p && <span className="be-orphan">No está en el catálogo</span>}
                      </div>
                    </div>
                    <div className="be-stepper">
                      <button className="be-step" onClick={() => dec(it.sku)} aria-label="-1">−</button>
                      <span className="be-step-q">{it.qty}</span>
                      <button className="be-step" onClick={() => inc(it.sku)} aria-label="+1">+</button>
                    </div>
                    <button className="be-item-x" onClick={() => removeItem(it.sku)} title="Quitar del lote">
                      {I.close({ size: 14 })}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CATÁLOGO */}
          <div className="be-col be-col-cat">
            <div className="be-col-head">
              <span>Catálogo</span>
              <span className="be-col-count">{availableProducts.length}</span>
            </div>
            <div className="be-col-search">
              {I.search({ size: 15 })}
              <input
                placeholder="Buscar por nombre, marca o referencia…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && <button className="be-search-x" onClick={() => setQuery('')} aria-label="Limpiar">{I.close({ size: 13 })}</button>}
            </div>
            <div
              className={`be-col-list ${dropZone === 'cat' ? 'drop-on' : ''}`}
              onDragOver={(e) => overZone(e, 'cat')}
              onDragLeave={() => dropZone === 'cat' && setDropZone(null)}
              onDrop={(e) => dropOn(e, 'cat')}
            >
              {dropZone === 'cat' && dragFrom === 'lote' && (
                <div className="be-drop-hint">{I.trash({ size: 18 })} Suelta aquí para quitar del lote</div>
              )}
              {availableProducts.length === 0 && dropZone !== 'cat' && (
                <div className="be-empty small">
                  {query ? 'Ningún producto coincide con la búsqueda.' : 'Todos los productos con foto ya están en el lote.'}
                </div>
              )}
              {availableProducts.map(p => (
                <div
                  key={p.sku}
                  className={`be-cat-item ${dragSku === p.sku ? 'dragging' : ''}`}
                  draggable
                  onDragStart={(e) => startDrag(e, p.sku, 'cat')}
                  onDragEnd={endDrag}
                  onClick={() => addItem(p.sku)}
                  title="Pulsa o arrastra para añadir"
                >
                  <div className="be-grip" aria-hidden>{I.grip ? I.grip({ size: 14 }) : '⋮⋮'}</div>
                  <div className="be-item-img"><img src={p.img} alt=""/></div>
                  <div className="be-item-info">
                    <div className="be-item-n">{p.name}</div>
                    <div className="be-item-m"><span className="be-sku">{p.sku}</span>{p.brand && <span>· {p.brand}</span>}</div>
                  </div>
                  <div className="be-add-plus" aria-hidden>{I.plus({ size: 15 })}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="be-foot">
          <button className="be-btn be-btn-ghost" onClick={onClose}>Cancelar</button>
          <div className="be-foot-r">
            <button
              className="be-btn be-btn-save"
              onClick={handleSaveMeta}
              disabled={savingMeta || productsChanged || !metaChanged}
              title={productsChanged
                ? 'Has cambiado productos: usa "Crear nueva versión"'
                : (!metaChanged ? 'No hay cambios que guardar' : 'Guardar nombre, descripción y etiquetas')}
            >
              {savedHint ? <>✓ Guardado</> : <>{I.check({ size: 14 })} Guardar cambios</>}
            </button>
            <button
              className="be-btn be-btn-primary"
              onClick={handleCreateVersion}
              disabled={items.length < 2}
              title="Genera un bodegón nuevo con estos productos (conserva el original)"
            >
              {I.sparkle({ size: 14 })} Crear nueva versión
            </button>
          </div>
        </footer>

        {productsChanged && (
          <div className="be-foot-note">
            Has modificado los productos. Para verlos en la imagen, pulsa <b>Crear nueva versión</b>.
          </div>
        )}

        <style>{`
          .be-back{position:fixed;inset:0;background:rgba(20,16,12,.62);backdrop-filter:blur(10px);z-index:600;display:grid;place-items:center;padding:20px;animation:fadeIn .2s ease}
          .be-modal{position:relative;background:#FAFAF7;border-radius:18px;width:min(1060px,97vw);height:min(840px,94vh);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 40px 90px -20px rgba(0,0,0,.4);animation:popIn .3s cubic-bezier(.2,.8,.2,1)}
          .be-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.9);border:1px solid var(--line);color:var(--ink);transition:all .15s;z-index:10}
          .be-close:hover{background:#fff;transform:scale(1.05);border-color:var(--ink)}

          .be-head{padding:22px 26px 14px;border-bottom:1px solid var(--line);background:#fff;flex-shrink:0}
          .be-eye{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:6px}
          .be-title{font-family:'Fraunces',serif;font-size:22px;font-weight:500;color:var(--ink);letter-spacing:-.012em;margin:0}
          .be-sub{color:var(--muted);font-size:12px;margin:6px 0 0;line-height:1.5}
          .be-sub b{color:var(--ink-2);font-weight:600}

          .be-meta{padding:16px 26px;display:flex;flex-direction:column;gap:12px;border-bottom:1px solid var(--line);background:#fff;flex-shrink:0}
          .be-meta-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:12px}
          .be-field{display:flex;flex-direction:column;gap:5px;min-width:0}
          .be-label{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600}
          .be-input{font-family:inherit;font-size:13.5px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:9px;padding:10px 12px;outline:none;transition:all .15s}
          .be-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
          .be-tags{display:flex;flex-wrap:wrap;gap:6px}
          .be-tag{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:99px;background:#fff;border:1px solid var(--line);font-size:11.5px;color:var(--ink-2);font-weight:600;transition:all .12s;font-family:inherit;cursor:pointer}
          .be-tag:hover{border-color:var(--accent);color:var(--accent)}
          .be-tag.on{background:var(--accent);border-color:var(--accent);color:#fff}
          .be-tag.on:hover{background:var(--accent-2);color:#fff}

          .be-cols{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr}
          .be-col{display:flex;flex-direction:column;min-height:0;min-width:0}
          .be-col-cat{border-left:1px solid var(--line)}
          .be-col-head{flex-shrink:0;display:flex;align-items:baseline;justify-content:space-between;padding:14px 18px 8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700}
          .be-col-count{font-weight:600;letter-spacing:.02em;text-transform:none;font-size:11px;color:var(--muted);background:var(--bg);padding:2px 8px;border-radius:99px}
          .be-col-search{flex-shrink:0;display:flex;align-items:center;gap:8px;margin:0 18px 8px;padding:0 12px;height:38px;background:#fff;border:1px solid var(--line);border-radius:10px;color:var(--muted)}
          .be-col-search input{flex:1;min-width:0;border:none;background:none;outline:none;font-size:13px;color:var(--ink);font-family:inherit}
          .be-col-search:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
          .be-search-x{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:var(--muted);flex-shrink:0}
          .be-search-x:hover{background:var(--bg);color:var(--ink)}

          .be-col-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:2px 18px 16px;display:flex;flex-direction:column;gap:5px;transition:background .15s,outline-color .15s;outline:2px dashed transparent;outline-offset:-8px;border-radius:8px}
          .be-col-list.drop-on{background:var(--accent-soft);outline-color:var(--accent)}

          .be-empty{padding:18px 14px;text-align:center;background:#fff;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:12.5px;line-height:1.5}
          .be-empty.small{padding:14px;font-size:12px}
          .be-drop-hint{position:sticky;top:0;display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;background:var(--accent);color:#fff;border-radius:10px;font-size:12.5px;font-weight:600}

          .be-item,.be-cat-item{display:flex;align-items:center;gap:9px;padding:8px 10px;background:#fff;border:1px solid var(--line);border-radius:10px;animation:beItemIn .22s cubic-bezier(.2,.8,.2,1)}
          @keyframes beItemIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
          .be-item.dragging,.be-cat-item.dragging{opacity:.4}
          .be-item.orphan{background:rgba(167,77,74,.04);border-color:rgba(167,77,74,.2)}
          .be-cat-item{cursor:pointer;transition:border-color .12s,background .12s,transform .08s}
          .be-cat-item:hover{border-color:var(--accent);background:var(--accent-soft)}
          .be-cat-item:active{transform:scale(.99)}
          .be-grip{color:var(--line);cursor:grab;flex-shrink:0;font-size:11px;letter-spacing:-2px;line-height:1;user-select:none}
          .be-item:hover .be-grip,.be-cat-item:hover .be-grip{color:var(--muted)}
          .be-item-img{width:38px;height:38px;border-radius:6px;background:#fff;border:1px solid var(--line);overflow:hidden;flex-shrink:0;padding:3px;display:grid;place-items:center}
          .be-item-img img{width:100%;height:100%;object-fit:contain}
          .be-item-noimg{color:var(--muted);opacity:.5}
          .be-item-info{flex:1;min-width:0}
          .be-item-n{font-size:12.5px;font-weight:600;color:var(--ink);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .be-item-m{font-size:10.5px;color:var(--muted);margin-top:2px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;white-space:nowrap;overflow:hidden}
          .be-sku{letter-spacing:.3px;font-weight:600;font-variant-numeric:tabular-nums}
          .be-orphan{color:var(--accent);font-weight:600}

          .be-stepper{display:flex;align-items:center;gap:1px;background:#fff;border:1px solid var(--line);border-radius:99px;padding:2px;flex-shrink:0}
          .be-step{width:23px;height:23px;border-radius:50%;display:grid;place-items:center;font-size:14px;font-weight:600;line-height:1;color:var(--ink-2);transition:all .12s}
          .be-step:hover{background:var(--accent);color:#fff}
          .be-step-q{min-width:20px;text-align:center;font-size:12px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
          .be-item-x{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;color:var(--muted);background:transparent;border:1px solid transparent;flex-shrink:0;transition:all .15s}
          .be-item-x:hover{background:var(--accent-soft);color:var(--accent)}
          .be-add-plus{width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;flex-shrink:0;opacity:0;transition:opacity .12s}
          .be-cat-item:hover .be-add-plus{opacity:1}

          .be-foot{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:14px 26px;border-top:1px solid var(--line);background:#fff;flex-shrink:0}
          .be-foot-r{display:flex;gap:8px}
          .be-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;transition:all .15s;cursor:pointer;border:1px solid transparent;white-space:nowrap}
          .be-btn:disabled{opacity:.45;cursor:not-allowed}
          .be-btn-ghost{background:#fff;color:var(--ink-2);border:1px solid var(--line)}
          .be-btn-ghost:hover{border-color:var(--ink-2);color:var(--ink)}
          .be-btn-save{background:#fff;color:var(--accent);border:1px solid var(--accent)}
          .be-btn-save:hover:not(:disabled){background:var(--accent-soft)}
          .be-btn-primary{background:var(--accent);color:#fff;box-shadow:0 1px 2px rgba(167,77,74,.3),0 4px 12px -4px rgba(167,77,74,.45)}
          .be-btn-primary:hover:not(:disabled){background:var(--accent-2);transform:translateY(-1px)}
          .be-foot-note{flex-shrink:0;padding:0 26px 12px;font-size:11.5px;color:var(--accent);text-align:right;background:#fff}
          .be-foot-note b{font-weight:700}

          @media (max-width: 820px){
            .be-modal{height:96vh;width:97vw}
            .be-head{padding:18px 18px 12px}
            .be-meta{padding:14px 18px}
            .be-meta-grid{grid-template-columns:1fr}
            .be-cols{grid-template-columns:1fr;overflow-y:auto}
            .be-col{min-height:0}
            .be-col-cat{border-left:none;border-top:1px solid var(--line)}
            .be-col-list{max-height:34vh}
            .be-foot{padding:12px 18px;flex-wrap:wrap}
            .be-foot-r{flex:1;justify-content:flex-end}
          }
        `}</style>
      </div>
    </div>
  );
}
