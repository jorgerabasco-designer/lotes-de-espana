import React, { useMemo, useState } from 'react';
import { I } from './icons.jsx';

// Modal de edición de un bodegón existente. Permite:
//   - Renombrar el bodegón
//   - Sumar / restar unidades de cada producto
//   - Quitar productos
//   - Añadir productos del catálogo (buscador)
//
// Para no destruir el bodegón original (clave: muchas veces el cliente quiere
// v1, v2, v3…) al confirmar se CREA UNA NUEVA VERSIÓN. El original se queda
// intacto en el historial. El usuario puede borrarlo manualmente si quiere.
//
// Props:
//   bodegon    el bodegón que se edita (el original): { id, title, description, items, skus, ... }
//   products   lista de productos del catálogo
//   onClose    () => void
//   onConfirm  ({ items: [{sku,qty}], title, description }) => void
export default function BodegonEditOverlay({ bodegon, products, onClose, onConfirm }) {
  if (!bodegon) return null;

  // Estado inicial: traemos los items del bodegón (formato nuevo [{sku,qty}] o
  // antiguo ['sku']). El api.js los normaliza, así que en `bodegon.items` ya
  // vienen como [{sku,qty}].
  const initialItems = (bodegon.items && bodegon.items.length
    ? bodegon.items
    : (bodegon.skus || []).map(s => ({ sku: s, qty: 1 }))
  ).filter(it => it && it.sku);

  const [items, setItems] = useState(initialItems);
  const [title, setTitle] = useState(bodegon.title || '');
  const [description, setDescription] = useState(bodegon.description || '');
  const [query, setQuery] = useState('');

  // Productos disponibles para añadir (los que NO están ya en items y tienen
  // foto, porque sin foto no se puede generar).
  const selectedSkus = new Set(items.map(i => i.sku));
  const availableProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products || [])
      .filter(p => !selectedSkus.has(p.sku))
      .filter(p => !!p.img)
      .filter(p => {
        if (!q) return true;
        const hay = (p.name + ' ' + (p.brand || '') + ' ' + p.sku).toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, query, items]);

  const totalUnits = items.reduce((s, x) => s + (x.qty || 1), 0);

  const inc = (sku) => setItems(is =>
    is.map(it => it.sku === sku ? { ...it, qty: (it.qty || 1) + 1 } : it)
  );
  const dec = (sku) => setItems(is =>
    is.map(it => it.sku === sku ? { ...it, qty: Math.max(0, (it.qty || 1) - 1) } : it)
       .filter(it => it.qty > 0)
  );
  const remove = (sku) => setItems(is => is.filter(it => it.sku !== sku));
  const add = (sku) => setItems(is => is.find(it => it.sku === sku)
    ? is
    : [...is, { sku, qty: 1 }]
  );

  const handleConfirm = () => {
    const finalItems = items.filter(it => it.qty > 0);
    if (finalItems.length < 2) {
      alert('Necesitas al menos 2 productos para crear un bodegón.');
      return;
    }
    onConfirm && onConfirm({
      items: finalItems,
      title: title || bodegon.title,
      description: description || '',
    });
  };

  return (
    <div className="be-back" onClick={onClose}>
      <div className="be-modal" onClick={e => e.stopPropagation()}>
        <button className="be-close" onClick={onClose} aria-label="Cerrar">
          {I.close({ size: 18 })}
        </button>

        <header className="be-head">
          <div className="be-eye">Editar bodegón → crear nueva versión</div>
          <h2 className="be-title">Modifica los productos</h2>
          <p className="be-sub">
            El bodegón original "{bodegon.title}" se quedará en el historial. Al confirmar,
            se generará una <b>nueva versión</b> con los cambios.
          </p>
        </header>

        <div className="be-body">
          <div className="be-row">
            <div className="be-field">
              <label className="be-label">Nombre de la nueva versión</label>
              <input
                className="be-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={`${bodegon.title || 'Bodegón'} v2`}
              />
            </div>
          </div>

          <div className="be-row">
            <div className="be-field">
              <label className="be-label">Descripción (opcional)</label>
              <textarea
                className="be-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Notas o cambios respecto a la versión anterior…"
                rows={2}
              />
            </div>
          </div>

          <div className="be-section-h">
            Productos del bodegón
            <span className="be-section-c">
              {items.length} · {totalUnits} unidad{totalUnits === 1 ? '' : 'es'}
            </span>
          </div>
          {items.length === 0 && (
            <div className="be-empty">No queda ningún producto. Añade alguno desde abajo.</div>
          )}
          <div className="be-list">
            {items.map(it => {
              const p = (products || []).find(x => x.sku === it.sku);
              return (
                <div key={it.sku} className={`be-item ${!p ? 'orphan' : ''}`}>
                  <div className="be-item-img">
                    {p?.img
                      ? <img src={p.img} alt=""/>
                      : <div className="be-item-noimg">{I.upload({ size: 14 })}</div>}
                  </div>
                  <div className="be-item-info">
                    <div className="be-item-n">{p?.name || it.sku}</div>
                    <div className="be-item-m">
                      <span className="be-sku">{it.sku}</span>
                      {p?.brand && <span>· {p.brand}</span>}
                      {!p && <span className="be-orphan">Producto eliminado del catálogo</span>}
                    </div>
                  </div>
                  <div className="be-stepper">
                    <button className="be-step" onClick={() => dec(it.sku)} aria-label="-1">−</button>
                    <span className="be-step-q">{it.qty}</span>
                    <button className="be-step" onClick={() => inc(it.sku)} aria-label="+1">+</button>
                  </div>
                  <button className="be-item-x" onClick={() => remove(it.sku)} title="Quitar">
                    {I.close({ size: 14 })}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="be-section-h">Añadir productos del catálogo</div>
          <div className="be-search">
            {I.search({ size: 16 })}
            <input
              placeholder="Buscar por nombre, marca o referencia…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="be-add-list">
            {availableProducts.length === 0 && (
              <div className="be-empty small">
                {query
                  ? 'Ningún producto del catálogo coincide con la búsqueda.'
                  : 'Todos los productos del catálogo ya están añadidos.'}
              </div>
            )}
            {availableProducts.map(p => (
              <button key={p.sku} className="be-add" onClick={() => add(p.sku)}>
                <div className="be-add-img">
                  <img src={p.img} alt=""/>
                </div>
                <div className="be-add-info">
                  <div className="be-add-n">{p.name}</div>
                  <div className="be-add-m">
                    <span className="be-sku">{p.sku}</span>
                    {p.brand && <span>· {p.brand}</span>}
                  </div>
                </div>
                <div className="be-add-plus">{I.plus({ size: 14 })}</div>
              </button>
            ))}
          </div>
        </div>

        <footer className="be-foot">
          <button className="be-btn be-btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="be-btn be-btn-primary"
            onClick={handleConfirm}
            disabled={items.length < 2}
          >
            {I.sparkle({ size: 14 })} Crear nueva versión
          </button>
        </footer>

        <style>{`
          .be-back{position:fixed;inset:0;background:rgba(20,16,12,.62);backdrop-filter:blur(10px);z-index:600;display:grid;place-items:center;padding:24px;animation:fadeIn .2s ease}
          .be-modal{position:relative;background:#FAFAF7;border-radius:18px;width:min(760px,96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 40px 90px -20px rgba(0,0,0,.4);animation:popIn .3s cubic-bezier(.2,.8,.2,1)}
          .be-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.9);border:1px solid var(--line);color:var(--ink);transition:all .15s;z-index:10}
          .be-close:hover{background:#fff;transform:scale(1.05);border-color:var(--ink)}

          .be-head{padding:26px 28px 16px;border-bottom:1px solid var(--line);background:#fff;flex-shrink:0}
          .be-eye{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:8px}
          .be-title{font-family:'Fraunces',serif;font-size:24px;font-weight:500;color:var(--ink);letter-spacing:-.012em;margin:0}
          .be-sub{color:var(--muted);font-size:12.5px;margin:6px 0 0;line-height:1.5}
          .be-sub b{color:var(--ink-2);font-weight:600}

          .be-body{padding:20px 28px 12px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:6px;min-height:0}
          .be-row{display:flex;flex-direction:column;gap:6px;margin-bottom:6px}
          .be-field{display:flex;flex-direction:column;gap:6px}
          .be-label{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600}
          .be-input{font-family:inherit;font-size:14px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 13px;outline:none;transition:all .15s}
          .be-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
          .be-textarea{font-family:inherit;font-size:13px;color:var(--ink);line-height:1.55;background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 13px;resize:vertical;min-height:54px;outline:none;transition:all .15s}
          .be-textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}

          .be-section-h{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:18px 0 8px;display:flex;align-items:center;gap:8px}
          .be-section-c{font-weight:500;letter-spacing:.04em;text-transform:none;font-size:11px;color:var(--muted);background:var(--bg);padding:2px 8px;border-radius:99px}

          .be-empty{padding:14px;text-align:center;background:#fff;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:12.5px}
          .be-empty.small{padding:10px;font-size:12px}

          .be-list{display:flex;flex-direction:column;gap:4px}
          .be-item{display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fff;border:1px solid var(--line);border-radius:10px;transition:all .15s}
          .be-item.orphan{background:rgba(167,77,74,.04);border-color:rgba(167,77,74,.2)}
          .be-item-img{width:38px;height:38px;border-radius:6px;background:#fff;border:1px solid var(--line);overflow:hidden;flex-shrink:0;padding:3px;display:grid;place-items:center}
          .be-item-img img{width:100%;height:100%;object-fit:contain}
          .be-item-noimg{color:var(--muted);opacity:.5}
          .be-item-info{flex:1;min-width:0}
          .be-item-n{font-size:13px;font-weight:600;color:var(--ink);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .be-item-m{font-size:11px;color:var(--muted);margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
          .be-sku{letter-spacing:.4px;font-weight:600;font-variant-numeric:tabular-nums}
          .be-orphan{color:var(--accent);font-weight:600}

          .be-stepper{display:flex;align-items:center;gap:2px;background:#fff;border:1px solid var(--line);border-radius:99px;padding:2px 4px;flex-shrink:0}
          .be-step{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:15px;font-weight:600;line-height:1;color:var(--ink-2);transition:all .12s}
          .be-step:hover{background:var(--accent);color:#fff}
          .be-step-q{min-width:24px;text-align:center;font-size:12px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}

          .be-item-x{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:var(--muted);background:transparent;border:1px solid transparent;flex-shrink:0;transition:all .15s}
          .be-item-x:hover{background:var(--accent-soft);color:var(--accent);border-color:var(--accent-soft)}

          .be-search{display:flex;align-items:center;gap:10px;padding:0 14px;height:42px;background:#fff;border:1px solid var(--line);border-radius:11px;color:var(--muted);margin-bottom:8px}
          .be-search input{flex:1;border:none;background:none;outline:none;font-size:13.5px;color:var(--ink);font-family:inherit}
          .be-search:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}

          .be-add-list{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;max-height:240px;overflow-y:auto;padding-bottom:8px}
          .be-add{display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fff;border:1px solid var(--line);border-radius:10px;text-align:left;cursor:pointer;transition:all .12s;font-family:inherit}
          .be-add:hover{border-color:var(--accent);background:var(--accent-soft)}
          .be-add-img{width:32px;height:32px;border-radius:6px;background:#fff;border:1px solid var(--line);overflow:hidden;flex-shrink:0;padding:2px}
          .be-add-img img{width:100%;height:100%;object-fit:contain}
          .be-add-info{flex:1;min-width:0}
          .be-add-n{font-size:12px;font-weight:600;color:var(--ink);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .be-add-m{font-size:10.5px;color:var(--muted);margin-top:1px}
          .be-add-plus{width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;flex-shrink:0;opacity:0;transition:opacity .12s}
          .be-add:hover .be-add-plus{opacity:1}

          .be-foot{display:flex;gap:8px;padding:14px 28px;border-top:1px solid var(--line);background:#fff;flex-shrink:0}
          .be-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;transition:all .15s;cursor:pointer;border:1px solid transparent}
          .be-btn:disabled{opacity:.5;cursor:not-allowed}
          .be-btn-ghost{background:#fff;color:var(--ink-2);border:1px solid var(--line)}
          .be-btn-ghost:hover:not(:disabled){border-color:var(--ink-2);color:var(--ink)}
          .be-btn-primary{background:var(--accent);color:#fff;flex:1;box-shadow:0 1px 2px rgba(167,77,74,.3),0 4px 12px -4px rgba(167,77,74,.45)}
          .be-btn-primary:hover:not(:disabled){background:var(--accent-2);transform:translateY(-1px)}

          @media (max-width: 700px){
            .be-modal{max-height:96vh}
            .be-head{padding:22px 20px 14px}
            .be-body{padding:18px 18px 10px}
            .be-foot{padding:12px 20px;flex-direction:column-reverse}
            .be-foot .be-btn{width:100%}
            .be-add-list{grid-template-columns:1fr}
          }
        `}</style>
      </div>
    </div>
  );
}
