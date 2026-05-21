import React, { useState } from 'react';
import { I } from './icons.jsx';
import { useTaxonomy } from '../lib/taxonomy.jsx';
import ConfirmModal from './ConfirmModal.jsx';

const DensityIcon = ({ n }) => {
  const sz = n <= 4 ? 3.5 : n <= 6 ? 2.2 : 1.5;
  const gap = n <= 4 ? 1.4 : n <= 6 ? 1 : 0.7;
  const total = n * sz + (n - 1) * gap;
  const off = (16 - total) / 2;
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={off + i * (sz + gap)} y="3.5" width={sz} height="7" rx="1" fill="currentColor"/>
      ))}
    </svg>
  );
};

export default function Catalog({
  products, selected, onToggle,
  qtys = {}, onAddUnit, onRemoveUnit,
  query, setQuery, sort, setSort,
  cat, setCat, tags, setTags,
  selBrands = [], setSelBrands,
  cats = [], allTags = [], brands = [],
  onCreate, onCreateProduct, onClearSel, onImport,
  onSpecialOrder, onEditProduct,
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const [cols, setCols] = useState(() => Number(localStorage.getItem('catalog-cols')) || 4);
  const setColsP = (n) => { setCols(n); localStorage.setItem('catalog-cols', String(n)); };
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Producto seleccionado al que le falta la foto (se muestra un modal con
  // la opción de editar para que el usuario suba la imagen).
  const [noPhotoProduct, setNoPhotoProduct] = useState(null);
  // Aviso de drag-drop con un fichero que no es una imagen.
  const [dropError, setDropError] = useState(null);

  const activeFilters = (cat !== 'all' ? 1 : 0) + tags.length + selBrands.length;
  const totalUnits = selected.reduce((sum, sku) => sum + (qtys[sku] || 1), 0);
  const toggleTag = (id) => setTags(tags.includes(id) ? tags.filter(x => x !== id) : [...tags, id]);
  const toggleBrand = (b) => setSelBrands(selBrands.includes(b) ? selBrands.filter(x => x !== b) : [...selBrands, b]);

  const SORT_LABELS = { used: 'Más usados', recent: 'Más recientes', az: 'A → Z', za: 'Z → A' };

  const filtered = products.filter(p => {
    if (cat !== 'all' && p.cat !== cat) return false;
    if (selBrands.length > 0 && !selBrands.includes(p.brand)) return false;
    if (tags.length && !tags.every(id => (p.tags || []).includes(id))) return false;
    if (query && !(p.name + p.brand + p.sku).toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'az') return a.name.localeCompare(b.name, 'es');
    if (sort === 'za') return b.name.localeCompare(a.name, 'es');
    if (sort === 'used') {
      // Si hay empate por nº de usos, desempata por nombre para que sea estable.
      const diff = (b.used || 0) - (a.used || 0);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, 'es');
    }
    if (sort === 'recent') {
      const da = new Date(a.updated_at || a.created_at || 0).getTime();
      const db = new Date(b.updated_at || b.created_at || 0).getTime();
      return db - da;
    }
    return 0;
  });

  return (
    <section className="catalog">
      <header className="cat-head">
        <div className="cat-head-l">
          <h1 className="cat-title">Catálogo</h1>
          <p className="cat-sub">Selecciona productos gourmet y genera composiciones IA premium.</p>
        </div>
        <div className="cat-head-r">
          {onSpecialOrder && (
            <button
              className="btn btn-ghost btn-special"
              onClick={onSpecialOrder}
              title="Sube un PDF o Excel del cliente y detectamos los productos"
            >
              {I.upload({ size: 15 })} Pedidos especiales
            </button>
          )}
          <button className="btn btn-primary" onClick={onCreateProduct}>{I.plus({ size: 16 })} Nuevo producto</button>
        </div>
      </header>

      <div className="toolbar">
        <div className="search">
          {I.search({ size: 16 })}
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre, marca o referencia..." />
        </div>
        <div className="sort-wrap">
          <button className="tool" onClick={() => setSortOpen(v => !v)}>
            {I.sort({ size: 15 })}
            {SORT_LABELS[sort] || 'Ordenar'}
            {I.chevronDown({ size: 14 })}
          </button>
          {sortOpen && (
            <>
              <div className="sort-back" onClick={() => setSortOpen(false)}/>
              <div className="sort-menu">
                {Object.entries(SORT_LABELS).map(([k, label]) => (
                  <button key={k} className={`sort-opt ${sort === k ? 'on' : ''}`} onClick={() => { setSort(k); setSortOpen(false); }}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button className="tool mobile-only" onClick={() => setFiltersOpen(true)}>
          {I.filter({ size: 15 })}
          Filtros
          {activeFilters > 0 && <span className="filter-badge">{activeFilters}</span>}
        </button>
        <div className="density">
          {[4, 6, 8].map(n => (
            <button key={n} className={`dens ${cols === n ? 'on' : ''}`} onClick={() => setColsP(n)} title={`${n} columnas`}>
              <DensityIcon n={n}/>
            </button>
          ))}
        </div>
      </div>

      {filtersOpen && (
        <div className="mob-filters-bg" onClick={() => setFiltersOpen(false)}>
          <div className="mob-filters" onClick={e => e.stopPropagation()}>
            <header className="mob-filters-h">
              <h3>Filtros</h3>
              <button className="mob-filters-x" onClick={() => setFiltersOpen(false)}>{I.close({ size: 18 })}</button>
            </header>
            <div className="mob-filters-body">
              <div className="filter-label">Categorías</div>
              <div className="pill-row">
                <button className={`spill ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>Todos</button>
                {cats.map(c => (
                  <button key={c.id} className={`spill ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>
                ))}
              </div>

              {allTags.length > 0 && (
                <>
                  <div className="filter-label">Etiquetas</div>
                  <div className="pill-row">
                    {allTags.map(t => (
                      <button key={t.id} className={`spill stag ${tags.includes(t.id) ? 'on' : ''}`} onClick={() => toggleTag(t.id)}>{t.label}</button>
                    ))}
                  </div>
                </>
              )}

              {brands.length > 0 && (
                <>
                  <div className="filter-label">Marcas</div>
                  <div className="pill-row">
                    {brands.map(b => (
                      <button key={b} className={`spill sbrand ${selBrands.includes(b) ? 'on' : ''}`} onClick={() => toggleBrand(b)}>{b}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <footer className="mob-filters-foot">
              <button
                className="btn btn-ghost"
                onClick={() => { setCat('all'); setTags([]); setSelBrands([]); }}
                disabled={activeFilters === 0}
              >Limpiar</button>
              <button className="btn btn-primary" onClick={() => setFiltersOpen(false)}>Aplicar</button>
            </footer>
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="selbar">
          <div className="selbar-l">
            <span className="selbar-num">{selected.length}</span>
            <span>
              {selected.length === 1 ? 'producto seleccionado' : 'productos seleccionados'}
              {totalUnits > selected.length && ` · ${totalUnits} unidades`}
            </span>
          </div>
          <div className="selbar-r">
            <button className="link" onClick={onClearSel}>Limpiar</button>
            <button className="btn btn-create" onClick={onCreate}>{I.sparkle({ size: 14 })} Crear bodegón</button>
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: `repeat(${cols},1fr)` }}>
        {sorted.map(p => (
          <ProductCard
            key={p.sku}
            p={p}
            sel={selected.includes(p.sku)}
            qty={qtys[p.sku] || 0}
            onToggle={() => onToggle(p.sku)}
            onAdd={() => onAddUnit(p.sku)}
            onRemove={() => onRemoveUnit(p.sku)}
            onNoPhoto={() => setNoPhotoProduct(p)}
          />
        ))}
        <UploadCard onClick={onCreateProduct} onInvalidDrop={() => setDropError('El archivo que has arrastrado no es una imagen. Suelta un PNG, JPG, WEBP, etc.')} />
      </div>

      <style>{`
        .catalog{flex:1;min-width:0;padding:38px 40px 40px;display:flex;flex-direction:column;gap:24px;overflow-y:auto;height:100vh;}
        .cat-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap}
        .cat-title{font-family:'Fraunces',serif;font-weight:400;font-size:46px;line-height:1;letter-spacing:-.02em;color:var(--ink);margin:0}
        .cat-sub{margin:12px 0 0;color:var(--muted);font-size:14px;max-width:520px;line-height:1.55;font-weight:400}
        .cat-head-r{display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap}

        .btn{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:550;letter-spacing:-.005em;transition:all .15s;border:1px solid transparent;white-space:nowrap}
        .btn-ghost{background:#fff;border-color:var(--line);color:var(--ink)}
        .btn-ghost:hover{border-color:#cdc4b3;transform:translateY(-1px);box-shadow:var(--shadow)}
        .btn-primary{background:var(--accent);color:#fff;box-shadow:0 1px 2px rgba(167,77,74,.3),0 4px 14px -4px rgba(167,77,74,.4)}
        .btn-primary:hover{background:var(--accent-2);transform:translateY(-1px);box-shadow:0 2px 4px rgba(167,77,74,.4),0 12px 24px -8px rgba(167,77,74,.5)}
        .btn-special{background:#fff;border-color:var(--accent);color:var(--accent)}
        .btn-special:hover{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-2);transform:translateY(-1px)}

        .toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .search{flex:1;display:flex;align-items:center;gap:10px;padding:0 14px;height:42px;background:#fff;border:1px solid var(--line);border-radius:11px;color:var(--muted);transition:all .15s;min-width:200px}
        .search:focus-within{border-color:var(--ink);box-shadow:0 0 0 3px rgba(45,42,38,.05)}
        .search input{flex:1;border:none;background:none;outline:none;font-size:13.5px;color:var(--ink)}
        .search input::placeholder{color:var(--muted)}
        .tool{display:inline-flex;align-items:center;gap:6px;padding:0 12px;height:42px;background:#fff;border:1px solid var(--line);border-radius:11px;font-size:13px;color:var(--ink);font-weight:500;transition:all .15s}
        .tool:hover{border-color:#cdc4b3;transform:translateY(-1px)}
        .sort-wrap{position:relative}
        .sort-back{position:fixed;inset:0;z-index:20}
        .sort-menu{position:absolute;top:calc(100% + 6px);right:0;background:#fff;border:1px solid var(--line);border-radius:11px;padding:5px;min-width:180px;box-shadow:0 10px 30px -8px rgba(45,42,38,.18),0 2px 6px rgba(45,42,38,.06);z-index:21;display:flex;flex-direction:column;gap:1px;animation:sortIn .12s ease}
        .sort-opt{text-align:left;padding:9px 12px;border-radius:7px;font-size:13px;color:var(--ink-2);font-weight:500;transition:background .12s}
        .sort-opt:hover{background:var(--bg);color:var(--ink)}
        .sort-opt.on{background:var(--ink);color:#FAFAF7}

        .density{display:inline-flex;background:#fff;border:1px solid var(--line);border-radius:11px;padding:3px;gap:1px;height:42px;align-items:center}
        .dens{width:36px;height:34px;border-radius:8px;display:grid;place-items:center;color:var(--muted);transition:all .12s}
        .dens:hover{color:var(--ink);background:var(--bg)}
        .dens.on{background:var(--ink);color:#FAFAF7}
        .dens.on:hover{background:var(--ink)}

        .selbar{display:flex;justify-content:space-between;align-items:center;padding:12px 14px 12px 18px;background:linear-gradient(180deg,#2F4A3D,#243a30);color:#EAE3D6;border-radius:12px;box-shadow:0 8px 24px -10px rgba(47,74,61,.5);animation:slideIn .25s cubic-bezier(.2,.8,.2,1);flex-wrap:wrap;gap:8px}
        .selbar-l{display:flex;align-items:center;gap:10px;font-size:13.5px;font-weight:500}
        .selbar-num{background:#FAFAF7;color:var(--olive);font-weight:700;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:12.5px;font-family:'Fraunces',serif}
        .selbar-r{display:flex;align-items:center;gap:10px}
        .link{color:rgba(234,227,214,.7);font-size:12.5px;font-weight:500;padding:6px 8px;border-radius:6px}
        .link:hover{color:#fff;background:rgba(255,255,255,.08)}
        .btn-create{background:#FAFAF7;color:var(--olive);border:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px;transition:all .15s}
        .btn-create:hover{background:#fff;transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.15)}

        .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding-bottom:20px}

        /* Botón "Filtros" — solo visible en móvil */
        .mobile-only{display:none}
        .filter-badge{display:inline-grid;place-items:center;min-width:16px;height:16px;padding:0 4px;font-size:10px;font-weight:700;background:var(--accent);color:#fff;border-radius:99px;margin-left:2px}

        /* Panel de filtros (bottom-sheet en móvil) */
        .mob-filters-bg{position:fixed;inset:0;background:rgba(20,16,12,.45);backdrop-filter:blur(6px);z-index:400;display:flex;align-items:flex-end;justify-content:center;animation:fadeIn .15s ease}
        .mob-filters{background:#FAFAF7;width:100%;max-width:560px;max-height:85vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;animation:slideIn .25s cubic-bezier(.2,.8,.2,1)}
        .mob-filters-h{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid var(--line)}
        .mob-filters-h h3{margin:0;font-family:'Fraunces',serif;font-weight:500;font-size:20px;color:var(--ink)}
        .mob-filters-x{width:32px;height:32px;border-radius:8px;color:var(--muted);display:grid;place-items:center;background:transparent;border:none;cursor:pointer}
        .mob-filters-x:hover{background:var(--bg);color:var(--ink)}
        .mob-filters-body{padding:18px 20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px}
        .mob-filters-body .filter-label{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-top:14px;padding:0 2px}
        .mob-filters-body .filter-label:first-child{margin-top:0}
        .mob-filters-body .pill-row{display:flex;flex-wrap:wrap;gap:6px;padding:0 2px}
        .mob-filters-body .spill{padding:6px 12px;border-radius:99px;font-size:12.5px;color:var(--ink-2);background:transparent;border:1px solid var(--line);font-weight:500;transition:all .12s;cursor:pointer;font-family:inherit}
        .mob-filters-body .spill:hover{background:#fff;color:var(--ink);border-color:#cdc4b3}
        .mob-filters-body .spill.on{background:var(--ink);color:#FAFAF7;border-color:var(--ink)}
        .mob-filters-body .stag.on, .mob-filters-body .sbrand.on{background:var(--accent);color:#fff;border-color:var(--accent)}
        .mob-filters-foot{display:flex;gap:8px;padding:16px 20px;border-top:1px solid var(--line);background:#fff}
        .mob-filters-foot .btn{flex:1;justify-content:center;padding:12px 16px}
        .mob-filters-foot .btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}
        .mob-filters-foot .btn-primary{background:var(--accent);color:#fff;border:1px solid var(--accent)}
        .mob-filters-foot .btn:disabled{opacity:.5}

        @media (max-width: 900px){
          .mobile-only{display:inline-flex !important;align-items:center !important;gap:5px !important;height:42px !important;padding:0 14px !important}
        }
      `}</style>

      <ConfirmModal
        open={!!noPhotoProduct}
        icon="upload"
        tone="info"
        title="Este producto no tiene foto"
        description={noPhotoProduct ? (
          <><strong>{noPhotoProduct.name}</strong> ({noPhotoProduct.sku}) no tiene una imagen asociada y no se puede incluir en un bodegón hasta que la subas.</>
        ) : null}
        cancelLabel="Cancelar"
        confirmLabel={null}
        secondaryLabel="Editar producto"
        secondaryIcon="edit"
        onCancel={() => setNoPhotoProduct(null)}
        onSecondary={() => {
          const p = noPhotoProduct;
          setNoPhotoProduct(null);
          if (p && onEditProduct) onEditProduct(p);
        }}
      />

      <ConfirmModal
        open={!!dropError}
        icon="upload"
        tone="info"
        title="Archivo no válido"
        description={dropError}
        cancelLabel={null}
        confirmLabel="Entendido"
        confirmTone="neutral"
        onCancel={() => setDropError(null)}
        onConfirm={() => setDropError(null)}
      />
    </section>
  );
}

function ProductCard({ p, sel, qty = 0, onToggle, onAdd, onRemove, onNoPhoto }) {
  const { catLabels, tagLabels } = useTaxonomy();
  const catLabel = catLabels[p.cat] || p.cat;
  const noPhoto = !p.img;
  const [bump, setBump] = React.useState(false);

  const doBump = () => {
    setBump(true);
    setTimeout(() => setBump(false), 320);
  };

  // Click en la card: selecciona / deselecciona el producto por completo.
  const handleClick = () => {
    if (noPhoto) {
      // Catalog muestra un modal con el aviso y la opción de editar el producto.
      onNoPhoto && onNoPhoto();
      return;
    }
    onToggle();
    if (!sel) doBump();
  };
  // Botón "+": suma una unidad. Botón "−": resta una (a 0 deselecciona).
  const handleAdd = (e) => {
    e.stopPropagation();
    onAdd();
    doBump();
  };
  const handleRemove = (e) => {
    e.stopPropagation();
    onRemove();
  };

  return (
    // Es un <div role="button"> y no un <button> porque contiene botones
    // anidados (el selector de unidades), y un <button> dentro de otro es
    // HTML inválido y rompe el manejo de clics.
    <div
      role="button"
      tabIndex={0}
      className={`pcard ${sel ? 'sel' : ''} ${noPhoto ? 'nophoto' : ''}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); }
      }}
      aria-pressed={sel}
      title={noPhoto ? 'Sin foto · no se puede usar en bodegones' : ''}
    >
      <div className="pcard-top">
        <span className="pcat">{catLabel}</span>
        {noPhoto && <span className="pwarn">Sin foto</span>}
      </div>
      <div className="pcard-img">
        {p.img ? <img src={p.img} alt={p.name} draggable={false}/> : <div className="pcard-noimg">{I.upload({ size: 22 })}<div>Falta foto</div></div>}
        <div className="pcard-veil" aria-hidden></div>
        {!noPhoto && (
          <div className={`pcard-badge ${qty >= 2 ? 'multi' : ''} ${bump ? 'bump' : ''}`} aria-hidden>
            {qty >= 2
              ? <span className="pcard-badge-qty">×{qty}</span>
              : <span className="pcard-badge-check">{I.check({ size: 14 })}</span>}
          </div>
        )}
        {/* Hint al pasar el ratón — solo cuando el producto NO está seleccionado */}
        {!noPhoto && !sel && (
          <div className="pcard-tap" aria-hidden>
            <span>Añadir</span>
          </div>
        )}
        {/* Selector de unidades — solo visible cuando el producto está seleccionado */}
        {!noPhoto && sel && (
          <div
            className="pcard-stepper"
            onClick={(e) => e.stopPropagation()}
            title="Ajusta las unidades de este producto"
          >
            <button
              type="button"
              className="pcard-step"
              onClick={handleRemove}
              aria-label="Quitar una unidad"
            >−</button>
            <span className="pcard-step-count">{qty} {qty === 1 ? 'unidad' : 'unidades'}</span>
            <button
              type="button"
              className="pcard-step"
              onClick={handleAdd}
              aria-label="Añadir una unidad"
            >+</button>
          </div>
        )}
      </div>
      <div className="pcard-body">
        <div className="pname">{p.name}</div>
        <div className="pmeta">
          <div className="pmeta-l">
            <span className="psku">{p.sku}</span>
          </div>
        </div>
        {(() => {
          // Renderizamos siempre el contenedor (aunque esté vacío) para reservar
          // su altura y mantener todas las cards alineadas en el grid.
          const validTags = (p.tags || []).filter(t => tagLabels[t]);
          return (
            <div className="ptag-row" aria-hidden={validTags.length === 0 ? 'true' : undefined}>
              {validTags.slice(0, 3).map(t => (
                <span key={t} className="ptag">{tagLabels[t]}</span>
              ))}
            </div>
          );
        })()}
      </div>
      <style>{`
        .pcard{position:relative;background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px;cursor:pointer;transition:all .2s cubic-bezier(.2,.8,.2,1);overflow:hidden;text-align:left;width:100%;display:block;-webkit-tap-highlight-color:transparent}
        .pcard:hover{transform:translateY(-2px);box-shadow:0 12px 32px -16px rgba(45,42,38,.18);border-color:#cdc4b3}
        .pcard.sel{border-color:var(--accent);background:var(--accent-soft);box-shadow:0 0 0 1.5px var(--accent),0 14px 36px -14px rgba(167,77,74,.32)}
        .pcard:active{transform:translateY(0) scale(.99)}
        .pcard-top{display:flex;align-items:center;gap:6px;margin-bottom:10px;height:22px;}
        .pcat{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600;transition:color .2s}
        .pcard.sel .pcat{color:var(--accent)}

        .pcard-img{aspect-ratio:1/1;border-radius:12px;background:#fff;margin-bottom:14px;position:relative;overflow:hidden;padding:14px;transition:background .25s ease;}
        .pcard.sel .pcard-img{background:#fff}
        .pcard-img img{position:absolute;inset:14px;width:calc(100% - 28px);height:calc(100% - 28px);object-fit:contain;transition:transform .4s cubic-bezier(.2,.8,.2,1)}
        .pcard:hover .pcard-img img{transform:scale(1.04)}
        .pcard.sel .pcard-img img{transform:scale(1.06)}
        .pcard-noimg{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--muted);font-size:11px;letter-spacing:.1em;text-transform:uppercase}
        .pcard.nophoto{opacity:.78}
        .pcard.nophoto:hover{opacity:.95}
        .pcard.nophoto .pcard-img{background:repeating-linear-gradient(45deg,var(--bg) 0 9px,#fff 9px 18px)}
        .pwarn{margin-left:auto;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:700;background:var(--accent-soft);border:1px solid var(--accent);padding:2px 7px;border-radius:99px}

        .pcard-veil{position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(167,77,74,.08) 100%);opacity:0;transition:opacity .25s;pointer-events:none}
        .pcard.sel .pcard-veil{opacity:1}

        .pcard-badge{position:absolute;top:10px;right:10px;min-width:28px;height:28px;padding:0 6px;border-radius:99px;display:grid;place-items:center;background:#fff;border:1.5px solid var(--line);color:var(--muted);transition:all .25s cubic-bezier(.2,.8,.2,1);transform:scale(.85);font-family:'Fraunces',serif;font-weight:600;font-size:13px;font-variant-numeric:tabular-nums;overflow:hidden}
        .pcard:hover .pcard-badge{border-color:var(--ink-2);transform:scale(1)}
        .pcard.sel .pcard-badge{background:var(--accent);border-color:var(--accent);color:#fff;transform:scale(1);box-shadow:0 4px 12px rgba(167,77,74,.35)}
        .pcard-badge-check{display:grid;place-items:center;color:inherit}
        .pcard-badge.multi{background:var(--accent);border-color:var(--accent);color:#fff;font-size:13px;letter-spacing:.2px}
        .pcard-badge.bump{animation:badgeBump .32s cubic-bezier(.2,1.6,.4,1)}
        @keyframes badgeBump{0%{transform:scale(1)}40%{transform:scale(1.32)}100%{transform:scale(1)}}
        .pcard-badge-qty{display:inline-block}

        /* Selector de unidades — pill centrada abajo, visible cuando la card está seleccionada */
        .pcard-stepper{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;align-items:center;gap:1px;background:#fff;border:1.5px solid var(--accent);border-radius:99px;padding:3px;box-shadow:0 4px 14px -4px rgba(167,77,74,.45);z-index:3}
        .pcard-step{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:17px;font-weight:600;line-height:1;color:var(--accent);background:transparent;transition:all .12s;padding:0}
        .pcard-step:hover{background:var(--accent);color:#fff}
        .pcard-step:active{transform:scale(.92)}
        .pcard-step-count{font-size:11px;font-weight:600;color:var(--ink);min-width:60px;text-align:center;font-variant-numeric:tabular-nums;letter-spacing:.01em}

        .pcard-tap{position:absolute;left:50%;bottom:14px;transform:translate(-50%,8px);background:var(--ink);color:var(--paper);font-size:11px;font-weight:600;letter-spacing:.04em;padding:6px 14px;border-radius:99px;opacity:0;transition:all .2s;pointer-events:none;white-space:nowrap;box-shadow:0 6px 16px rgba(0,0,0,.18)}
        .pcard:hover .pcard-tap{opacity:1;transform:translate(-50%,0)}
        .pname{font-size:14.5px;font-weight:600;color:var(--ink);line-height:1.3;letter-spacing:-.005em;font-family:'Fraunces',serif}
        .pmeta{font-size:11.5px;color:var(--muted);margin-top:5px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-variant-numeric:tabular-nums}
        .pmeta-l{display:flex;align-items:center;gap:6px;min-width:0}
        .ptag-row{display:flex;align-items:flex-start;flex-wrap:wrap;gap:4px;margin-top:8px;min-height:22px}
        .ptag{font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2);font-weight:600;background:var(--bg);border:1px solid var(--line);padding:3px 7px;border-radius:99px}
        .pcard.sel .ptag{background:#fff;border-color:var(--accent-soft);color:var(--accent)}
        .psku{letter-spacing:.4px;font-weight:500}
        .psep{color:var(--line)}
        .pdim{color:var(--ink-2);font-weight:500}
      `}</style>
    </div>
  );
}

function UploadCard({ onClick, onInvalidDrop }) {
  const [dragOver, setDragOver] = React.useState(false);
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onClick(file);
    } else if (file) {
      onInvalidDrop && onInvalidDrop();
    }
  };
  return (
    <button
      className={`upcard ${dragOver ? 'over' : ''}`}
      onClick={() => onClick()}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="upcard-icon">{I.plus({ size: 24 })}</div>
      <div className="upcard-text">Nuevo producto</div>
      <div className="upcard-sub">Arrastra una imagen o haz clic</div>
      <style>{`
        .upcard{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:1.5px dashed var(--line);border-radius:18px;background:transparent;color:var(--muted);min-height:340px;padding:14px;transition:all .15s}
        .upcard:hover{border-color:var(--accent);color:var(--accent);background:rgba(167,77,74,.02)}
        .upcard.over{border-color:var(--accent);background:var(--accent-soft);border-style:solid;color:var(--accent)}
        .upcard-icon{width:46px;height:46px;border-radius:50%;background:#fff;border:1px solid var(--line);display:grid;place-items:center;margin-bottom:6px}
        .upcard-text{font-size:13.5px;font-weight:600;color:var(--ink)}
        .upcard-sub{font-size:11.5px}
      `}</style>
    </button>
  );
}
