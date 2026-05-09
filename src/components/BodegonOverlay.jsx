import React, { useEffect, useState } from 'react';
import { I } from './icons.jsx';
import { startBodegonGeneration, pollBodegon, commitBodegon, discardBodegon } from '../lib/api.js';
import DownloadModal from './DownloadModal.jsx';

export default function BodegonOverlay({
  open, onClose, products, selected,
  title, setTitle, description, setDescription,
  onSaved, onDeleted,
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [generated, setGenerated] = useState(null); // { id, image, image_path, title, description, skus }
  const [savedHint, setSavedHint] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);

  const sel = selected.map(s => products.find(p => p.sku === s)).filter(Boolean);
  const sorted = [...sel].sort((a, b) => b.h - a.h);
  const maxH = Math.max(...sel.map(p => p.h), 30);

  const runGeneration = async () => {
    setError(null);
    setGenerated(null);
    setGenerating(true);
    setElapsed(0);
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const created = await startBodegonGeneration({
        skus: selected,
        title,
        description: description || '',
      });
      if (created.title) setTitle(created.title);
      const result = await pollBodegon(created.id);
      setGenerated(result);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error generando el bodegón.');
    } finally {
      clearInterval(tick);
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    runGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRegen = () => runGeneration();

  const handleSave = async () => {
    if (!generated) return;
    try {
      const saved = await commitBodegon(generated.id, {
        nombre: title,
        descripcion: description || null,
      });
      setSavedHint(true);
      setTimeout(() => {
        setSavedHint(false);
        onSaved && onSaved(saved || generated);
        onClose();
      }, 700);
    } catch (e) {
      setError(e.message || 'Error guardando en historial.');
    }
  };

  const handleDelete = async () => {
    try {
      if (generated?.id) await discardBodegon(generated.id);
    } catch (e) {
      console.warn('No se pudo descartar:', e);
    }
    if (generated?.id) onDeleted && onDeleted(generated.id);
    onClose();
  };

  // Al cerrar el modal sin guardar, descartar el draft también
  const handleClose = async () => {
    if (generated?.id) {
      try { await discardBodegon(generated.id); } catch {}
    }
    onClose();
  };

  const handleDownload = () => {
    if (!generated?.image) return;
    setDlOpen(true);
  };

  if (!open) return null;

  return (
    <div className="bo-back" onClick={handleClose}>
      <div className="bo-modal" onClick={e => e.stopPropagation()}>
        <button className="bo-close" onClick={handleClose} title="Cerrar">{I.close({ size: 18 })}</button>

        <div className="bo-stage-wrap">
          <div className={`bo-stage ${generating ? 'busy' : ''}`}>
            {generating && (
              <div className="bo-loading">
                <div className="bo-loading-orb"/>
                <div className="bo-loading-text">Generando con Gemini IA…</div>
                <div className="bo-loading-sub">
                  {elapsed < 8 && 'Construyendo el prompt y enviando referencias'}
                  {elapsed >= 8 && elapsed < 25 && 'Componiendo la pirámide TRASERA → MEDIA → DELANTERA'}
                  {elapsed >= 25 && elapsed < 60 && 'Aplicando iluminación de estudio y sombras'}
                  {elapsed >= 60 && 'Casi listo · ' + elapsed + 's'}
                </div>
                {elapsed > 0 && <div className="bo-loading-sub" style={{opacity:.6,marginTop:4}}>{elapsed}s</div>}
              </div>
            )}

            {!generating && error && (
              <div className="bo-error">
                <div className="bo-error-t">No se ha podido generar el bodegón</div>
                <div className="bo-error-s">{error}</div>
                <button className="bo-btn bo-btn-ghost" onClick={handleRegen}>{I.refresh({ size: 14 })} Reintentar</button>
              </div>
            )}

            {!generating && !error && generated?.image && (
              <button type="button" className="bo-img-wrap" onClick={() => setZoomed(true)} title="Ampliar imagen">
                <img className="bo-img" src={generated.image} alt={title} />
                <span className="bo-zoom-hint">{I.expand({ size: 14 })} Ampliar</span>
              </button>
            )}

            {!generating && !error && !generated?.image && (
              <div className="bo-comp">
                {sorted.map((p, i) => {
                  const layer = i;
                  const side = i === 0 ? 0 : (i % 2 === 1 ? -1 : 1);
                  const offset = Math.ceil(i / 2);
                  const heightPct = (p.h / maxH) * 78;
                  const isBottle = p.h / Math.max(p.w, p.d) > 2;
                  const widthPct = isBottle ? heightPct * (p.w / p.h) * 0.9 : heightPct * (p.w / p.h);
                  const xOff = side * (offset * 9 + 4);
                  const yOff = layer * 1.5;
                  const z = 100 - layer;
                  return (
                    <div key={p.sku} className="bo-item" style={{
                      height: `${heightPct}%`,
                      width: `${widthPct}%`,
                      left: `calc(50% + ${xOff}% - ${widthPct / 2}%)`,
                      bottom: `${12 + yOff}%`,
                      zIndex: z,
                    }}>
                      <img src={p.img} alt={p.name} draggable={false}/>
                      <div className="bo-item-shadow"/>
                    </div>
                  );
                })}
                <div className="bo-floor"/>
              </div>
            )}
          </div>
          <button className="bo-regen" onClick={handleRegen} disabled={generating} title="Regenerar otra variación">
            {I.refresh({ size: 14 })} Regenerar
          </button>
        </div>

        <aside className="bo-side">
          <div className="bo-eye">Bodegón generado</div>
          {editingTitle ? (
            <input
              autoFocus
              className="bo-title-input"
              defaultValue={title}
              onBlur={e => { setTitle(e.target.value || title); setEditingTitle(false); }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.target.blur();
                if (e.key === 'Escape') setEditingTitle(false);
              }}
            />
          ) : (
            <h2 className="bo-title" onClick={() => setEditingTitle(true)} title="Click para renombrar">
              {title}
              <span className="bo-title-edit">{I.edit({ size: 14 })}</span>
            </h2>
          )}
          <div className="bo-meta">{sel.length} productos · {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</div>

          <div className="bo-section-h">Descripción</div>
          <textarea
            className="bo-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Añade una descripción o notas sobre este lote…"
            rows={4}
          />

          <div className="bo-section-h">Productos</div>
          <div className="bo-prods">
            {sel.map(p => (
              <div key={p.sku} className="bo-prod">
                <div className="bo-prod-img"><img src={p.img} alt=""/></div>
                <div className="bo-prod-info">
                  <div className="bo-prod-n">{p.name}</div>
                  <div className="bo-prod-m">{p.brand}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="bo-actions">
            <div className="bo-actions-row">
              <button className="bo-btn bo-btn-ghost" onClick={handleDelete} title="Descartar bodegón">
                {I.trash({ size: 14 })} Eliminar
              </button>
              <button className="bo-btn bo-btn-ghost" disabled={generating || !generated?.image} onClick={handleDownload}>
                {I.download({ size: 14 })} Descargar
              </button>
            </div>
            <div className="bo-actions-row">
              <button className="bo-btn bo-btn-primary" disabled={generating || !generated?.image} onClick={handleSave}>
                {savedHint ? '✓ Guardado en historial' : <>{I.check({ size: 14 })} Guardar en historial</>}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {zoomed && generated?.image && (
        <div className="bo-zoom-bg" onClick={() => setZoomed(false)}>
          <button className="bo-zoom-close" onClick={(e)=>{e.stopPropagation();setZoomed(false);}}>{I.close({ size: 22 })}</button>
          <img className="bo-zoom-img" src={generated.image} alt={title} onClick={(e)=>e.stopPropagation()}/>
        </div>
      )}

      <DownloadModal
        open={dlOpen}
        onClose={() => setDlOpen(false)}
        bodegon={generated ? { ...generated, title, description, skus: selected, created_at: new Date().toISOString() } : null}
        products={products}
      />

      <style>{`
        .bo-back{position:fixed;inset:0;background:rgba(20,16,12,.62);backdrop-filter:blur(10px);z-index:500;display:grid;place-items:center;padding:32px;animation:fadeIn .25s ease}
        .bo-modal{position:relative;background:#fff;border-radius:20px;width:min(1180px,96vw);max-height:94vh;display:grid;grid-template-columns:1fr 380px;overflow:hidden;box-shadow:0 40px 100px -20px rgba(0,0,0,.45),0 4px 16px rgba(0,0,0,.08);animation:popIn .3s cubic-bezier(.2,.8,.2,1)}
        .bo-close{position:absolute;top:16px;right:16px;width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border:1px solid var(--line);color:var(--ink);transition:all .15s;z-index:10}
        .bo-close:hover{background:#fff;transform:scale(1.06);border-color:var(--ink)}

        .bo-stage-wrap{position:relative;background:#fff;display:flex;align-items:center;justify-content:center;padding:30px 30px 80px;min-height:560px;border-right:1px solid var(--line)}
        .bo-stage{position:relative;width:100%;height:100%;min-height:480px;border-radius:14px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#fff}
        .bo-stage.busy{background:linear-gradient(135deg,#FAFAF7 0%,#F1ECDF 100%)}
        .bo-img-wrap{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:transparent;border:none;padding:0;cursor:zoom-in;overflow:hidden;border-radius:14px}
        .bo-img{width:100%;height:100%;max-height:100%;max-width:100%;object-fit:contain;object-position:center;display:block;transition:transform .4s cubic-bezier(.2,.8,.2,1)}
        .bo-img-wrap:hover .bo-img{transform:scale(1.015)}
        .bo-zoom-hint{position:absolute;bottom:14px;right:14px;display:inline-flex;align-items:center;gap:6px;padding:6px 11px;background:rgba(20,16,12,.75);backdrop-filter:blur(6px);color:#fff;font-size:11px;font-weight:600;letter-spacing:.04em;border-radius:99px;opacity:0;transition:opacity .2s;pointer-events:none}
        .bo-img-wrap:hover .bo-zoom-hint{opacity:1}

        .bo-zoom-bg{position:fixed;inset:0;background:rgba(20,16,12,.92);backdrop-filter:blur(12px);z-index:2000;display:flex;align-items:center;justify-content:center;padding:32px;cursor:zoom-out;animation:zoomFade .3s cubic-bezier(.2,.8,.2,1)}
        @keyframes zoomFade{from{opacity:0}to{opacity:1}}
        .bo-zoom-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 30px 100px rgba(0,0,0,.6);cursor:default;animation:zoomIn .35s cubic-bezier(.2,.8,.2,1)}
        @keyframes zoomIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
        .bo-zoom-close{position:fixed;top:24px;right:24px;width:46px;height:46px;border-radius:14px;background:rgba(255,255,255,.12);color:#fff;display:grid;place-items:center;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.2);z-index:2001;transition:all .15s;cursor:pointer}
        .bo-zoom-close:hover{background:rgba(255,255,255,.25);transform:scale(1.06)}

        .bo-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:0 24px}
        .bo-loading-orb{width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,var(--accent-soft));box-shadow:0 0 0 0 var(--accent-soft);animation:boOrb 1.4s ease-in-out infinite}
        @keyframes boOrb{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(167,77,74,.4)}50%{transform:scale(1.08);box-shadow:0 0 0 18px rgba(167,77,74,0)}}
        .bo-loading-text{font-family:'Fraunces',serif;font-size:18px;color:var(--ink);margin-top:14px}
        .bo-loading-sub{font-size:12.5px;color:var(--muted)}

        .bo-error{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:32px;color:var(--accent)}
        .bo-error-t{font-family:'Fraunces',serif;font-size:18px;color:var(--ink);font-weight:500}
        .bo-error-s{font-size:13px;color:var(--muted);max-width:420px;line-height:1.55}

        .bo-comp{position:relative;width:100%;height:100%;animation:fadeIn .5s ease}
        .bo-floor{position:absolute;left:-10%;right:-10%;bottom:6%;height:16px;background:radial-gradient(ellipse at center, rgba(45,42,38,.18), transparent 70%);filter:blur(6px);z-index:1}
        .bo-item{position:absolute}
        .bo-item img{width:100%;height:100%;object-fit:contain;object-position:bottom center;filter:drop-shadow(0 12px 18px rgba(45,42,38,.18)) drop-shadow(0 4px 6px rgba(45,42,38,.12))}
        .bo-item-shadow{position:absolute;left:-15%;right:-15%;bottom:-6%;height:10%;background:radial-gradient(50% 100% at 50% 0%, rgba(45,42,38,.32), transparent 70%);filter:blur(3px);z-index:-1}

        .bo-regen{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:7px;padding:9px 16px;background:#fff;color:var(--ink);border:1px solid var(--line);border-radius:99px;font-size:12.5px;font-weight:600;box-shadow:0 4px 14px -4px rgba(45,42,38,.2);transition:all .15s}
        .bo-regen:hover:not(:disabled){border-color:var(--accent);color:var(--accent);transform:translateX(-50%) translateY(-1px);box-shadow:0 8px 20px -6px rgba(167,77,74,.3)}
        .bo-regen:disabled{opacity:.5;cursor:not-allowed}

        .bo-side{padding:36px 28px 24px;display:flex;flex-direction:column;background:var(--paper);overflow-y:auto;max-height:94vh}
        .bo-eye{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:8px}
        .bo-title{font-family:'Fraunces',serif;font-size:26px;font-weight:500;color:var(--ink);letter-spacing:-.012em;line-height:1.18;cursor:text;display:inline-flex;align-items:center;gap:8px;border-radius:7px;padding:2px 6px;margin:0 0 0 -6px}
        .bo-title:hover{background:rgba(45,42,38,.04)}
        .bo-title:hover .bo-title-edit{opacity:.6}
        .bo-title-edit{opacity:0;color:var(--muted);transition:opacity .15s;display:inline-grid;place-items:center}
        .bo-title-input{font-family:'Fraunces',serif;font-size:26px;font-weight:500;color:var(--ink);background:#fff;border:1.5px solid var(--accent);border-radius:7px;padding:3px 8px;width:100%;margin-left:-6px;outline:none;box-shadow:0 0 0 4px var(--accent-soft)}
        .bo-meta{font-size:12.5px;color:var(--muted);margin-top:4px}

        .bo-section-h{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:24px 0 8px}
        .bo-desc{width:100%;font-family:inherit;font-size:13px;color:var(--ink);line-height:1.55;background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 13px;resize:vertical;min-height:78px;outline:none;transition:all .15s}
        .bo-desc:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .bo-desc::placeholder{color:var(--muted);font-style:italic}

        .bo-prods{display:flex;flex-direction:column;gap:6px;flex:1}
        .bo-prod{display:flex;gap:10px;padding:8px 10px;background:#fff;border:1px solid var(--line);border-radius:9px;align-items:center}
        .bo-prod-img{width:36px;height:36px;border-radius:6px;background:#fff;border:1px solid var(--line);overflow:hidden;flex-shrink:0;padding:3px}
        .bo-prod-img img{width:100%;height:100%;object-fit:contain}
        .bo-prod-info{min-width:0;flex:1}
        .bo-prod-n{font-size:12.5px;font-weight:600;color:var(--ink);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .bo-prod-m{font-size:11px;color:var(--muted);margin-top:2px;font-variant-numeric:tabular-nums}

        .bo-actions{display:flex;flex-direction:column;gap:6px;padding-top:18px;border-top:1px solid var(--line);margin-top:18px}
        .bo-actions-row{display:flex;gap:6px}
        .bo-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:11px 12px;border-radius:10px;font-size:12.5px;font-weight:600;letter-spacing:-.005em;transition:all .15s}
        .bo-btn:disabled{opacity:.5;cursor:not-allowed}
        .bo-btn-ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
        .bo-btn-ghost:hover:not(:disabled){border-color:var(--ink);transform:translateY(-1px)}
        .bo-btn-primary{background:var(--accent);color:#fff;box-shadow:0 1px 2px rgba(167,77,74,.3),0 4px 12px -4px rgba(167,77,74,.45)}
        .bo-btn-primary:hover:not(:disabled){background:var(--accent-2);transform:translateY(-1px)}

        @media (max-width: 1000px){
          .bo-modal{grid-template-columns:1fr;max-height:96vh}
          .bo-stage-wrap{min-height:340px;padding:32px 24px 64px}
          .bo-side{border-top:1px solid var(--line)}
        }
      `}</style>
    </div>
  );
}
