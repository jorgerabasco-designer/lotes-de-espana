import React, { useEffect, useState } from 'react';
import { I } from './icons.jsx';
import { DEFAULT_PROMPT_TEMPLATE } from '../lib/constants.js';
import { getSetting, setSetting } from '../lib/api.js';

export default function SettingsScreen() {
  const [section, setSection] = useState('prompt');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT_TEMPLATE);
  const [savedAt, setSavedAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const sections = [
    { id: 'prompt', label: 'Prompt de generación', desc: 'Plantilla base IA (Gemini)' },
    { id: 'about',  label: 'Acerca de',           desc: 'Lotes de España · Studio' },
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

        @media (max-width: 900px){
          .set-layout{grid-template-columns:1fr}
        }
      `}</style>
    </section>
  );
}
