import React, { useMemo, useState } from 'react';
import { I } from './icons.jsx';
import DownloadModal from './DownloadModal.jsx';
import { clearAllBodegones } from '../lib/api.js';

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

function dayBucket(createdAt) {
  if (!createdAt) return 9999;
  const d = new Date(createdAt);
  const today = new Date();
  const ms = today - d;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function formatDate(createdAt) {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  const today = new Date();
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `Hoy · ${time}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Ayer · ${time}`;
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })} · ${time}`;
}

function bucketLabel(d) {
  return d === 0 ? 'Hoy' : d === 1 ? 'Ayer' : d <= 6 ? 'Esta semana' : d <= 30 ? 'Este mes' : 'Anteriores';
}

export default function HistoryScreen({ products, history, onRename, onDelete, onRefresh }) {
  const [range, setRange] = useState('all');
  const [q, setQ] = useState('');
  const [cols, setCols] = useState(() => Number(localStorage.getItem('hist-cols')) || 4);
  const setColsP = (n) => { setCols(n); localStorage.setItem('hist-cols', String(n)); };
  const [lightbox, setLightbox] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [dlBodegon, setDlBodegon] = useState(null);
  const [clearing, setClearing] = useState(false);

  const handleClearAll = async () => {
    if (!confirm('Esto eliminará TODOS los bodegones del historial (también sus imágenes). Esta acción no se puede deshacer. ¿Continuar?')) return;
    setClearing(true);
    try {
      const n = await clearAllBodegones();
      onRefresh && (await onRefresh());
      alert(`✓ ${n} bodegones eliminados.`);
    } catch (e) {
      alert('Error vaciando historial: ' + e.message);
    } finally {
      setClearing(false);
    }
  };

  const openDownload = (item) => { setDlBodegon(item); setDlOpen(true); };

  const items = useMemo(() => (history || []).map(it => ({
    ...it,
    day: dayBucket(it.created_at),
    date: formatDate(it.created_at),
  })), [history]);

  const ranges = [
    { id: 'all',       label: 'Todas',        count: items.length },
    { id: 'today',     label: 'Hoy',          count: items.filter(i => i.day === 0).length },
    { id: 'yesterday', label: 'Ayer',         count: items.filter(i => i.day === 1).length },
    { id: 'week',      label: 'Esta semana',  count: items.filter(i => i.day <= 6).length },
    { id: 'month',     label: 'Este mes',     count: items.filter(i => i.day <= 30).length },
  ];

  const filtered = items.filter(it => {
    if (range === 'today' && it.day !== 0) return false;
    if (range === 'yesterday' && it.day !== 1) return false;
    if (range === 'week' && it.day > 6) return false;
    if (range === 'month' && it.day > 30) return false;
    if (q && !((it.title || '') + (it.description || '')).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const groups = [];
  filtered.forEach(it => {
    const b = bucketLabel(it.day);
    let g = groups.find(x => x.label === b);
    if (!g) { g = { label: b, items: [] }; groups.push(g); }
    g.items.push(it);
  });

  const Composition = ({ skus, big = false }) => {
    const itemProducts = (skus || []).map(s => products.find(p => p.sku === s)).filter(Boolean);
    if (itemProducts.length === 0) return null;
    const sorted = [...itemProducts].sort((a, b) => b.h - a.h);
    const maxH = Math.max(...itemProducts.map(p => p.h), 1);
    return (
      <div className="hthumb-comp">
        {sorted.slice(0, 5).map((p, i) => (
          <img key={i} src={p.img} alt="" style={{
            height: `${(p.h / maxH) * (big ? 78 : 70) + 18}%`,
            transform: `translateX(${(i - (sorted.length - 1) / 2) * (big ? 12 : 14)}%)`,
            zIndex: 10 - i,
          }}/>
        ))}
      </div>
    );
  };

  return (
    <section className="screen wide hist-screen">
      <header className="cat-head">
        <div>
          <h1 className="cat-title">Historial</h1>
          <p className="cat-sub">{filtered.length} composiciones · todas guardadas en alta resolución</p>
        </div>
        {history && history.length > 0 && (
          <button className="btn btn-ghost danger" onClick={handleClearAll} disabled={clearing}>
            {I.trash({ size: 14 })} {clearing ? 'Vaciando…' : 'Vaciar historial'}
          </button>
        )}
      </header>

      <div className="toolbar">
        <div className="search">
          {I.search({ size: 16 })}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por título..." />
        </div>
        <div className="sort-wrap">
          <button className="tool" onClick={() => setRangeOpen(v => !v)}>
            {I.history({ size: 15 })}
            {ranges.find(r => r.id === range)?.label || 'Período'}
            {I.chevronDown({ size: 14 })}
          </button>
          {rangeOpen && (
            <>
              <div className="sort-back" onClick={() => setRangeOpen(false)}/>
              <div className="sort-menu">
                {ranges.map(r => (
                  <button key={r.id} className={`sort-opt ${range === r.id ? 'on' : ''}`} onClick={() => { setRange(r.id); setRangeOpen(false); }}>
                    {r.label} <span style={{ opacity: .55, marginLeft: 6, fontWeight: 500 }}>{r.count}</span>
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

      <div className="hist-main">
        {groups.length === 0 && (
          <div className="hist-empty">
            <div className="hist-empty-icon">{I.history({ size: 28 })}</div>
            <div className="hist-empty-t">Aún no hay bodegones</div>
            <div className="hist-empty-s">Selecciona productos en el catálogo y pulsa "Crear bodegón" para empezar.</div>
          </div>
        )}

        {groups.map(g => (
          <div key={g.label} className="hist-group">
            <div className="hist-group-h">
              <span className="hist-group-l">{g.label}</span>
              <span className="hist-group-c">{g.items.length} {g.items.length === 1 ? 'bodegón' : 'bodegones'}</span>
              <div className="hist-group-line"/>
            </div>

            <div className="hgrid" style={{ gridTemplateColumns: `repeat(${cols},1fr)` }}>
              {g.items.map(it => (
                <div key={it.id} className="hcard" onClick={() => setLightbox(it)}>
                  <div className="hthumb">
                    {it.image ? (
                      <img className="hthumb-img" src={it.image} alt={it.title} />
                    ) : (
                      <Composition skus={it.skus} big/>
                    )}
                    <div className="hthumb-overlay">
                      <div className="hov-btn"><span>{I.expand({ size: 14 })}</span><span className="hov-btn-l">Ver</span></div>
                    </div>
                    <div className="hthumb-count">{(it.skus || []).length} productos</div>
                  </div>
                  <div className="hbody">
                    {editingId === it.id ? (
                      <input
                        autoFocus
                        className="htitle-input"
                        defaultValue={it.title}
                        onClick={e => e.stopPropagation()}
                        onBlur={e => { onRename && onRename(it.id, e.target.value || it.title); setEditingId(null); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.target.blur();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                    ) : (
                      <div className="htitle" onClick={e => { e.stopPropagation(); setEditingId(it.id); }} title="Click para renombrar">
                        {it.title}
                        <span className="htitle-edit">{I.edit({ size: 11 })}</span>
                      </div>
                    )}
                    <div className="hmeta">{it.date}</div>
                    {cols < 8 && (it.skus || []).length > 0 && (
                      <div className="hsku-row">
                        {(it.skus || []).slice(0, 4).map(s => <span key={s} className="hsku">{s}</span>)}
                        {(it.skus || []).length > 4 && <span className="hsku more">+{it.skus.length - 4}</span>}
                      </div>
                    )}
                    <div className="hact" onClick={e => e.stopPropagation()}>
                      <button className="hbtn danger" title="Eliminar" onClick={()=>onDelete && onDelete(it.id)}>{I.trash({ size: 14 })}</button>
                      <button className="hbtn primary" onClick={(e)=>{ e.stopPropagation(); openDownload(it); }}>{I.download({ size: 13 })} {cols < 8 && 'Descargar'}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {lightbox && (
        <div className="lb-back" onClick={() => setLightbox(null)}>
          <div className="lb-modal" onClick={e => e.stopPropagation()}>
            <button className="lb-close" onClick={() => setLightbox(null)}>{I.close({ size: 18 })}</button>
            <div className="lb-stage">
              {lightbox.image
                ? <img className="lb-stage-img" src={lightbox.image} alt={lightbox.title}/>
                : <Composition skus={lightbox.skus} big/>}
            </div>
            <div className="lb-side">
              <div className="lb-eye">Bodegón generado</div>
              <div className="lb-title">{lightbox.title}</div>
              <div className="lb-date">{lightbox.date}</div>
              {lightbox.description && <div className="lb-desc">{lightbox.description}</div>}
              <div className="lb-section-h">Productos ({(lightbox.skus || []).length})</div>
              <div className="lb-prods">
                {(lightbox.skus || []).map(s => {
                  const p = products.find(x => x.sku === s);
                  if (!p) return (
                    <div key={s} className="lb-prod">
                      <div className="lb-prod-img"></div>
                      <div className="lb-prod-info"><div className="lb-prod-n">{s}</div><div className="lb-prod-m">Producto eliminado</div></div>
                    </div>
                  );
                  return (
                    <div key={s} className="lb-prod">
                      <div className="lb-prod-img"><img src={p.img} alt=""/></div>
                      <div className="lb-prod-info">
                        <div className="lb-prod-n">{p.name}</div>
                        <div className="lb-prod-m">{p.sku} · {p.h}×{p.w}×{p.d} cm</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="lb-actions">
                <button className="hbtn primary" onClick={()=>openDownload(lightbox)}>{I.download({ size: 13 })} Descargar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .screen{flex:1;min-width:0;padding:38px 56px 56px 64px;display:flex;flex-direction:column;gap:22px;overflow-y:auto;height:100vh;width:100%}
        .cat-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap}
        .cat-title{font-family:'Fraunces',serif;font-weight:400;font-size:46px;line-height:1;letter-spacing:-.02em;color:var(--ink);margin:0}
        .cat-sub{margin:12px 0 0;color:var(--muted);font-size:14px;line-height:1.55}

        .hist-screen .toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .hist-screen .search{flex:1;display:flex;align-items:center;gap:10px;padding:0 14px;height:42px;background:#fff;border:1px solid var(--line);border-radius:11px;color:var(--muted);min-width:200px}
        .hist-screen .search input{flex:1;border:none;background:none;outline:none;font-size:13.5px;color:var(--ink)}
        .hist-screen .tool{display:inline-flex;align-items:center;gap:6px;padding:0 12px;height:42px;background:#fff;border:1px solid var(--line);border-radius:11px;font-size:13px;color:var(--ink);font-weight:500;transition:all .15s}
        .hist-screen .tool:hover{border-color:#cdc4b3;transform:translateY(-1px)}
        .hist-screen .sort-wrap{position:relative}
        .hist-screen .sort-back{position:fixed;inset:0;z-index:20}
        .hist-screen .sort-menu{position:absolute;top:calc(100% + 6px);right:0;background:#fff;border:1px solid var(--line);border-radius:11px;padding:5px;min-width:180px;box-shadow:0 10px 30px -8px rgba(45,42,38,.18);z-index:21;display:flex;flex-direction:column;gap:1px}
        .hist-screen .sort-opt{text-align:left;padding:9px 12px;border-radius:7px;font-size:13px;color:var(--ink-2);font-weight:500}
        .hist-screen .sort-opt:hover{background:var(--bg);color:var(--ink)}
        .hist-screen .sort-opt.on{background:var(--ink);color:#FAFAF7}
        .hist-screen .density{display:inline-flex;background:#fff;border:1px solid var(--line);border-radius:11px;padding:3px;gap:1px;height:42px;align-items:center}
        .hist-screen .dens{width:36px;height:34px;border-radius:8px;display:grid;place-items:center;color:var(--muted)}
        .hist-screen .dens:hover{color:var(--ink);background:var(--bg)}
        .hist-screen .dens.on{background:var(--ink);color:#FAFAF7}

        .hist-main{display:flex;flex-direction:column;gap:36px;min-width:0;margin-top:8px}
        .hist-empty{padding:80px 30px;text-align:center;background:#fff;border:1px dashed var(--line);border-radius:16px}
        .hist-empty-icon{width:54px;height:54px;border-radius:50%;background:var(--bg);color:var(--muted);display:grid;place-items:center;margin:0 auto 14px}
        .hist-empty-t{font-family:'Fraunces',serif;font-size:18px;font-weight:500;color:var(--ink)}
        .hist-empty-s{font-size:13px;color:var(--muted);margin-top:4px}

        .hist-group{display:flex;flex-direction:column;gap:14px}
        .hist-group-h{display:flex;align-items:center;gap:10px}
        .hist-group-l{font-family:'Fraunces',serif;font-size:18px;font-weight:500;color:var(--ink);letter-spacing:-.005em}
        .hist-group-c{font-size:11.5px;color:var(--muted);font-weight:500}
        .hist-group-line{flex:1;height:1px;background:var(--line);margin-left:6px}

        .hgrid{display:grid;gap:16px}
        .hcard{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;transition:all .2s;display:flex;flex-direction:column;cursor:pointer}
        .hcard:hover{transform:translateY(-2px);box-shadow:0 12px 32px -16px rgba(45,42,38,.18);border-color:#cdc4b3}
        .hthumb{position:relative;aspect-ratio:4/3;border-bottom:1px solid var(--line);overflow:hidden;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .hthumb-img{width:100%;height:100%;object-fit:contain;object-position:center;display:block;background:#fff}
        .hthumb-comp{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:10%}
        .hthumb-comp img{position:relative;max-width:22%;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(45,42,38,.12))}
        .hthumb-overlay{position:absolute;inset:0;background:rgba(20,16,12,.4);display:flex;align-items:center;justify-content:center;gap:8px;opacity:0;transition:opacity .2s;backdrop-filter:blur(2px);pointer-events:none}
        .hcard:hover .hthumb-overlay{opacity:1}
        .hov-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:99px;background:#fff;color:var(--ink);font-size:12px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.2)}
        .hthumb-count{position:absolute;top:10px;left:10px;padding:3px 8px;background:rgba(255,255,255,.92);backdrop-filter:blur(6px);border-radius:99px;font-size:10.5px;font-weight:600;color:var(--ink)}

        .hbody{padding:14px 16px 16px;display:flex;flex-direction:column;flex:1}
        .htitle{font-family:'Fraunces',serif;font-size:16px;font-weight:500;color:var(--ink);letter-spacing:-.005em;line-height:1.25;display:inline-flex;align-items:center;gap:6px;cursor:text;border-radius:5px;padding:1px 4px;margin-left:-4px}
        .htitle:hover{background:var(--bg)}
        .htitle:hover .htitle-edit{opacity:.5}
        .htitle-edit{opacity:0;color:var(--muted);transition:opacity .15s}
        .htitle-input{font-family:'Fraunces',serif;font-size:16px;font-weight:500;color:var(--ink);width:100%;border:1px solid var(--accent);border-radius:5px;padding:2px 6px;margin-left:-4px;outline:none;background:#fff;box-shadow:0 0 0 3px var(--accent-soft)}
        .hmeta{font-size:11.5px;color:var(--muted);margin-top:3px}
        .hsku-row{display:flex;flex-wrap:wrap;gap:4px;margin-top:10px}
        .hsku{padding:3px 7px;background:var(--bg);border-radius:5px;font-size:10px;color:var(--ink-2);font-variant-numeric:tabular-nums;font-weight:600;letter-spacing:.3px}
        .hsku.more{background:transparent;color:var(--muted)}
        .hact{display:flex;gap:5px;margin-top:auto;padding-top:14px;align-items:center}
        .hbtn{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:7px 9px;border:1px solid var(--line);border-radius:8px;font-size:11.5px;font-weight:600;background:#fff;color:var(--ink-2);transition:all .15s;min-width:30px}
        .hbtn:hover{border-color:#cdc4b3;color:var(--ink)}
        .hbtn.danger:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}
        .hbtn.primary{background:var(--accent);border-color:var(--accent);color:#fff;margin-left:auto;padding:7px 11px}
        .hbtn.primary:hover{background:var(--accent-2)}

        .lb-back{position:fixed;inset:0;background:rgba(20,16,12,.6);backdrop-filter:blur(8px);z-index:1000;display:grid;place-items:center;padding:32px}
        .lb-modal{background:#fff;border-radius:18px;width:min(1100px,96vw);max-height:92vh;display:grid;grid-template-columns:1.5fr 360px;overflow:hidden;box-shadow:0 30px 80px -20px rgba(0,0,0,.4);position:relative}
        .lb-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.85);backdrop-filter:blur(8px);border:1px solid var(--line);color:var(--ink);transition:all .15s;z-index:5}
        .lb-close:hover{background:#fff;transform:scale(1.05)}
        .lb-stage{background:#fff;display:flex;align-items:center;justify-content:center;padding:30px;min-height:520px;border-right:1px solid var(--line);position:relative;overflow:hidden}
        .lb-stage-img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block}
        .lb-stage .hthumb-comp{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:48px 48px 60px}
        .lb-stage .hthumb-comp img{position:relative;max-width:24%;height:auto}
        .lb-side{padding:36px 30px 24px;display:flex;flex-direction:column;background:var(--paper);overflow-y:auto}
        .lb-eye{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:6px}
        .lb-title{font-family:'Fraunces',serif;font-size:24px;font-weight:500;color:var(--ink);letter-spacing:-.01em;line-height:1.15}
        .lb-date{font-size:12.5px;color:var(--muted);margin-top:4px}
        .lb-desc{font-size:13px;color:var(--ink-2);margin-top:10px;line-height:1.55}
        .lb-section-h{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:24px 0 10px}
        .lb-prods{display:flex;flex-direction:column;gap:8px;flex:1}
        .lb-prod{display:flex;gap:10px;padding:8px;background:#fff;border:1px solid var(--line);border-radius:9px;align-items:center}
        .lb-prod-img{width:38px;height:38px;border-radius:6px;background:#fff;border:1px solid var(--line);overflow:hidden;flex-shrink:0;padding:3px}
        .lb-prod-img img{width:100%;height:100%;object-fit:contain}
        .lb-prod-n{font-size:12.5px;font-weight:600;color:var(--ink);line-height:1.2}
        .lb-prod-m{font-size:11px;color:var(--muted);margin-top:2px;font-variant-numeric:tabular-nums}
        .lb-actions{display:flex;gap:6px;padding-top:16px;border-top:1px solid var(--line);margin-top:14px}
        .lb-actions .hbtn{flex:1;padding:10px 12px}

        @media (max-width: 900px){
          .lb-modal{grid-template-columns:1fr}
          .lb-stage{min-height:300px;border-right:none;border-bottom:1px solid var(--line)}
        }

        .btn{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:550;transition:all .15s;border:1px solid transparent}
        .btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink-2)}
        .btn-ghost:hover{border-color:var(--accent);color:var(--accent)}
        .btn-ghost.danger{color:var(--accent)}
        .btn-ghost.danger:hover{background:var(--accent-soft);border-color:var(--accent)}
        .btn:disabled{opacity:.5;cursor:not-allowed}
      `}</style>

      <DownloadModal
        open={dlOpen}
        onClose={() => setDlOpen(false)}
        bodegon={dlBodegon}
        products={products}
      />
    </section>
  );
}
