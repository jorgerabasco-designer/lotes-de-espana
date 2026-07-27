import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I } from './icons.jsx';
import { autoLayout, loadMetrics, normalizeLayoutToImages, MASK } from '../lib/composer.js';

// Editor de la maqueta del bodegón.
//
// Para qué sirve: cuando Gemini coloca mal un producto o lo saca de tamaño, el
// usuario no tenía forma de decírselo — solo "Regenerar", que repetía los
// mismos fallos. Aquí monta la escena a mano (arrastrar, escalar, girar) y esa
// maqueta se le manda al modelo como plano vinculante, junto con las
// correcciones que escriba.
//
// Reglas de interacción (pensadas para que no haya forma de estropear nada):
//   · Arrastrar   → mueve el producto.
//   · Tirador ↘   → escala PROPORCIONAL (nunca se deforma un producto).
//   · Tirador ↻   → gira (el jamón va en diagonal).
//   · Flechas     → mueven el seleccionado píxel a píxel.
//
// Props:
//   open, gen ({ ref, title, items, image, layout }), products
//   onClose, onApply({ layout, instrucciones })
export default function BodegonEditorOverlay({ open, gen, products, onClose, onApply }) {
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState(null);
  const [instrucciones, setInstrucciones] = useState('');
  const [showRef, setShowRef] = useState(true);
  const [ready, setReady] = useState(false);
  const stageRef = useRef(null);
  const dragState = useRef(null);
  const metricsRef = useRef(new Map());

  const bySku = useMemo(
    () => new Map((products || []).map(p => [p.sku, p])),
    [products]
  );

  // Unidades con foto (los "extras" sin sku no se pintan: no tienen imagen).
  const entries = useMemo(() => {
    if (!gen) return [];
    return (gen.items || [])
      .filter(it => it.sku && bySku.get(it.sku)?.img)
      .map(it => ({ product: bySku.get(it.sku), qty: it.qty || 1 }));
  }, [gen, bySku]);

  // Al abrir: partir de la maqueta guardada o crear una automática, y ajustar
  // cada caja a la proporción real de su foto.
  useEffect(() => {
    if (!open || !gen) return;
    let cancelled = false;
    setReady(false);
    setSel(null);
    setInstrucciones(gen.instrucciones || '');
    (async () => {
      // Una sola pasada de carga: de cada foto salen su proporción, el aire
      // transparente que tiene alrededor y la máscara para acertar el clic.
      const metrics = await loadMetrics(entries.map(e => e.product));
      if (cancelled) return;
      metricsRef.current = metrics;
      const base = gen.layout?.items?.length
        ? normalizeLayoutToImages(gen.layout, metrics)  // maqueta guardada
        : autoLayout(entries, metrics);
      setItems(base.items);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [open, gen?.ref]);

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const onPointerMove = useCallback((e) => {
    const st = dragState.current;
    if (!st) return;
    const { rect, orig, idx, mode } = st;
    setItems(list => list.map((it, i) => {
      if (i !== idx) return it;
      if (mode === 'move') {
        const dx = (e.clientX - st.startX) / rect.width;
        const dy = (e.clientY - st.startY) / rect.height;
        return {
          ...it,
          x: clamp(orig.x + dx, -orig.w * 0.5, 1 - orig.w * 0.5),
          y: clamp(orig.y + dy, -orig.h * 0.5, 1 - orig.h * 0.5),
        };
      }
      const cx = rect.left + (orig.x + orig.w / 2) * rect.width;
      const cy = rect.top + (orig.y + orig.h / 2) * rect.height;
      if (mode === 'scale') {
        // Escala por distancia al centro: proporcional y sin importar el giro.
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        const k = clamp(dist / (st.startDist || 1), 0.15, 6);
        const w = clamp(orig.w * k, 0.02, 1.6);
        const h = orig.h * (w / orig.w);
        return { ...it, w, h, x: orig.x + orig.w / 2 - w / 2, y: orig.y + orig.h / 2 - h / 2 };
      }
      if (mode === 'rotate') {
        const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
        let deg = (orig.rot || 0) + ((ang - st.startAngle) * 180) / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        return { ...it, rot: Math.round(deg) };
      }
      return it;
    }));
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  // ¿Sobre qué producto ha caído el clic? Se recorren de arriba abajo (por
  // capa) y se comprueba el píxel: si ahí la foto es transparente, el clic
  // "atraviesa" y llega al de debajo. Sin esto, un jamón girado bloquearía
  // todo lo que hay bajo su caja, que es casi todo aire.
  const hitTest = (clientX, clientY) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    const order = items.map((it, i) => ({ it, i })).sort((a, b) => (b.it.z || 0) - (a.it.z || 0));
    for (const { it, i } of order) {
      // Se trabaja en píxeles del lienzo para que el giro no se deforme.
      let dx = (px - (it.x + it.w / 2)) * rect.width;
      let dy = (py - (it.y + it.h / 2)) * rect.height;
      if (it.rot) {
        const a = (-it.rot * Math.PI) / 180;
        [dx, dy] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
      }
      const halfW = (it.w * rect.width) / 2;
      const halfH = (it.h * rect.height) / 2;
      if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) continue;
      const mask = metricsRef.current.get(it.sku)?.mask;
      if (!mask) return i; // sin máscara (JPEG opaco): vale toda la caja
      const u = Math.min(MASK - 1, Math.max(0, Math.round(((dx + halfW) / (halfW * 2)) * (MASK - 1))));
      const v = Math.min(MASK - 1, Math.max(0, Math.round(((dy + halfH) / (halfH * 2)) * (MASK - 1))));
      if (mask[(v * MASK + u) * 4 + 3] > 12) return i;
    }
    return null;
  };

  const onStagePointerDown = (e) => {
    const idx = hitTest(e.clientX, e.clientY);
    if (idx == null) { setSel(null); return; }
    startDrag(e, idx, 'move');
  };

  const startDrag = (e, idx, mode) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const orig = items[idx];
    const cx = rect.left + (orig.x + orig.w / 2) * rect.width;
    const cy = rect.top + (orig.y + orig.h / 2) * rect.height;
    dragState.current = {
      idx, mode, rect, orig,
      startX: e.clientX,
      startY: e.clientY,
      startDist: Math.hypot(e.clientX - cx, e.clientY - cy),
      startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
    };
    setSel(idx);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  useEffect(() => () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove, onPointerUp]);

  // Flechas para ajuste fino del producto seleccionado.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (sel == null) return;
      if (e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'INPUT') return;
      const step = e.shiftKey ? 0.02 : 0.004;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const mv = moves[e.key];
      if (!mv) return;
      e.preventDefault();
      setItems(list => list.map((it, i) => i === sel ? { ...it, x: it.x + mv[0], y: it.y + mv[1] } : it));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sel]);

  if (!open || !gen) return null;

  const maxZ = items.reduce((m, it) => Math.max(m, it.z || 0), 0);
  const minZ = items.reduce((m, it) => Math.min(m, it.z || 0), 0);
  const bringFront = () => setItems(l => l.map((it, i) => i === sel ? { ...it, z: maxZ + 1 } : it));
  const sendBack  = () => setItems(l => l.map((it, i) => i === sel ? { ...it, z: minZ - 1 } : it));
  const scaleSel  = (k) => setItems(l => l.map((it, i) => {
    if (i !== sel) return it;
    const w = Math.min(1.6, Math.max(0.02, it.w * k));
    const h = it.h * (w / it.w);
    return { ...it, w, h, x: it.x + it.w / 2 - w / 2, y: it.y + it.h / 2 - h / 2 };
  }));

  const reset = () => {
    setItems(autoLayout(entries, metricsRef.current).items);
    setSel(null);
  };

  const apply = () => {
    onApply?.({
      layout: { version: 1, canvas: { w: 2048, h: 1536 }, items },
      instrucciones: instrucciones.trim(),
    });
  };

  const selItem = sel != null ? items[sel] : null;
  const selProduct = selItem ? bySku.get(selItem.sku) : null;

  return (
    <div className="bed-back">
      <div className="bed-modal" onClick={e => e.stopPropagation()}>
        <button className="bed-close" onClick={onClose} aria-label="Cerrar">{I.close({ size: 18 })}</button>

        <div className="bed-main">
          <div className="bed-head">
            <div className="bed-eye">Editar composición</div>
            <div className="bed-hint">
              Arrastra los productos para colocarlos. Selecciona uno y usa el tirador de la esquina
              para hacerlo más grande o más pequeño, y el de arriba para girarlo.
            </div>
          </div>

          <div className="bed-stage-wrap">
            <div className="bed-stage" ref={stageRef} onPointerDown={onStagePointerDown}>
              {showRef && gen.image && <img className="bed-under" src={gen.image} alt="" draggable={false}/>}
              {!ready && <div className="bed-loading">Preparando la maqueta…</div>}
              {ready && items.map((it, i) => {
                const p = bySku.get(it.sku);
                if (!p?.img) return null;
                return (
                  <div
                    key={i}
                    className={`bed-item ${sel === i ? 'sel' : ''}`}
                    style={{
                      left: `${it.x * 100}%`,
                      top: `${it.y * 100}%`,
                      width: `${it.w * 100}%`,
                      height: `${it.h * 100}%`,
                      zIndex: 1000 + (it.z || 0),
                      transform: `rotate(${it.rot || 0}deg)`,
                    }}
                    title={p.name}
                  >
                    <img src={p.img} alt="" draggable={false}/>
                    {sel === i && (
                      <>
                        <span
                          className="bed-handle bed-rot"
                          onPointerDown={(e) => startDrag(e, i, 'rotate')}
                          title="Girar (Mayús para saltos de 15°)"
                        >{I.refresh({ size: 11 })}</span>
                        <span
                          className="bed-handle bed-scale"
                          onPointerDown={(e) => startDrag(e, i, 'scale')}
                          title="Más grande / más pequeño"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bed-toolbar">
            {gen.image && (
              <button className={`bed-tool ${showRef ? 'on' : ''}`} onClick={() => setShowRef(v => !v)}>
                {I.expand({ size: 13 })} Foto de referencia
              </button>
            )}
            <div className="bed-tool-sep"/>
            <button className="bed-tool" disabled={sel == null} onClick={() => scaleSel(1.1)}>Más grande</button>
            <button className="bed-tool" disabled={sel == null} onClick={() => scaleSel(0.9)}>Más pequeño</button>
            <button className="bed-tool" disabled={sel == null} onClick={bringFront}>Traer al frente</button>
            <button className="bed-tool" disabled={sel == null} onClick={sendBack}>Enviar atrás</button>
            <div className="bed-tool-sep"/>
            <button className="bed-tool" onClick={reset}>{I.refresh({ size: 13 })} Reiniciar</button>
          </div>
        </div>

        <aside className="bed-side">
          <h2 className="bed-title">{gen.title}</h2>
          <div className="bed-sub">
            {items.length} {items.length === 1 ? 'unidad' : 'unidades'} en la maqueta
          </div>

          {selProduct && (
            <div className="bed-selbox">
              <div className="bed-selimg"><img src={selProduct.img} alt=""/></div>
              <div className="bed-selinfo">
                <div className="bed-seln">{selProduct.name}</div>
                <div className="bed-selm">
                  {selProduct.brand || selProduct.sku}
                  {selProduct.h ? ` · ${selProduct.h}×${selProduct.w}×${selProduct.d} cm` : ''}
                </div>
              </div>
            </div>
          )}

          <div className="bed-section-h">Qué está mal en la foto</div>
          <textarea
            className="bed-notes"
            value={instrucciones}
            onChange={e => setInstrucciones(e.target.value)}
            rows={7}
            placeholder={'Escribe aquí las correcciones, como se lo dirías a un fotógrafo. Por ejemplo:\n\n· La botella de vino sale dos veces, solo va una.\n· El jamón tiene que ir más grande y en diagonal.\n· La caja de turrón está tumbada, va de pie.'}
          />
          <div className="bed-note-hint">
            Se le manda al modelo junto con la maqueta. Cuanto más concreto, mejor.
          </div>

          <div className="bed-actions">
            <button className="bed-btn bed-btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="bed-btn bed-btn-primary" onClick={apply} disabled={!ready}>
              {I.sparkle({ size: 14 })} Aplicar y regenerar
            </button>
          </div>
        </aside>
      </div>

      <style>{`
        .bed-back{position:fixed;inset:0;background:rgba(20,16,12,.68);backdrop-filter:blur(10px);z-index:700;display:grid;place-items:center;padding:28px;animation:fadeIn .2s ease}
        /* Altura definida (no solo max-height): el editor es un espacio de
           trabajo y el lienzo tiene que poder estirarse para llenarlo. */
        .bed-modal{position:relative;background:#fff;border-radius:20px;width:min(1240px,97vw);height:94vh;display:grid;grid-template-columns:1fr 340px;overflow:hidden;box-shadow:0 40px 100px -20px rgba(0,0,0,.45);animation:popIn .3s cubic-bezier(.2,.8,.2,1)}
        .bed-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.92);border:1px solid var(--line);color:var(--ink);z-index:20;transition:all .15s;cursor:pointer}
        .bed-close:hover{background:#fff;transform:scale(1.05);border-color:var(--ink)}

        .bed-main{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;border-right:1px solid var(--line);background:var(--paper)}
        .bed-head{padding:22px 26px 12px}
        .bed-eye{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:700}
        .bed-hint{font-size:12.5px;color:var(--muted);margin-top:6px;line-height:1.5;max-width:560px}

        .bed-stage-wrap{flex:1;min-height:0;padding:4px 26px 0;display:flex;align-items:center;justify-content:center}
        /* El lienzo se ajusta al hueco disponible manteniendo 4:3 exacto. */
        .bed-stage{position:relative;height:100%;width:auto;aspect-ratio:4/3;max-width:100%;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;touch-action:none;user-select:none}
        .bed-under{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:.22;pointer-events:none;z-index:1}
        .bed-loading{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:13px}

        /* Los productos no capturan el puntero: quién recibe el clic lo decide
           hitTest() mirando el píxel, para que el aire de una foto transparente
           no tape a los productos de debajo. Los tiradores sí lo capturan. */
        .bed-item{position:absolute;pointer-events:none}
        .bed-item img{width:100%;height:100%;object-fit:contain;pointer-events:none;filter:drop-shadow(0 6px 10px rgba(45,42,38,.16))}
        .bed-item.sel{outline:1.5px dashed var(--accent);outline-offset:3px;border-radius:2px}
        .bed-stage{cursor:grab}
        .bed-stage:active{cursor:grabbing}
        .bed-handle{position:absolute;pointer-events:auto;background:var(--accent);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.28);display:grid;place-items:center;color:#fff}
        .bed-scale{width:16px;height:16px;border-radius:50%;right:-9px;bottom:-9px;cursor:nwse-resize}
        .bed-rot{width:20px;height:20px;border-radius:50%;left:50%;top:-26px;margin-left:-10px;cursor:grab}

        .bed-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:14px 26px 18px}
        .bed-tool{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:99px;background:#fff;border:1px solid var(--line);color:var(--ink);font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;transition:all .12s}
        .bed-tool:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
        .bed-tool.on{background:var(--accent);border-color:var(--accent);color:#fff}
        .bed-tool:disabled{opacity:.4;cursor:not-allowed}
        .bed-tool-sep{width:1px;height:18px;background:var(--line);margin:0 4px}

        .bed-side{padding:26px 24px 20px;display:flex;flex-direction:column;background:#fff;overflow-y:auto;min-height:0}
        .bed-title{font-family:'Fraunces',serif;font-size:21px;font-weight:500;color:var(--ink);margin:0;line-height:1.2}
        .bed-sub{font-size:12px;color:var(--muted);margin-top:4px}

        .bed-selbox{display:flex;gap:10px;align-items:center;margin-top:16px;padding:10px;background:var(--paper);border:1px solid var(--line);border-radius:10px}
        .bed-selimg{width:40px;height:40px;border-radius:6px;background:#fff;border:1px solid var(--line);padding:3px;flex-shrink:0}
        .bed-selimg img{width:100%;height:100%;object-fit:contain}
        .bed-selinfo{min-width:0}
        .bed-seln{font-size:12.5px;font-weight:600;color:var(--ink);line-height:1.25}
        .bed-selm{font-size:11px;color:var(--muted);margin-top:2px}

        .bed-section-h{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:22px 0 8px}
        .bed-notes{width:100%;font-family:inherit;font-size:12.5px;color:var(--ink);line-height:1.5;background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 12px;resize:vertical;outline:none;transition:all .15s}
        .bed-notes:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .bed-notes::placeholder{color:var(--muted);font-size:12px;line-height:1.5}
        .bed-note-hint{font-size:11px;color:var(--muted);margin-top:6px;line-height:1.45}

        .bed-actions{display:flex;gap:8px;margin-top:auto;padding-top:18px}
        .bed-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:12px 14px;border-radius:10px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;transition:all .15s;border:1px solid transparent}
        .bed-btn:disabled{opacity:.5;cursor:not-allowed}
        .bed-btn-ghost{background:#fff;border-color:var(--line);color:var(--ink)}
        .bed-btn-ghost:hover:not(:disabled){border-color:var(--ink)}
        .bed-btn-primary{background:var(--accent);color:#fff;box-shadow:0 4px 12px -4px rgba(167,77,74,.45)}
        .bed-btn-primary:hover:not(:disabled){background:var(--accent-2);transform:translateY(-1px)}

        @media (max-width: 1040px){
          .bed-modal{grid-template-columns:1fr;max-height:96vh}
          .bed-main{border-right:none;border-bottom:1px solid var(--line)}
          .bed-side{max-height:none}
        }
      `}</style>
    </div>
  );
}
