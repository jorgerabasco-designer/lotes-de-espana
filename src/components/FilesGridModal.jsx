import React, { useMemo, useState } from 'react';
import { I } from './icons.jsx';
import ConfirmModal from './ConfirmModal.jsx';

// Modal genérico para ver el listado de ficheros guardados en un bucket
// (etiquetas o fotos de lotes). Cada item lleva su thumbnail, nombre y un
// botón para borrar (con confirmación).
//
// Props:
//   open           boolean
//   onClose        () => void
//   title          "Etiquetas guardadas" / "Fotos de lotes"
//   items          [{ id: string, label: string, url: string, size, updatedAt, isPdf }]
//   onDelete       async (item) => void
//   emptyText      texto cuando items=[]
//   searchPlaceholder texto del buscador
export default function FilesGridModal({ open, onClose, title, items = [], onDelete, emptyText, searchPlaceholder = 'Buscar…' }) {
  const [query, setQuery] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it => it.label.toLowerCase().includes(q));
  }, [items, query]);

  if (!open) return null;

  const doDelete = async () => {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      await onDelete(confirmDel);
      setConfirmDel(null);
    } finally { setDeleting(false); }
  };

  function formatBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  return (
    <div className="fgm-back" onClick={onClose}>
      <div className="fgm-modal" onClick={e => e.stopPropagation()}>
        <header className="fgm-head">
          <div className="fgm-headinfo">
            <div className="fgm-eye">Listado</div>
            <h2 className="fgm-title">{title}</h2>
            <div className="fgm-sub">{filtered.length} de {items.length} · pulsa una para descargarla en pestaña nueva</div>
          </div>
          <div className="fgm-headtools">
            <div className="fgm-search">
              {I.search({ size: 14 })}
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                autoFocus
              />
              {query && (
                <button className="fgm-clear" onClick={() => setQuery('')} aria-label="Limpiar">
                  {I.close({ size: 12 })}
                </button>
              )}
            </div>
            <button className="fgm-close" onClick={onClose} aria-label="Cerrar">{I.close({ size: 18 })}</button>
          </div>
        </header>

        <div className="fgm-body">
          {filtered.length === 0 ? (
            <div className="fgm-empty">
              {query
                ? `No hay resultados para "${query}".`
                : (emptyText || 'No hay ficheros guardados todavía.')}
            </div>
          ) : (
            <div className="fgm-grid">
              {filtered.map(it => (
                <div className="fgm-card" key={it.id}>
                  <a className="fgm-thumb" href={it.url} target="_blank" rel="noopener noreferrer" title="Abrir en pestaña nueva">
                    {it.isPdf ? (
                      <div className="fgm-pdf">{I.excel({ size: 26 })}<span>PDF</span></div>
                    ) : (
                      <img src={it.url} alt={it.label} loading="lazy"/>
                    )}
                  </a>
                  <div className="fgm-info">
                    <div className="fgm-label">{it.label}</div>
                    <div className="fgm-meta">
                      {it.size ? formatBytes(it.size) : ''}
                    </div>
                  </div>
                  <button
                    className="fgm-del"
                    onClick={() => setConfirmDel(it)}
                    title="Borrar"
                    aria-label={`Borrar ${it.label}`}
                  >{I.trash({ size: 14 })}</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <ConfirmModal
          open={!!confirmDel}
          icon="trash"
          tone="danger"
          title={confirmDel ? `¿Borrar "${confirmDel.label}"?` : ''}
          description="Se eliminará del almacenamiento y no podrás recuperarla. Esta acción no se puede deshacer."
          cancelLabel="Cancelar"
          confirmLabel={deleting ? 'Borrando…' : 'Borrar'}
          confirmTone="danger"
          onCancel={() => !deleting && setConfirmDel(null)}
          onConfirm={doDelete}
        />

        <style>{`
          .fgm-back{position:fixed;inset:0;background:rgba(20,16,12,.55);backdrop-filter:blur(8px);z-index:600;display:grid;place-items:center;padding:24px;animation:fadeIn .2s}
          .fgm-modal{position:relative;background:#FAFAF7;border-radius:18px;width:min(1080px,96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 40px 90px -20px rgba(0,0,0,.4);animation:popIn .3s cubic-bezier(.2,.8,.2,1)}
          .fgm-close{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:#fff;border:1px solid var(--line);color:var(--ink);transition:all .15s;cursor:pointer;flex-shrink:0}
          .fgm-close:hover{transform:scale(1.05);border-color:var(--ink)}

          .fgm-head{padding:22px 28px 14px;border-bottom:1px solid var(--line);background:#fff;flex-shrink:0;display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;align-items:flex-end}
          .fgm-headinfo{flex:1;min-width:200px}
          .fgm-headtools{display:flex;align-items:center;gap:10px;flex-shrink:0}
          .fgm-eye{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:6px}
          .fgm-title{font-family:'Fraunces',serif;font-size:24px;font-weight:500;color:var(--ink);letter-spacing:-.012em;margin:0}
          .fgm-sub{color:var(--muted);font-size:12px;margin-top:4px}
          .fgm-search{display:flex;align-items:center;gap:8px;padding:0 12px;height:38px;background:#fff;border:1px solid var(--line);border-radius:10px;color:var(--muted);min-width:220px}
          .fgm-search:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
          .fgm-search input{flex:1;border:none;background:none;outline:none;font-size:13.5px;color:var(--ink);font-family:inherit;min-width:0}
          .fgm-clear{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:var(--muted);background:transparent;border:none;flex-shrink:0;cursor:pointer}

          .fgm-body{padding:16px 22px;overflow-y:auto;flex:1;min-height:0}
          .fgm-empty{padding:60px 20px;text-align:center;color:var(--muted);font-size:13.5px}

          .fgm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
          .fgm-card{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;position:relative;transition:all .15s}
          .fgm-card:hover{transform:translateY(-2px);box-shadow:0 8px 22px -10px rgba(45,42,38,.2);border-color:#cdc4b3}
          .fgm-thumb{display:block;aspect-ratio:1/1;background:#FAFAF7;overflow:hidden;position:relative}
          .fgm-thumb img{width:100%;height:100%;object-fit:contain;padding:8px}
          .fgm-pdf{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.05em}
          .fgm-info{padding:10px 12px 12px;display:flex;flex-direction:column;gap:2px;border-top:1px solid var(--line-2)}
          .fgm-label{font-size:12.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.3px}
          .fgm-meta{font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums}
          .fgm-del{position:absolute;top:6px;right:6px;width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.92);border:1px solid var(--line);color:var(--muted);display:grid;place-items:center;cursor:pointer;transition:all .15s;opacity:0}
          .fgm-card:hover .fgm-del{opacity:1}
          .fgm-del:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
        `}</style>
      </div>
    </div>
  );
}
