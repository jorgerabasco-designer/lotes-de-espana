import React, { useState } from 'react';
import { I } from './icons.jsx';
import { useTaxonomy } from '../lib/taxonomy.jsx';

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
  query, setQuery, sort, setSort,
  cat, tags, selBrands = [],
  onCreate, onCreateProduct, onClearSel, onImport,
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const [cols, setCols] = useState(() => Number(localStorage.getItem('catalog-cols')) || 4);
  const setColsP = (n) => { setCols(n); localStorage.setItem('catalog-cols', String(n)); };

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
    if (sort === 'used') return (b.used || 0) - (a.used || 0);
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
          <button className="btn btn-ghost" onClick={onImport}>{I.excel({ size: 16 })} Importar Excel</button>
          <button className="btn btn-primary" onClick={onCreateProduct}>{I.upload({ size: 16 })} Subir producto</button>
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
        <div className="density">
          {[4, 6, 8].map(n => (
            <button key={n} className={`dens ${cols === n ? 'on' : ''}`} onClick={() => setColsP(n)} title={`${n} columnas`}>
              <DensityIcon n={n}/>
            </button>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="selbar">
          <div className="selbar-l">
            <span className="selbar-num">{selected.length}</span>
            <span>productos seleccionados</span>
          </div>
          <div className="selbar-r">
            <button className="link" onClick={onClearSel}>Limpiar</button>
            <button className="btn btn-create" onClick={onCreate}>{I.sparkle({ size: 14 })} Crear bodegón</button>
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: `repeat(${cols},1fr)` }}>
        {sorted.map(p => (
          <ProductCard key={p.sku} p={p} sel={selected.includes(p.sku)} selIdx={selected.indexOf(p.sku) + 1} onToggle={() => onToggle(p.sku)} dense={cols >= 6} />
        ))}
        <UploadCard onClick={onCreateProduct} />
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
      `}</style>
    </section>
  );
}

function ProductCard({ p, sel, selIdx = 0, onToggle }) {
  const { catLabels, tagLabels } = useTaxonomy();
  const catLabel = catLabels[p.cat] || p.cat;
  const noPhoto = !p.img;
  const handleClick = () => {
    if (noPhoto) {
      alert(`"${p.name}" no tiene foto. Edita el producto y sube una imagen para poder incluirlo en un bodegón.`);
      return;
    }
    onToggle();
  };
  return (
    <button
      type="button"
      className={`pcard ${sel ? 'sel' : ''} ${noPhoto ? 'nophoto' : ''}`}
      onClick={handleClick}
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
          <div className="pcard-badge" aria-hidden>
            <span className="pcard-badge-num">{selIdx > 0 ? selIdx : ''}</span>
            <span className="pcard-badge-check">{I.check({ size: 14 })}</span>
          </div>
        )}
        {!noPhoto && (
          <div className="pcard-tap" aria-hidden>
            <span>{sel ? 'Quitar' : 'Añadir'}</span>
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
        {(p.tags || []).length > 0 && (
          <div className="ptag-row">
            {(p.tags || []).slice(0, 3).map(t => {
              const lbl = tagLabels[t] || t;
              return <span key={t} className="ptag">{lbl}</span>;
            })}
          </div>
        )}
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

        .pcard-badge{position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#fff;border:1.5px solid var(--line);color:var(--muted);transition:all .25s cubic-bezier(.2,.8,.2,1);transform:scale(.85);font-family:'Fraunces',serif;font-weight:600;font-size:13px;font-variant-numeric:tabular-nums;overflow:hidden}
        .pcard:hover .pcard-badge{border-color:var(--ink-2);transform:scale(1)}
        .pcard.sel .pcard-badge{background:var(--accent);border-color:var(--accent);color:#fff;transform:scale(1);box-shadow:0 4px 12px rgba(167,77,74,.35)}
        .pcard-badge-num{display:none}
        .pcard.sel .pcard-badge-num{display:inline}
        .pcard-badge-check{display:grid;place-items:center;color:inherit}
        .pcard.sel .pcard-badge-check{display:none}

        .pcard-tap{position:absolute;left:50%;bottom:14px;transform:translate(-50%,8px);background:var(--ink);color:var(--paper);font-size:11px;font-weight:600;letter-spacing:.04em;padding:6px 14px;border-radius:99px;opacity:0;transition:all .2s;pointer-events:none;white-space:nowrap;box-shadow:0 6px 16px rgba(0,0,0,.18)}
        .pcard:hover .pcard-tap{opacity:1;transform:translate(-50%,0)}
        .pcard.sel .pcard-tap{background:var(--accent)}
        .pcard.sel:hover .pcard-tap{opacity:1}
        .pname{font-size:14.5px;font-weight:600;color:var(--ink);line-height:1.3;letter-spacing:-.005em;font-family:'Fraunces',serif}
        .pmeta{font-size:11.5px;color:var(--muted);margin-top:5px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-variant-numeric:tabular-nums}
        .pmeta-l{display:flex;align-items:center;gap:6px;min-width:0}
        .ptag-row{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
        .ptag{font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2);font-weight:600;background:var(--bg);border:1px solid var(--line);padding:3px 7px;border-radius:99px}
        .pcard.sel .ptag{background:#fff;border-color:var(--accent-soft);color:var(--accent)}
        .psku{letter-spacing:.4px;font-weight:500}
        .psep{color:var(--line)}
        .pdim{color:var(--ink-2);font-weight:500}
      `}</style>
    </button>
  );
}

function UploadCard({ onClick }) {
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
      alert('El archivo tiene que ser una imagen.');
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
      <div className="upcard-text">Subir producto</div>
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
