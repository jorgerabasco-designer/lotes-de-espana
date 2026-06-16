import React, { useEffect, useState } from 'react';
import { I } from './icons.jsx';

// Píldora flotante que aparece abajo-izquierda. En cola múltiple, muestra
// la generación más RECIENTE que no se esté viendo en el overlay grande.
// Si hay varias minimizadas, abajo de la principal se ve un contador
// "+N más en cola" que es clickable y abre Historial → En curso.
//
// Estados de la principal:
//   · generating → spinner + título + tiempo transcurrido
//   · draft      → "Bodegón listo · Ver" pulsando suave
//   · failed     → ícono de error + mensaje breve
export default function MinimizedGenPill({ activeGens = [], viewingRef, onOpen, onCancel }) {
  // Tick cada segundo para el contador de tiempo.
  const [, setNow] = useState(Date.now());

  // Filtramos las gens que NO están siendo vistas en el overlay grande.
  // Mostramos la más reciente (último elemento del array, que se va añadiendo
  // al final en startBodegon).
  const minimized = activeGens.filter(g => g.ref !== viewingRef);
  const main = minimized[minimized.length - 1] || null;
  const others = minimized.length - 1;
  const hasGenerating = minimized.some(g => g.status === 'generating');

  useEffect(() => {
    if (!hasGenerating) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasGenerating]);

  if (!main) return null;

  const elapsed = main.t0 ? Math.max(0, Math.round((Date.now() - main.t0) / 1000)) : 0;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const elapsedStr = m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;

  const status = main.status;
  const activeGen = main; // alias para no tocar el resto del JSX

  return (
    <div className="mgp-wrap" role="status" aria-live="polite">
      <div className={`mgp ${status}`}>
        <button className="mgp-main" onClick={() => onOpen(main.ref)} title={status === 'draft' ? 'Abrir bodegón listo' : 'Abrir generación'}>
          {status === 'generating' && (
            <>
              <span className="mgp-spin"/>
              <span className="mgp-text">
                <span className="mgp-t">Generando bodegón…</span>
                <span className="mgp-s">{activeGen.title} · {elapsedStr}</span>
              </span>
            </>
          )}
          {status === 'draft' && (
            <>
              <span className="mgp-check">{I.check({ size: 16 })}</span>
              <span className="mgp-text">
                <span className="mgp-t">Bodegón listo</span>
                <span className="mgp-s">{activeGen.title} · pulsa para revisar</span>
              </span>
              <span className="mgp-arrow">{I.expand({ size: 13 })}</span>
            </>
          )}
          {status === 'failed' && (
            <>
              <span className="mgp-err">!</span>
              <span className="mgp-text">
                <span className="mgp-t">Generación fallida</span>
                <span className="mgp-s">{activeGen.title} · pulsa para ver detalles</span>
              </span>
            </>
          )}
        </button>
        <button
          className="mgp-x"
          onClick={(e) => { e.stopPropagation(); onCancel(main.ref); }}
          title={status === 'generating' ? 'Cancelar generación' : 'Descartar borrador'}
          aria-label="Cancelar"
        >{I.close({ size: 14 })}</button>
      </div>
      {others > 0 && (
        <div className="mgp-count" title="Hay más bodegones en cola — míralos en Historial → En curso">
          +{others} más en cola
        </div>
      )}

      <style>{`
        .mgp-wrap{position:fixed; left:20px; bottom:20px; z-index:550;display:flex;flex-direction:column;gap:6px;align-items:flex-start;animation: mgpIn .25s cubic-bezier(.2,.8,.2,1)}
        .mgp-count{font-size:11px;color:var(--muted);background:#fff;border:1px solid var(--line);border-radius:99px;padding:3px 10px;font-weight:600;letter-spacing:.02em;box-shadow:0 4px 12px -4px rgba(45,42,38,.18)}
        .mgp{
          z-index:550;
          display:flex; align-items:center; gap:0;
          background:#fff; border:1px solid var(--line); border-radius:14px;
          box-shadow:0 14px 38px -10px rgba(45,42,38,.32), 0 4px 12px rgba(45,42,38,.10);
          padding:4px; min-width:260px; max-width:360px;
          animation: mgpIn .25s cubic-bezier(.2,.8,.2,1);
        }
        @keyframes mgpIn{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}
        .mgp.generating{border-color:var(--accent-soft)}
        .mgp.draft{border-color:var(--accent);box-shadow:0 16px 40px -10px rgba(167,77,74,.45), 0 4px 14px rgba(167,77,74,.18);animation: mgpIn .25s cubic-bezier(.2,.8,.2,1), mgpReady 1.6s ease-in-out infinite}
        @keyframes mgpReady{0%,100%{box-shadow:0 16px 40px -10px rgba(167,77,74,.45), 0 4px 14px rgba(167,77,74,.18)}50%{box-shadow:0 18px 46px -8px rgba(167,77,74,.55), 0 6px 18px rgba(167,77,74,.24)}}
        .mgp.failed{border-color:rgba(167,77,74,.55)}

        .mgp-main{flex:1;display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:transparent;border:none;cursor:pointer;text-align:left;min-width:0;font-family:inherit;color:inherit;transition:background .12s}
        .mgp-main:hover{background:var(--bg)}

        .mgp-spin{width:18px;height:18px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--accent);animation: mgpSpin .8s linear infinite;flex-shrink:0}
        @keyframes mgpSpin{to{transform:rotate(360deg)}}
        .mgp-check{width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;flex-shrink:0}
        .mgp-err{width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;flex-shrink:0;font-family:'Fraunces',serif;font-weight:700;font-size:14px}

        .mgp-text{display:flex;flex-direction:column;min-width:0;flex:1;line-height:1.2}
        .mgp-t{font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mgp.draft .mgp-t{color:var(--accent)}
        .mgp-s{font-size:11px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}

        .mgp-arrow{color:var(--accent);display:grid;place-items:center;flex-shrink:0}
        .mgp-x{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:var(--muted);background:transparent;border:none;flex-shrink:0;transition:all .12s;cursor:pointer}
        .mgp-x:hover{background:var(--accent-soft);color:var(--accent)}

        @media (max-width: 600px){
          .mgp-wrap{left:12px;right:12px;bottom:12px;align-items:stretch}
          .mgp{min-width:0;max-width:none}
        }
      `}</style>
    </div>
  );
}
