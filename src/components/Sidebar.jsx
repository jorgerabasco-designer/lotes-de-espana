import React from 'react';
import { I } from './icons.jsx';

export default function Sidebar({
  active, onNav,
  cat, setCat,
  tags, setTags,
  brands = [],
  selBrands = [], setSelBrands,
  cats = [],
  allTags = [],
  logoSrc = '/logo.png',
}) {
  const items = [
    { id: 'catalog',  label: 'Catálogo',      icon: 'catalog' },
    { id: 'products', label: 'Productos',     icon: 'product' },
    { id: 'history',  label: 'Historial',     icon: 'history' },
    { id: 'settings', label: 'Configuración', icon: 'settings' },
  ];

  const toggleTag = (id) => setTags(tags.includes(id) ? tags.filter(x => x !== id) : [...tags, id]);
  const toggleBrand = (b) => setSelBrands(selBrands.includes(b) ? selBrands.filter(x => x !== b) : [...selBrands, b]);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden>
          <img src={logoSrc} alt="Lotes de España" onError={(e)=>{e.currentTarget.style.display='none';}}/>
        </div>
        <div className="brand-text">
          <div className="brand-name">Lotes de España</div>
          <div className="brand-sub">Studio</div>
        </div>
      </div>

      <nav className="nav">
        {items.map(it => (
          <button key={it.id} className={`nav-item ${active === it.id ? 'on' : ''}`} onClick={() => onNav(it.id)}>
            <span className="nav-icon">{I[it.icon]({ size: 17 })}</span>
            <span className="nav-text">{it.label}</span>
          </button>
        ))}
      </nav>

      {active === 'catalog' ? (
        <div className="filters">
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
      ) : <div style={{ flex: 1 }}/>}

      <div className="sb-foot">
        <div className="user">
          <div className="avatar">L</div>
          <div className="user-meta">
            <div className="user-name">Lotes de España</div>
          </div>
        </div>
      </div>

      <style>{`
        .sidebar{
          width:248px;flex:0 0 248px;
          background:#FAFAF7;
          border-right:1px solid var(--line);
          display:flex;flex-direction:column;
          padding:24px 16px 18px;
          position:sticky;top:0;height:100vh;
        }
        .brand{display:flex;align-items:center;gap:11px;padding:4px 8px 24px;margin-bottom:8px;}
        .brand-mark{width:32px;height:32px;border-radius:8px;background:#fff;display:grid;place-items:center;border:1px solid var(--line);overflow:hidden;padding:3px}
        .brand-mark img{width:100%;height:100%;object-fit:contain}
        .brand-name{font-family:'Fraunces',serif;font-weight:500;font-size:15px;letter-spacing:.1px;color:var(--ink)}
        .brand-sub{font-size:11px;color:var(--muted);letter-spacing:.3px;margin-top:1px}

        .nav{display:flex;flex-direction:column;gap:1px;padding-bottom:8px}
        .nav-item{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:8px;font-size:13.5px;color:var(--ink-2);font-weight:500;transition:all .15s;text-align:left;width:100%}
        .nav-item:hover{background:rgba(45,42,38,.04);color:var(--ink)}
        .nav-item.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(45,42,38,.04);border:1px solid var(--line)}
        .nav-item.on .nav-icon{color:var(--accent)}
        .nav-icon{color:var(--muted);display:grid;place-items:center}

        .filters{margin-top:18px;padding-top:18px;border-top:1px solid var(--line);flex:1;display:flex;flex-direction:column;gap:8px;overflow-y:auto}
        .filter-label{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600;padding:0 4px;margin-top:24px}
        .filter-label:first-child{margin-top:0}
        .pill-row{display:flex;flex-wrap:wrap;gap:5px;padding:0 2px}
        .spill{padding:5px 11px;border-radius:99px;font-size:12px;color:var(--ink-2);background:transparent;border:1px solid var(--line);font-weight:500;transition:all .12s;letter-spacing:-.005em}
        .spill:hover{background:#fff;color:var(--ink);border-color:#cdc4b3}
        .spill.on{background:var(--ink);color:#FAFAF7;border-color:var(--ink)}
        .stag.on{background:var(--accent);color:#fff;border-color:var(--accent)}
        .sbrand.on{background:var(--accent);color:#fff;border-color:var(--accent)}

        .sb-foot{padding-top:14px;border-top:1px solid var(--line)}
        .user{display:flex;align-items:center;gap:10px;padding:4px 6px}
        .avatar{width:30px;height:30px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:600;font-size:13px;font-family:'Fraunces',serif}
        .user-meta{flex:1;min-width:0}
        .user-name{font-size:13px;font-weight:600;color:var(--ink);line-height:1.1}
      `}</style>
    </aside>
  );
}
