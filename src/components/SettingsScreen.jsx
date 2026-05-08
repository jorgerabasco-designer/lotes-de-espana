import React, { useEffect, useState } from 'react';
import { I } from './icons.jsx';
import { DEFAULT_PROMPT_TEMPLATE } from '../lib/constants.js';
import { getSetting, setSetting, diagnoseSupabase } from '../lib/api.js';
import { SUPABASE_READY } from '../lib/supabase.js';
import { importSeedProducts, SEED_PRODUCTS } from '../lib/seed.js';
import { useTaxonomy } from '../lib/taxonomy.jsx';

export default function SettingsScreen({ products = [], onProductsChanged }) {
  const [section, setSection] = useState('prompt');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT_TEMPLATE);
  const [savedAt, setSavedAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const tax = useTaxonomy();
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedProgress, setSeedProgress] = useState(null);
  const [seedDone, setSeedDone] = useState(false);
  const [diagBusy, setDiagBusy] = useState(false);
  const [diagReport, setDiagReport] = useState(null);

  const handleDiagnose = async () => {
    setDiagBusy(true);
    try {
      const r = await diagnoseSupabase();
      setDiagReport(r);
    } finally {
      setDiagBusy(false);
    }
  };

  const handleImportSeed = async () => {
    if (!confirm(`Se subirán ${SEED_PRODUCTS.length} productos demo (con sus imágenes) a tu Supabase. ¿Continuar?`)) return;
    setSeedBusy(true);
    setSeedDone(false);
    try {
      await importSeedProducts({
        onProgress: (p) => setSeedProgress(p),
      });
      setSeedDone(true);
      onProductsChanged && (await onProductsChanged());
    } catch (e) {
      alert('Error importando datos demo: ' + (e.message || e));
    } finally {
      setSeedBusy(false);
      setTimeout(() => setSeedProgress(null), 1500);
    }
  };

  useEffect(() => {
    (async () => {
      const stored = await getSetting('prompt_template', null);
      if (stored) setPrompt(stored);
    })();
  }, []);

  const handleSave = async () => {
    setBusy(true);
    try {
      await setSetting('prompt_template', prompt);
      setSavedAt(Date.now());
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = () => {
    if (confirm('¿Restaurar el prompt original? Perderás los cambios.')) {
      setPrompt(DEFAULT_PROMPT_TEMPLATE);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  // Cuentas de productos por categoría/tag
  const catCount = (id) => products.filter(p => p.cat === id).length;
  const tagCount = (id) => products.filter(p => (p.tags || []).includes(id)).length;

  const sections = [
    { id: 'prompt',   label: 'Prompt de generación', desc: 'Plantilla base IA (Gemini)' },
    { id: 'taxonomy', label: 'Categorías y tags',    desc: 'Organización del catálogo' },
    { id: 'about',    label: 'Acerca de',            desc: 'Lotes de España · Studio' },
  ];

  return (
    <section className="screen wide settings-screen">
      <header className="cat-head">
        <div>
          <h1 className="cat-title">Configuración</h1>
          <p className="cat-sub">Ajusta el comportamiento del generador de bodegones IA.</p>
        </div>
      </header>

      <div className="set-layout">
        <nav className="set-nav">
          {sections.map(s => (
            <button key={s.id} className={`set-navitem ${section === s.id ? 'on' : ''}`} onClick={() => setSection(s.id)}>
              <span className="set-navindicator"/>
              <span className="set-navtext">
                <span className="set-navlabel">{s.label}</span>
                <span className="set-navdesc">{s.desc}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="set-panel">
          {section === 'prompt' && (
            <div className="set-block">
              <div className="set-blockh">
                <h3>Prompt de generación</h3>
                <p>
                  Plantilla base que Gemini utiliza para generar bodegones. Las variables <code>{'{PRODUCTS}'}</code> y <code>{'{N}'}</code> se sustituyen automáticamente al pulsar "Generar bodegón" usando los productos seleccionados, sus dimensiones reales y su posición sugerida (TRASERA / MEDIA / DELANTERA).
                </p>
              </div>
              <div className="set-promptframe">
                <div className="set-promptbar">
                  <div className="set-promptdots"><span/><span/><span/></div>
                  <div className="set-promptname">prompt.template</div>
                  <button className="set-promptcopy" title="Copiar" onClick={handleCopy}>
                    {copied ? I.check({ size: 13 }) : I.copy({ size: 13 })}
                  </button>
                </div>
                <textarea className="prompt-area" value={prompt} onChange={e => setPrompt(e.target.value)} rows={20}/>
              </div>
              <div className="set-vars">
                <span className="set-varslabel">Variables disponibles</span>
                <code>{'{PRODUCTS}'}</code>
                <code>{'{N}'}</code>
              </div>
              <div className="set-actions">
                <button className="btn btn-ghost" onClick={handleRestore}>{I.refresh({ size: 14 })} Restaurar original</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={busy}>
                  {I.check({ size: 14 })} {busy ? 'Guardando…' : 'Guardar prompt'}
                </button>
              </div>
              {savedAt && (
                <div className="set-saved">✓ Prompt guardado correctamente — la próxima generación lo usará.</div>
              )}
            </div>
          )}

          {section === 'taxonomy' && (
            <div className="set-block">
              <div className="set-blockh">
                <h3>Categorías y etiquetas</h3>
                <p>Define las categorías y etiquetas que aparecerán al subir o editar un producto, así como en los filtros del catálogo y de la barra lateral.</p>
              </div>

              <TaxonomyEditor
                title="Categorías"
                subtitle="Agrupan los productos en el catálogo y la barra lateral."
                items={tax.categories}
                count={catCount}
                onAdd={tax.addCategory}
                onUpdate={tax.updateCategory}
                onRemove={tax.removeCategory}
                placeholder="Nueva categoría — p. ej. Embutidos"
                pillStyle={false}
              />

              <div className="tax-divider"/>

              <TaxonomyEditor
                title="Etiquetas"
                subtitle="Atributos rápidos como Bio, Vegano o Sin gluten que se asignan a cada producto."
                items={tax.tags}
                count={tagCount}
                onAdd={tax.addTag}
                onUpdate={tax.updateTag}
                onRemove={tax.removeTag}
                placeholder="Nueva etiqueta — p. ej. Artesano"
                pillStyle={true}
              />
            </div>
          )}

          {section === 'about' && (
            <div className="set-block">
              <div className="set-blockh">
                <h3>Acerca de</h3>
                <p>Lotes de España · Studio. Generador de bodegones IA conectado a Supabase + Google Gemini.</p>
              </div>
              <ul className="about-list">
                <li><strong>Frontend:</strong> React 18 + Vite</li>
                <li><strong>Base de datos:</strong> Supabase (Postgres + Storage)</li>
                <li><strong>Generación IA:</strong> Google Gemini 2.5 Image Preview (vía Netlify Function)</li>
                <li><strong>Hosting:</strong> Netlify</li>
                <li><strong>Repositorio:</strong> GitHub (auto-deploy en cada commit)</li>
              </ul>

              <div className="seed-block">
                <div className="seed-h">
                  <div>
                    <div className="seed-t">Diagnóstico de Supabase</div>
                    <div className="seed-s">
                      Comprueba que las tablas y los buckets existen y que la app puede subir imágenes.
                    </div>
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={handleDiagnose} disabled={!SUPABASE_READY || diagBusy}>
                  {I.refresh({ size: 14 })} {diagBusy ? 'Comprobando…' : 'Ejecutar diagnóstico'}
                </button>
                {diagReport && (
                  <div className="diag-result">
                    <div><strong>Cliente Supabase:</strong> {diagReport.supabaseReady ? '✓ inicializado' : '❌ sin claves'}</div>
                    <div><strong>Tabla products:</strong> {diagReport.productsTable}</div>
                    <div><strong>Tabla bodegones:</strong> {diagReport.bodegonesTable}</div>
                    <div><strong>Tabla settings:</strong> {diagReport.settingsTable}</div>
                    <div><strong>Bucket productos:</strong> {diagReport.bucketProductos}</div>
                    <div><strong>Bucket bodegones:</strong> {diagReport.bucketBodegones}</div>
                    <div><strong>Subida de prueba:</strong> {diagReport.canUploadTest}</div>
                    {(String(diagReport.bucketProductos).includes('❌') || String(diagReport.canUploadTest).includes('❌')) && (
                      <div className="diag-fix">
                        ⚠️ Algo falla en Storage. Ve a Supabase → SQL Editor → ejecuta de nuevo el archivo <code>supabase/schema.sql</code> entero (es seguro re-ejecutarlo).
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="seed-block">
                <div className="seed-h">
                  <div>
                    <div className="seed-t">Importar productos de demostración</div>
                    <div className="seed-s">
                      Sube de un golpe los {SEED_PRODUCTS.length} productos de muestra (vino, AOVE, turrones, conservas, snacks…) con sus fotos a tu Supabase. Útil para probar la app sin tener que rellenar el catálogo desde cero.
                    </div>
                  </div>
                </div>
                {!SUPABASE_READY && (
                  <div className="seed-warn">
                    Supabase no está conectado en esta página. Configura las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> primero.
                  </div>
                )}
                {seedProgress && seedBusy && (
                  <div className="seed-progress">
                    Subiendo {seedProgress.current}… ({seedProgress.done}/{seedProgress.total})
                  </div>
                )}
                {seedDone && (
                  <div className="seed-done">{I.check({ size: 14 })} Importación completada — {SEED_PRODUCTS.length} productos disponibles en el catálogo.</div>
                )}
                <button className="btn btn-primary" onClick={handleImportSeed} disabled={!SUPABASE_READY || seedBusy}>
                  {I.upload({ size: 14 })} {seedBusy ? 'Importando…' : 'Importar productos demo'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .screen{flex:1;min-width:0;padding:38px 56px 56px 64px;display:flex;flex-direction:column;gap:22px;overflow-y:auto;height:100vh;width:100%}
        .cat-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap}
        .cat-title{font-family:'Fraunces',serif;font-weight:400;font-size:46px;line-height:1;letter-spacing:-.02em;color:var(--ink);margin:0}
        .cat-sub{margin:12px 0 0;color:var(--muted);font-size:14px;line-height:1.55}

        .set-layout{display:grid;grid-template-columns:240px 1fr;gap:40px;align-items:flex-start}
        .set-nav{position:sticky;top:0;display:flex;flex-direction:column;gap:2px}
        .set-navitem{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;background:transparent;text-align:left;transition:all .15s;position:relative}
        .set-navitem:hover{background:#fff}
        .set-navindicator{width:3px;height:24px;border-radius:99px;background:transparent;flex-shrink:0;transition:background .15s}
        .set-navitem.on{background:#fff;box-shadow:0 1px 3px rgba(45,42,38,.05)}
        .set-navitem.on .set-navindicator{background:var(--accent)}
        .set-navtext{display:flex;flex-direction:column;gap:1px;min-width:0}
        .set-navlabel{font-size:13px;font-weight:600;color:var(--ink)}
        .set-navdesc{font-size:11px;color:var(--muted)}

        .set-panel{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden}
        .set-block{padding:36px 40px}
        .set-blockh{margin-bottom:26px;padding-bottom:20px;border-bottom:1px solid var(--line)}
        .set-blockh h3{font-family:'Fraunces',serif;font-size:24px;font-weight:500;margin:0;color:var(--ink);letter-spacing:-.01em}
        .set-blockh p{margin:6px 0 0;font-size:13.5px;color:var(--muted);line-height:1.6;max-width:62ch}
        .set-blockh code{font-family:ui-monospace,Menlo,monospace;background:var(--bg);padding:1px 6px;border-radius:5px;color:var(--accent);font-size:12px}

        .set-promptframe{border:1px solid #2a261f;border-radius:12px;overflow:hidden;background:#1a1814}
        .set-promptbar{display:flex;align-items:center;gap:10px;padding:9px 14px;background:#221e18;border-bottom:1px solid #2a261f}
        .set-promptdots{display:flex;gap:5px}
        .set-promptdots span{width:9px;height:9px;border-radius:50%;background:#3a352d}
        .set-promptname{flex:1;font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:11px;color:#8B8375;letter-spacing:.4px}
        .set-promptcopy{width:24px;height:24px;border-radius:6px;display:grid;place-items:center;color:#8B8375;background:transparent;transition:all .15s}
        .set-promptcopy:hover{background:#2a261f;color:#EAE3D6}
        .prompt-area{display:block;width:100%;padding:18px 20px;border:none;background:#1a1814;color:#EAE3D6;font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:12.5px;line-height:1.78;resize:vertical;outline:none;letter-spacing:.1px;min-height:380px}

        .set-vars{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:14px;padding:10px 14px;background:var(--bg);border:1px solid var(--line);border-radius:10px}
        .set-varslabel{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-right:4px}
        .set-vars code{font-family:ui-monospace,Menlo,monospace;background:#fff;border:1px solid var(--line);padding:3px 8px;border-radius:6px;color:var(--accent);font-size:11.5px;font-weight:600}

        .set-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
        .set-saved{margin-top:12px;font-size:12.5px;color:var(--olive);font-weight:600}

        .btn{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:550;transition:all .15s;border:1px solid transparent}
        .btn:disabled{opacity:.55;cursor:not-allowed}
        .btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}
        .btn-ghost:hover{border-color:#cdc4b3}
        .btn-primary{background:var(--accent);color:#fff;box-shadow:0 1px 2px rgba(167,77,74,.3),0 4px 14px -4px rgba(167,77,74,.4)}
        .btn-primary:hover{background:var(--accent-2)}

        .about-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;font-size:13.5px;color:var(--ink-2);line-height:1.5}
        .about-list strong{color:var(--ink);font-weight:600;margin-right:6px}

        .seed-block{margin-top:32px;padding-top:28px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:14px;align-items:flex-start}
        .seed-h{display:flex;justify-content:space-between;gap:24px;width:100%}
        .seed-t{font-family:'Fraunces',serif;font-size:18px;font-weight:500;color:var(--ink);letter-spacing:-.01em}
        .seed-s{font-size:12.5px;color:var(--muted);margin-top:4px;line-height:1.55;max-width:62ch}
        .seed-warn{padding:10px 14px;background:rgba(167,77,74,.06);border:1px solid var(--accent-soft);border-radius:9px;font-size:12.5px;color:var(--accent);width:100%}
        .seed-warn code{font-family:ui-monospace,Menlo,monospace;background:#fff;padding:1px 5px;border-radius:4px;font-size:11.5px}
        .seed-progress{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
        .seed-done{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:rgba(58,122,90,.08);border:1px solid rgba(58,122,90,.3);border-radius:8px;font-size:12.5px;color:#3a7a5a;font-weight:600}

        .diag-result{padding:12px 14px;background:var(--paper);border:1px solid var(--line);border-radius:9px;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.7;width:100%;color:var(--ink-2)}
        .diag-result strong{color:var(--ink);margin-right:6px;font-weight:600}
        .diag-fix{margin-top:10px;padding:10px 12px;background:rgba(167,77,74,.08);border:1px solid var(--accent);border-radius:8px;color:var(--accent);font-family:'Inter',sans-serif;font-size:12.5px;font-weight:500;line-height:1.5}
        .diag-fix code{font-family:ui-monospace,Menlo,monospace;background:#fff;padding:1px 6px;border-radius:4px;font-size:11.5px;color:var(--ink)}

        .tax-section{display:flex;flex-direction:column;gap:14px}
        .tax-h{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:2px}
        .tax-t{font-family:'Fraunces',serif;font-size:18px;font-weight:500;color:var(--ink);letter-spacing:-.01em}
        .tax-s{font-size:12.5px;color:var(--muted);margin-top:3px;line-height:1.5;max-width:52ch}
        .tax-count{font-family:'Fraunces',serif;font-size:22px;font-weight:500;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:6px 14px;font-variant-numeric:tabular-nums}

        .tax-list{display:flex;flex-direction:column;gap:6px}
        .tax-item{display:flex;align-items:center;gap:14px;padding:10px 14px;background:#fff;border:1px solid var(--line);border-radius:10px;transition:all .12s}
        .tax-item:hover{border-color:#cdc4b3}
        .tax-label-wrap{flex:1;display:flex;align-items:center;gap:8px;min-width:0}
        .tax-label{font-size:13.5px;font-weight:600;color:var(--ink);background:transparent;border:1px solid transparent;border-radius:7px;padding:5px 8px;outline:none;flex:1;min-width:0;width:100%}
        .tax-label:focus{border-color:var(--accent);background:var(--paper);box-shadow:0 0 0 3px var(--accent-soft)}
        .tax-label.editing{border-color:var(--accent);background:var(--paper);box-shadow:0 0 0 3px var(--accent-soft)}
        .tax-meta{font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums;background:var(--bg);padding:3px 9px;border-radius:99px;font-weight:600;white-space:nowrap}
        .tax-del{width:30px;height:30px;border-radius:7px;display:grid;place-items:center;color:var(--muted);background:transparent;transition:all .12s;flex-shrink:0}
        .tax-del:hover{color:var(--accent);background:var(--accent-soft)}
        .tax-del:disabled{opacity:.4;cursor:not-allowed}

        .tax-list.tag-list{flex-direction:row;flex-wrap:wrap;gap:6px}
        .tag-item{display:inline-flex;align-items:center;gap:6px;padding:6px 6px 6px 14px;background:#fff;border:1px solid var(--line);border-radius:99px;font-size:12.5px;color:var(--ink);font-weight:600;transition:all .12s}
        .tag-item:hover{border-color:#cdc4b3}
        .tag-item .tax-label{font-size:12.5px;padding:2px 6px}
        .tag-meta{font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums;font-weight:600;background:var(--bg);min-width:18px;height:18px;display:grid;place-items:center;border-radius:99px;padding:0 6px}
        .tag-del{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:var(--muted);background:transparent;transition:all .12s}
        .tag-del:hover{color:#fff;background:var(--accent)}

        .tax-add{display:flex;gap:8px;align-items:center;margin-top:4px}
        .tax-add input{flex:1;padding:10px 13px;border:1px solid var(--line);border-radius:9px;background:#fff;font-size:13px;color:var(--ink);outline:none;transition:all .15s;font-family:inherit}
        .tax-add input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .tax-add .btn{flex-shrink:0;height:38px}
        .tax-divider{height:1px;background:var(--line);margin:32px 0}

        @media (max-width: 900px){
          .set-layout{grid-template-columns:1fr}
        }
      `}</style>
    </section>
  );
}

function TaxonomyEditor({ title, subtitle, items, count, onAdd, onUpdate, onRemove, placeholder, pillStyle }) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = () => {
    const ok = onAdd(draft);
    if (ok) setDraft('');
    else if (draft.trim()) alert('Esa entrada ya existe.');
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditValue(item.label);
  };
  const commitEdit = () => {
    if (editingId && editValue.trim()) onUpdate(editingId, editValue.trim());
    setEditingId(null);
    setEditValue('');
  };

  const handleRemove = (item) => {
    const used = count(item.id);
    let msg = `¿Eliminar "${item.label}"?`;
    if (used > 0) {
      msg += `\n\nEsta entrada está usada por ${used} ${used === 1 ? 'producto' : 'productos'}. Esos productos NO se borran, solo perderán esta clasificación.`;
    }
    if (confirm(msg)) onRemove(item.id);
  };

  return (
    <div className="tax-section">
      <div className="tax-h">
        <div>
          <div className="tax-t">{title}</div>
          <div className="tax-s">{subtitle}</div>
        </div>
        <div className="tax-count">{items.length}</div>
      </div>

      <div className={`tax-list ${pillStyle ? 'tag-list' : ''}`}>
        {items.map(item => {
          const used = count(item.id);
          const isEditing = editingId === item.id;
          if (pillStyle) {
            return (
              <div key={item.id} className="tag-item">
                <input
                  className={`tax-label ${isEditing ? 'editing' : ''}`}
                  value={isEditing ? editValue : item.label}
                  onFocus={() => startEdit(item)}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setEditingId(null); e.target.blur(); }}}
                  style={{ width: `${Math.max(item.label.length, 4) + 2}ch` }}
                />
                <span className="tag-meta" title={`${used} productos`}>{used}</span>
                <button type="button" className="tag-del" onClick={() => handleRemove(item)} title="Eliminar">{I.close({ size: 11 })}</button>
              </div>
            );
          }
          return (
            <div key={item.id} className="tax-item">
              <div className="tax-label-wrap">
                <input
                  className={`tax-label ${isEditing ? 'editing' : ''}`}
                  value={isEditing ? editValue : item.label}
                  onFocus={() => startEdit(item)}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setEditingId(null); e.target.blur(); }}}
                />
              </div>
              <span className="tax-meta">{used} {used === 1 ? 'producto' : 'productos'}</span>
              <button type="button" className="tax-del" onClick={() => handleRemove(item)} title="Eliminar">{I.close({ size: 12 })}</button>
            </div>
          );
        })}
      </div>

      <div className="tax-add">
        <input
          placeholder={placeholder}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button className="btn btn-primary" onClick={handleAdd} disabled={!draft.trim()}>
          {I.plus({ size: 13 })} Añadir
        </button>
      </div>
    </div>
  );
}
