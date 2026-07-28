import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I } from './icons.jsx';
import { autoLayout, loadMetrics, normalizeLayoutToImages, MASK, isJamon } from '../lib/composer.js';

// Editor de la maqueta del bodegón.
//
// Para qué sirve: cuando Gemini coloca mal un producto o lo saca de tamaño, el
// usuario no tenía forma de decírselo — solo "Regenerar", que repetía los
// mismos fallos. Aquí monta la escena a mano (arrastrar, escalar, girar) y esa
// maqueta se le manda al modelo como plano vinculante, junto con las
// correcciones que escriba.
//
// Reglas de interacción:
//   · Arrastrar          → mueve el producto.
//   · Círculos (esquinas)→ más grande / más pequeño, SIN deformar.
//   · Cuadrados (lados)  → transformación libre: estiran solo en ese sentido.
//                          Deforman el producto a propósito (lo pidió el
//                          cliente), y se avisa con un % para que se vea.
//   · Flechas            → mueven el seleccionado píxel a píxel.
//   · El giro va en la barra de abajo: solo hace falta para los jamones.
//
// Props:
//   open, gen ({ ref, title, items, image, layout }), products
//   onClose, onApply({ layout, instrucciones })
export default function BodegonEditorOverlay({ open, gen, products, onClose, onApply }) {
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState(null);
  const [instrucciones, setInstrucciones] = useState('');
  // Apagada por defecto: al superponerse con los productos de la maqueta se
  // confundía con productos "que no se dejan seleccionar".
  const [showRef, setShowRef] = useState(false);
  const [ready, setReady] = useState(false);
  const [applying, setApplying] = useState(false);
  const stageRef = useRef(null);
  const wrapRef = useRef(null);
  const dragState = useRef(null);
  const metricsRef = useRef(new Map());
  // El lienzo tiene que ser 4:3 EXACTO, igual que la maqueta que se le manda a
  // la IA: si no, lo que se coloca aquí no es lo que sale allí. Con CSS puro
  // (aspect-ratio + max-width/height) el navegador rompe la proporción en
  // cuanto una de las dos medidas topa, así que se calcula a mano.
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

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

  useEffect(() => {
    if (!open) return;
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      // Hay que medir el hueco REAL (sin el relleno del contenedor), o el
      // lienzo se pasa de ancho y el flex lo encoge rompiendo la proporción.
      const cs = getComputedStyle(el);
      const availW = el.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
      const availH = el.clientHeight - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);
      if (availW <= 0 || availH <= 0) return;
      const w = Math.floor(Math.min(availW, (availH * 4) / 3));
      setStageSize({ w, h: Math.round((w * 3) / 4) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

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
        // Esquinas: escala por distancia al centro. Proporcional (nunca
        // deforma) y da igual el giro que tenga el producto.
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        const k = clamp(dist / (st.startDist || 1), 0.15, 6);
        const w = clamp(orig.w * k, 0.02, 1.6);
        const h = orig.h * (w / orig.w);
        return { ...it, w, h, x: orig.x + orig.w / 2 - w / 2, y: orig.y + orig.h / 2 - h / 2 };
      }
      if (mode === 'scaleX' || mode === 'scaleY') {
        // Laterales: deforman (transformación libre). Se mide sobre el eje
        // PROPIO del producto, así funciona igual aunque esté girado.
        const a = (-(orig.rot || 0) * Math.PI) / 180;
        const vx = e.clientX - cx, vy = e.clientY - cy;
        const lx = vx * Math.cos(a) - vy * Math.sin(a);
        const ly = vx * Math.sin(a) + vy * Math.cos(a);
        if (mode === 'scaleX') {
          const k = clamp(Math.abs(lx) / (Math.abs(st.startLocalX) || 1), 0.15, 6);
          const w = clamp(orig.w * k, 0.02, 1.6);
          return { ...it, w, x: orig.x + orig.w / 2 - w / 2 };
        }
        const k = clamp(Math.abs(ly) / (Math.abs(st.startLocalY) || 1), 0.15, 6);
        const h = clamp(orig.h * k, 0.02, 1.6);
        return { ...it, h, y: orig.y + orig.h / 2 - h / 2 };
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
      const m = metricsRef.current.get(it.sku);
      if (!m?.mask) return i; // sin máscara (foto opaca): vale toda la caja
      // La foto va con object-fit:contain dentro de la caja. Si la caja no
      // tuviera exactamente su proporción quedarían bandas vacías, así que se
      // mide sobre la foto de verdad y no sobre la caja.
      let iw = halfW * 2, ih = halfH * 2;
      if (m.ratio && isFinite(m.ratio)) {
        if (iw / ih > m.ratio) iw = ih * m.ratio;
        else ih = iw / m.ratio;
      }
      if (Math.abs(dx) > iw / 2 || Math.abs(dy) > ih / 2) continue;
      const u = Math.min(MASK - 1, Math.max(0, Math.round(((dx + iw / 2) / iw) * (MASK - 1))));
      const v = Math.min(MASK - 1, Math.max(0, Math.round(((dy + ih / 2) / ih) * (MASK - 1))));
      if (m.mask[(v * MASK + u) * 4 + 3] > 12) return i;
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
    // Posición del puntero en el eje propio del producto (deshaciendo el giro):
    // hace falta para que los tiradores laterales escalen bien aunque esté
    // girado, y para que no pegue un salto al agarrarlos.
    const a = (-(orig.rot || 0) * Math.PI) / 180;
    const vx = e.clientX - cx, vy = e.clientY - cy;
    dragState.current = {
      idx, mode, rect, orig,
      startX: e.clientX,
      startY: e.clientY,
      startDist: Math.hypot(vx, vy),
      startAngle: Math.atan2(vy, vx),
      startLocalX: vx * Math.cos(a) - vy * Math.sin(a),
      startLocalY: vx * Math.sin(a) + vy * Math.cos(a),
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
  const rotateSel = (deg) => setItems(l => l.map((it, i) => i === sel ? { ...it, rot: (it.rot || 0) + deg } : it));

  // Cuánto se ha deformado un producto respecto a su foto real (0 = intacto).
  const distortionOf = (it) => {
    const ratio = metricsRef.current.get(it?.sku)?.ratio;
    if (!it || !ratio || !isFinite(ratio)) return 0;
    return ((it.w * 2048) / (it.h * 1536)) / ratio - 1;
  };
  const restoreProportion = () => setItems(l => l.map((it, i) => {
    if (i !== sel) return it;
    const ratio = metricsRef.current.get(it.sku)?.ratio;
    if (!ratio || !isFinite(ratio)) return it;
    const w = (it.h * 1536 * ratio) / 2048;
    return { ...it, w, x: it.x + it.w / 2 - w / 2 };
  }));

  // Duplicar = una unidad más de ese producto en la foto. Quitar = una menos.
  // La cantidad que se le pide a la IA sale de la maqueta, así que las dos
  // cosas cuadran solas con lo que se ve.
  const duplicateSel = () => {
    if (sel == null) return;
    const it = items[sel];
    setItems(l => [...l, { ...it, x: Math.min(0.96, it.x + 0.04), y: it.y, z: maxZ + 1 }]);
    setSel(items.length);
  };
  const removeSel = () => {
    if (sel == null) return;
    setItems(l => l.filter((_, i) => i !== sel));
    setSel(null);
  };

  const reset = () => {
    setItems(autoLayout(entries, metricsRef.current).items);
    setSel(null);
  };

  // Se mantiene el editor abierto (en modo "aplicando") hasta que la nueva
  // generación está en marcha: antes se cerraba al instante y aparecía una
  // ventana nueva unos segundos después, que despistaba.
  const apply = async () => {
    if (applying) return;
    setApplying(true);
    try {
      await onApply?.({
        layout: { version: 1, canvas: { w: 2048, h: 1536 }, items },
        instrucciones: instrucciones.trim(),
      });
    } finally {
      setApplying(false);
    }
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
              Arrastra los productos para colocarlos. Al seleccionar uno salen tiradores:
              los <strong>redondos de las esquinas</strong> lo hacen más grande o más pequeño sin
              deformarlo; los <strong>cuadrados de los lados</strong> lo estiran solo en ese sentido.
            </div>
          </div>

          <div className="bed-stage-wrap" ref={wrapRef}>
            <div
              className="bed-stage"
              ref={stageRef}
              onPointerDown={onStagePointerDown}
              style={stageSize.w ? { width: stageSize.w, height: stageSize.h } : undefined}
            >
              {showRef && gen.image && <img className="bed-under" src={gen.image} alt="" draggable={false}/>}
              {!ready && <div className="bed-loading">Preparando la maqueta…</div>}
              {ready && items.map((it, i) => {
                const p = bySku.get(it.sku);
                if (!p?.img) return null;
                return (
                  <div
                    key={i}
                    className="bed-item"
                    style={{
                      left: `${it.x * 100}%`,
                      top: `${it.y * 100}%`,
                      width: `${it.w * 100}%`,
                      height: `${it.h * 100}%`,
                      zIndex: 100 + (it.z || 0),
                      transform: `rotate(${it.rot || 0}deg)`,
                    }}
                    title={p.name}
                  >
                    <img src={metricsRef.current.get(it.sku)?.src || p.img} alt="" draggable={false}/>
                  </div>
                );
              })}

              {/* Recuadro y tiradores del seleccionado, en una capa por encima
                  de TODOS los productos: si fueran hijos del producto, los que
                  van delante los taparían y no se podrían coger. */}
              {ready && selItem && (() => {
                // El recuadro abraza el PRODUCTO, no la foto: si no, con el
                // aire transparente de los recortes salía un marco enorme y los
                // nodos quedaban lejos del producto.
                const t = metricsRef.current.get(selItem.sku)?.trim || { l: 0, r: 0, t: 0, b: 0 };
                const bx = selItem.x + t.l * selItem.w;
                const by = selItem.y + t.t * selItem.h;
                const bw = selItem.w * (1 - t.l - t.r);
                const bh = selItem.h * (1 - t.t - t.b);
                return (
                <div
                  className="bed-selbox-layer"
                  style={{
                    left: `${bx * 100}%`,
                    top: `${by * 100}%`,
                    width: `${bw * 100}%`,
                    height: `${bh * 100}%`,
                    transform: `rotate(${selItem.rot || 0}deg)`,
                  }}
                >
                  {/* Esquinas: mantienen la proporción. */}
                  {['nw', 'ne', 'sw', 'se'].map(corner => (
                    <span
                      key={corner}
                      className={`bed-handle bed-${corner}`}
                      onPointerDown={(e) => startDrag(e, sel, 'scale')}
                      title="Más grande o más pequeño, sin deformar"
                    />
                  ))}
                  {/* Laterales: transformación libre (deforman el producto). */}
                  {[['w', 'scaleX'], ['e', 'scaleX'], ['n', 'scaleY'], ['s', 'scaleY']].map(([side, mode]) => (
                    <span
                      key={side}
                      className={`bed-handle bed-free bed-${side}`}
                      onPointerDown={(e) => startDrag(e, sel, mode)}
                      title="Estirar solo en este sentido (deforma el producto)"
                    />
                  ))}
                </div>
                );
              })()}
            </div>
          </div>

          <div className="bed-toolbar">
            <button className="bed-tool" disabled={sel == null} onClick={duplicateSel}>Duplicar</button>
            <button className="bed-tool" disabled={sel == null} onClick={removeSel}>Quitar</button>
            <div className="bed-tool-sep"/>
            <button className="bed-tool" disabled={sel == null} onClick={bringFront}>Traer al frente</button>
            <button className="bed-tool" disabled={sel == null} onClick={sendBack}>Enviar atrás</button>
            <div className="bed-tool-sep"/>
            <button className="bed-tool" disabled={sel == null} onClick={() => rotateSel(-15)} title="Girar a la izquierda">↺</button>
            <button className="bed-tool" disabled={sel == null} onClick={() => rotateSel(15)} title="Girar a la derecha">↻</button>
            <div className="bed-tool-sep"/>
            <button className="bed-tool" onClick={reset}>{I.refresh({ size: 13 })} Reiniciar</button>
            {gen.image && (
              <button
                className={`bed-tool ${showRef ? 'on' : ''}`}
                onClick={() => setShowRef(v => !v)}
                title="Superpone la foto anterior, en transparencia, para comparar"
              >
                {I.expand({ size: 13 })} Comparar con la foto
              </button>
            )}
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
                {Math.abs(distortionOf(selItem)) > 0.05 && (
                  <button className="bed-warn" onClick={restoreProportion}>
                    Deformado un {Math.abs(Math.round(distortionOf(selItem) * 100))}% · restaurar proporción
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bed-section-h">Qué está mal en la foto</div>
          <textarea
            className="bed-notes"
            value={instrucciones}
            onChange={e => setInstrucciones(e.target.value)}
            rows={7}
            placeholder={'Por ejemplo: la botella de vino sale dos veces, solo va una.'}
          />
          <div className="bed-note-hint">
            Cuanto más concreto, mejor.
          </div>

          <div className="bed-actions">
            <button className="bed-btn bed-btn-ghost" onClick={onClose} disabled={applying}>Cancelar</button>
            <button className="bed-btn bed-btn-primary" onClick={apply} disabled={!ready || applying}>
              {applying
                ? <>Aplicando cambios…</>
                : <>{I.sparkle({ size: 14 })} Aplicar y regenerar</>}
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
        /* El tamaño exacto lo pone JS (4:3 clavado); esto es solo el aspecto. */
        .bed-stage{position:relative;flex:0 0 auto;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;touch-action:none;user-select:none}
        .bed-under{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:.22;pointer-events:none;z-index:1}
        .bed-loading{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:13px}

        /* Los productos no capturan el puntero: quién recibe el clic lo decide
           hitTest() mirando el píxel, para que el aire de una foto transparente
           no tape a los productos de debajo. Los tiradores sí lo capturan. */
        .bed-item{position:absolute;pointer-events:none}
        .bed-item img{width:100%;height:100%;object-fit:contain;pointer-events:none;filter:drop-shadow(0 6px 10px rgba(45,42,38,.16))}
        .bed-stage{cursor:grab}
        .bed-stage:active{cursor:grabbing}

        /* Capa de selección: por encima de todos los productos (z 100..999). */
        .bed-selbox-layer{position:absolute;z-index:5000;pointer-events:none;outline:1.5px dashed var(--accent);outline-offset:3px;border-radius:2px}
        .bed-handle{position:absolute;width:14px;height:14px;border-radius:50%;pointer-events:auto;background:#fff;border:2.5px solid var(--accent);box-shadow:0 2px 6px rgba(0,0,0,.3);transition:transform .1s}
        .bed-handle:hover{transform:scale(1.25)}
        .bed-nw{left:-8px;top:-8px;cursor:nwse-resize}
        .bed-ne{right:-8px;top:-8px;cursor:nesw-resize}
        .bed-sw{left:-8px;bottom:-8px;cursor:nesw-resize}
        .bed-se{right:-8px;bottom:-8px;cursor:nwse-resize}
        /* Laterales (deforman): cuadrados y más discretos, para distinguirlos
           a simple vista de las esquinas, que sí respetan la proporción. */
        .bed-free{border-radius:3px;width:12px;height:12px;border-color:var(--muted)}
        .bed-w{left:-7px;top:50%;margin-top:-6px;cursor:ew-resize}
        .bed-e{right:-7px;top:50%;margin-top:-6px;cursor:ew-resize}
        .bed-n{top:-7px;left:50%;margin-left:-6px;cursor:ns-resize}
        .bed-s{bottom:-7px;left:50%;margin-left:-6px;cursor:ns-resize}

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
        .bed-warn{margin-top:6px;font-family:inherit;font-size:10.5px;font-weight:600;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent);border-radius:99px;padding:3px 9px;cursor:pointer;text-align:left;line-height:1.3}
        .bed-warn:hover{background:var(--accent);color:#fff}

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
