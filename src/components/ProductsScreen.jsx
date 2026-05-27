import React, { useEffect, useRef, useState } from 'react';
import { I } from './icons.jsx';
import { useTaxonomy } from '../lib/taxonomy.jsx';

const PAGE_SIZE = 25;

export default function ProductsScreen({ products, onEdit, onDelete, onNew, onImport }) {
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  // Paginación incremental: empezamos mostrando PAGE_SIZE; al llegar al final
  // del listado cargamos otros PAGE_SIZE (IntersectionObserver más abajo).
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const screenRef = useRef(null);
  const sentinelRef = useRef(null);

  const { categories, catLabels } = useTaxonomy();
  const cats = [{ id: 'all', label: 'Todos' }, ...categories.map(c => ({ id: c.id, label: c.label }))];
  const filtered = products.filter(p => {
    if (cat !== 'all' && p.cat !== cat) return false;
    if (q && !(p.name + p.brand + p.sku).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const visibleProducts = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Cada vez que cambia el filtro / la búsqueda volvemos al principio.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    if (screenRef.current) screenRef.current.scrollTop = 0;
  }, [cat, q]);

  // Carga automática al ver el sentinel cerca del fondo.
  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const root = screenRef.current || null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(v => Math.min(v + PAGE_SIZE, filtered.length));
        }
      },
      { root, rootMargin: '120px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, filtered.length]);

  return (
    <section className="screen" ref={screenRef}>
      <header className="cat-head">
        <div>
          <h1 className="cat-title">Productos</h1>
          <p className="cat-sub">
            Gestión completa de tu catálogo · {products.length} productos
            {filtered.length !== products.length && (
              <> · <strong>{filtered.length}</strong> en este filtro</>
            )}
          </p>
        </div>
        <div className="screen-head-r">
          <button className="btn btn-special" onClick={onImport}>{I.upload({ size: 16 })} Importar productos</button>
          <button className="btn btn-primary" onClick={onNew}>{I.plus({ size: 16 })} Nuevo producto</button>
        </div>
      </header>

      <div className="toolbar">
        <div className="search">
          {I.search({ size: 16 })}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, marca o referencia..." />
        </div>
      </div>

      <div className="filterrow">
        {cats.map(c => (
          <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </div>

      <div className="ptable">
        <div className="prow phead">
          <div className="pc-img"></div>
          <div className="pc-name">Producto</div>
          <div className="pc-sku">Referencia</div>
          <div className="pc-cat">Categoría</div>
          <div className="pc-dim">Dimensiones</div>
          <div className="pc-act"></div>
        </div>
        {visibleProducts.map(p => (
          <div key={p.sku} className="prow prow-clickable" onClick={() => onEdit(p)}>
            <div className="pc-img">
              <div className="pc-thumb">{p.img ? <img src={p.img} alt=""/> : null}</div>
            </div>
            <div className="pc-name">
              <div className="pc-title">{p.name}</div>
              <div className="pc-brand">{p.brand}</div>
            </div>
            <div className="pc-sku mono">{p.sku}</div>
            <div className="pc-cat"><span className="cat-tag">{catLabels[p.cat] || p.cat}</span></div>
            <div className="pc-dim mono">{p.h}×{p.w}×{p.d} cm</div>
            <div className="pc-act">
              <button className="iconbtn-l danger" onClick={(e) => { e.stopPropagation(); setConfirmDel(p); }} title="Eliminar">{I.trash({ size: 15 })}</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No hay productos que coincidan con tu búsqueda.
          </div>
        )}
        {hasMore && (
          <div ref={sentinelRef} className="prow-load">
            <div className="prow-load-spin"/>
            <span>Cargando más productos… ({visibleCount} de {filtered.length})</span>
          </div>
        )}
        {!hasMore && filtered.length > PAGE_SIZE && (
          <div className="prow-end">
            Mostrando los {filtered.length} productos.
          </div>
        )}
      </div>

      {confirmDel && (
        <div className="conf-bg" onClick={() => setConfirmDel(null)}>
          <div className="conf" onClick={e => e.stopPropagation()}>
            <div className="conf-icon">{I.trash({ size: 22 })}</div>
            <h3 className="conf-title">¿Eliminar este producto?</h3>
            <p className="conf-sub">Vas a eliminar <strong>{confirmDel.name}</strong> ({confirmDel.sku}) del catálogo. Esta acción no se puede deshacer.</p>
            <div className="conf-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn btn-danger-solid" onClick={() => { onDelete(confirmDel.sku); setConfirmDel(null); }}>{I.trash({ size: 14 })} Eliminar producto</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .screen{flex:1;min-width:0;padding:38px 56px 56px 64px;display:flex;flex-direction:column;gap:22px;overflow-y:auto;overflow-x:hidden;height:100vh;max-height:100vh;width:100%;scrollbar-gutter:stable}
        .cat-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap}
        .cat-title{font-family:'Fraunces',serif;font-weight:400;font-size:46px;line-height:1;letter-spacing:-.02em;color:var(--ink);margin:0}
        .cat-sub{margin:12px 0 0;color:var(--muted);font-size:14px;line-height:1.55}
        .screen-head-r{display:flex;gap:8px;flex-wrap:wrap}
        .btn{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:550;transition:all .15s;border:1px solid transparent;white-space:nowrap;cursor:pointer;font-family:inherit}
        .btn-primary{background:var(--accent);color:#fff;box-shadow:0 1px 2px rgba(167,77,74,.3),0 4px 14px -4px rgba(167,77,74,.4)}
        .btn-primary:hover{background:var(--accent-2);transform:translateY(-1px)}
        .btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}
        .btn-ghost:hover{border-color:#cdc4b3}
        .btn-special{background:#fff;border:1px solid var(--accent);color:var(--accent)}
        .btn-special:hover{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-2);transform:translateY(-1px)}
        .btn-danger-solid{background:var(--accent);color:#fff;border:1px solid var(--accent);box-shadow:0 1px 2px rgba(167,77,74,.3),0 4px 14px -4px rgba(167,77,74,.4)}
        .btn-danger-solid:hover{background:var(--accent-2)}
        .toolbar{display:flex;gap:8px;flex-wrap:wrap}
        .search{flex:1;display:flex;align-items:center;gap:10px;padding:0 14px;height:42px;background:#fff;border:1px solid var(--line);border-radius:11px;color:var(--muted);min-width:200px}
        .search input{flex:1;border:none;background:none;outline:none;font-size:13.5px;color:var(--ink)}
        .filterrow{display:flex;flex-wrap:wrap;gap:6px}
        .chip{padding:7px 14px;border-radius:99px;font-size:12.5px;font-weight:500;color:var(--ink-2);background:transparent;border:1px solid var(--line);transition:all .12s}
        .chip:hover{background:#fff;color:var(--ink)}
        .chip.on{background:var(--ink);color:var(--paper);border-color:var(--ink)}

        .ptable{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;flex-shrink:0}
        .prow-load{display:flex;align-items:center;justify-content:center;gap:10px;padding:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px;background:#FAFAF7}
        .prow-load-spin{width:14px;height:14px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--accent);animation:plspin .8s linear infinite}
        @keyframes plspin{to{transform:rotate(360deg)}}
        .prow-end{padding:14px;text-align:center;border-top:1px solid var(--line);color:var(--muted);font-size:11.5px;background:#FAFAF7;letter-spacing:.02em}
        .prow{display:grid;grid-template-columns:72px 1.8fr 1fr 1fr 1.1fr 80px;gap:14px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line);transition:background .12s}
        .prow:last-child{border-bottom:none}
        .prow:not(.phead):hover{background:#FAFAF7}
        .phead{background:#FAFAF7;padding:10px 16px;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600;border-bottom:1px solid var(--line)}
        .pc-tags{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
        .row-tag{font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2);font-weight:600;background:var(--bg);border:1px solid var(--line);padding:3px 7px;border-radius:99px;white-space:nowrap}
        .row-tag.more{background:transparent;color:var(--muted)}
        @media (max-width: 1100px){
          .prow{grid-template-columns:60px 1.6fr 1fr 1fr 1fr 80px}
        }
        .pc-thumb{width:52px;height:52px;border-radius:10px;background:#fff;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;overflow:hidden;padding:6px}
        .pc-thumb img{width:100%;height:100%;object-fit:contain;object-position:center}
        .prow-clickable{cursor:pointer}
        .pc-title{font-size:14px;font-weight:600;color:var(--ink);font-family:'Fraunces',serif}
        .pc-brand{font-size:11.5px;color:var(--muted);margin-top:2px}
        .mono{font-variant-numeric:tabular-nums;font-size:12.5px;color:var(--ink-2);letter-spacing:.3px}
        .cat-tag{display:inline-block;padding:3px 9px;background:var(--bg);border:1px solid var(--line);border-radius:99px;font-size:11px;color:var(--ink-2);font-weight:500}
        .pc-act{display:flex;gap:4px;justify-content:flex-end}
        .iconbtn-l{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;color:var(--muted);transition:all .15s;background:transparent}
        .iconbtn-l:hover{background:var(--bg);color:var(--ink)}
        .iconbtn-l.danger:hover{background:rgba(167,77,74,.08);color:var(--accent)}

        .conf-bg{position:fixed;inset:0;background:rgba(20,16,12,.45);backdrop-filter:blur(6px);z-index:400;display:grid;place-items:center;padding:30px;animation:fadeIn .2s}
        .conf{background:#FAFAF7;border-radius:16px;padding:32px;width:440px;max-width:100%;box-shadow:0 30px 80px -20px rgba(0,0,0,.4);text-align:center;animation:popIn .25s cubic-bezier(.2,.8,.2,1)}
        .conf-icon{width:56px;height:56px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;margin:0 auto 18px}
        .conf-title{font-family:'Fraunces',serif;font-weight:400;font-size:22px;margin:0 0 10px;color:var(--ink)}
        .conf-sub{font-size:13.5px;line-height:1.55;color:var(--muted);margin:0 0 24px}
        .conf-sub strong{color:var(--ink);font-weight:600}
        .conf-actions{display:flex;gap:8px;justify-content:center}
      `}</style>
    </section>
  );
}
