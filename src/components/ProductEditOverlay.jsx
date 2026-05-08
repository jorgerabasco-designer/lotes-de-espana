import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I } from './icons.jsx';
import { uploadProductPhoto } from '../lib/api.js';
import { useTaxonomy } from '../lib/taxonomy.jsx';

const EMPTY_PRODUCT = { sku: '', name: '', brand: '', cat: 'vinos', h: '', w: '', d: '', img: '', tags: [], desc: '', tipo_envase: '', color: '', posicion: '', descripcion_visual: '', notas: '' };

export default function ProductEditOverlay({ open, product, onClose, onSave }) {
  const isNew = !product?.sku;
  const [form, setForm] = useState(() => product ? { ...EMPTY_PRODUCT, ...product } : EMPTY_PRODUCT);
  const [pendingFile, setPendingFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const fileRef = useRef(null);

  const { catOpts, tags: taxTags } = useTaxonomy();
  const catOptions = useMemo(() => {
    if (!form.cat || catOpts.some(o => o.value === form.cat)) return catOpts;
    return [...catOpts, { value: form.cat, label: form.cat }];
  }, [catOpts, form.cat]);

  useEffect(() => {
    setForm(product ? { ...EMPTY_PRODUCT, ...product } : EMPTY_PRODUCT);
    setPendingFile(null);
    setSavedSuccess(false);
    setErrorMsg(null);
    setBusy(false);
  }, [product, open]);

  if (!open) return null;
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('El archivo tiene que ser una imagen (PNG, JPG, WEBP).');
      return;
    }
    setPendingFile(file);
    const url = URL.createObjectURL(file);
    upd('img', url);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setPendingFile(null);
    upd('img', '');
    upd('foto_path', null);
  };

  const handleSave = async () => {
    setErrorMsg(null);
    setBusy(true);
    try {
      let next = { ...form };
      if (pendingFile && next.sku) {
        try {
          const path = await uploadProductPhoto(pendingFile, next.sku);
          next.foto_path = path;
        } catch (e) {
          throw new Error('No se pudo subir la imagen: ' + (e.message || 'error desconocido'));
        }
      }
      await onSave(next);
      setSavedSuccess(true);
      // Cerrar tras la animación
      setTimeout(() => onClose && onClose(), 1100);
    } catch (e) {
      setErrorMsg(e.message || 'Error al guardar el producto.');
      setBusy(false);
    }
  };

  return (
    <div className="ov-bg" onClick={onClose}>
      <div className="ov" onClick={e => e.stopPropagation()}>
        <header className="ov-head">
          <div>
            <div className="ov-eyebrow">{isNew ? 'Nuevo' : 'Editar'} producto</div>
            <h3 className="ov-title">{isNew ? 'Subir producto' : form.name}</h3>
          </div>
          <button className="ov-x" onClick={onClose}>{I.x({ size: 18 })}</button>
        </header>

        <div className="ov-body">
          <div className="ov-left">
            <div
              className={`img-drop ${form.img ? 'has-image' : ''} ${dragOver ? 'over' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {form.img ? (
                <img src={form.img} alt="" draggable={false}/>
              ) : (
                <div className="img-empty">
                  <div className="img-icon">{I.upload({ size: 24 })}</div>
                  <div className="img-t">Arrastra una imagen aquí</div>
                  <div className="img-s">o haz clic para seleccionarla · PNG con fondo transparente recomendado</div>
                </div>
              )}

              {form.img && (
                <div className="img-actions" onClick={(e)=>e.stopPropagation()}>
                  <button type="button" className="img-replace" onClick={(e)=>{e.stopPropagation();fileRef.current?.click();}}>
                    {I.refresh({ size: 13 })} Reemplazar
                  </button>
                  <button type="button" className="img-remove" onClick={handleClear} title="Quitar imagen">
                    {I.trash({ size: 13 })}
                  </button>
                </div>
              )}

              {!form.img && (
                <button type="button" className="img-replace solo" onClick={(e)=>{e.stopPropagation();fileRef.current?.click();}}>
                  Subir imagen
                </button>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
              />
            </div>
          </div>

          <div className="ov-right">
            <div className="frow">
              <Field label="Nombre" v={form.name} onChange={v => upd('name', v)} placeholder="ej. Bardos Viñedos de Altura"/>
              <Field label="Marca" v={form.brand} onChange={v => upd('brand', v)}/>
            </div>
            <div className="frow">
              <Field label="Referencia (RP)" v={form.sku} onChange={v => upd('sku', v.toUpperCase())} mono placeholder="03TC316"/>
              <Field label="Categoría" type="select" v={form.cat} onChange={v => upd('cat', v)} opts={catOptions}/>
            </div>

            <div className="section-h">Dimensiones reales</div>
            <div className="frow">
              <Field label="Altura (cm)" v={form.h} onChange={v => upd('h', v)} mono num/>
              <Field label="Anchura (cm)" v={form.w} onChange={v => upd('w', v)} mono num/>
              <Field label="Profundidad (cm)" v={form.d} onChange={v => upd('d', v)} mono num/>
            </div>

            <div className="frow">
              <Field label="Tipo de envase" v={form.tipo_envase} onChange={v => upd('tipo_envase', v)} placeholder="botella vidrio oscuro"/>
              <Field label="Color dominante" v={form.color} onChange={v => upd('color', v)} placeholder="black and white"/>
            </div>

            <div className="frow">
              <Field
                label="Posición sugerida (bodegón)"
                type="select"
                v={form.posicion || ''}
                onChange={v => upd('posicion', v)}
                opts={[
                  { value: '', label: 'Auto (por altura)' },
                  { value: 'TRASERA', label: 'TRASERA (alto)' },
                  { value: 'MEDIA', label: 'MEDIA' },
                  { value: 'DELANTERA', label: 'DELANTERA (bajo)' },
                ]}
              />
            </div>

            <div className="section-h">Etiquetas</div>
            <div className="tag-row">
              {taxTags.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Aún no hay etiquetas. Añádelas en Configuración → Categorías y tags.
                </div>
              )}
              {taxTags.map(t => {
                const on = (form.tags || []).includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    className={`tagpill ${on ? 'on' : ''}`}
                    onClick={() => {
                      const cur = form.tags || [];
                      upd('tags', on ? cur.filter(x => x !== t.id) : [...cur, t.id]);
                    }}
                  >{t.label}</button>
                );
              })}
            </div>

            <div className="section-h">Descripción visual (para el prompt de IA)</div>
            <textarea
              className="ftarea"
              rows={3}
              value={form.descripcion_visual || ''}
              onChange={e => upd('descripcion_visual', e.target.value)}
              placeholder="Ej: dark glass bottle with white capsule and white label showing bare winter tree illustrations"
            />

            <div className="section-h">Notas (uso interno)</div>
            <textarea
              className="ftarea"
              rows={2}
              value={form.notas || ''}
              onChange={e => upd('notas', e.target.value)}
            />
          </div>
        </div>

        {errorMsg && (
          <div className="ov-error-banner">
            <span className="ov-error-ic">{I.x({ size: 14 })}</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {savedSuccess && (
          <div className="ov-success-veil">
            <div className="ov-success-icon">{I.check({ size: 38 })}</div>
            <div className="ov-success-t">{isNew ? 'Producto creado' : 'Producto actualizado'}</div>
            <div className="ov-success-s">{form.name}</div>
          </div>
        )}

        <footer className="ov-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <div className="foot-r">
            <button className="btn btn-primary" onClick={handleSave} disabled={busy || !form.sku || !form.name}>
              {I.check({ size: 14 })} {busy ? 'Guardando…' : 'Guardar producto'}
            </button>
          </div>
        </footer>
      </div>
      <style>{`
        .ov-bg{position:fixed;inset:0;background:rgba(20,16,12,.45);backdrop-filter:blur(6px);z-index:300;display:grid;place-items:center;padding:30px;animation:fadeIn .2s}
        .ov{position:relative;background:#FAFAF7;border-radius:18px;width:920px;max-width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 30px 80px -20px rgba(0,0,0,.4);animation:popIn .25s cubic-bezier(.2,.8,.2,1)}

        .ov-success-veil{position:absolute;inset:0;background:rgba(250,250,247,.97);backdrop-filter:blur(6px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;z-index:50;border-radius:18px;animation:fadeIn .2s ease}
        .ov-success-icon{width:78px;height:78px;border-radius:50%;background:linear-gradient(135deg,#3a7a5a,#2F4A3D);color:#fff;display:grid;place-items:center;animation:successPop .55s cubic-bezier(.2,.8,.2,1);box-shadow:0 8px 24px -4px rgba(47,74,61,.45)}
        @keyframes successPop{0%{transform:scale(.4) rotate(-12deg);opacity:0}55%{transform:scale(1.12) rotate(2deg)}100%{transform:scale(1) rotate(0);opacity:1}}
        .ov-success-t{font-family:'Fraunces',serif;font-size:26px;font-weight:500;color:var(--ink);letter-spacing:-.012em;margin-top:14px;animation:fadeIn .35s ease .15s backwards}
        .ov-success-s{font-size:13.5px;color:var(--muted);animation:fadeIn .35s ease .25s backwards;max-width:80%;text-align:center}

        .ov-error-banner{margin:0 28px;padding:10px 14px;background:rgba(167,77,74,.08);border:1px solid var(--accent);color:var(--accent);font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:8px;border-radius:9px;animation:slideIn .25s ease}
        .ov-error-ic{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:var(--accent);color:#fff;border-radius:50%;flex-shrink:0}
        .ov-head{display:flex;justify-content:space-between;align-items:flex-start;padding:24px 28px;border-bottom:1px solid var(--line)}
        .ov-eyebrow{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);font-weight:600}
        .ov-title{font-family:'Fraunces',serif;font-weight:400;font-size:24px;margin:4px 0 0;color:var(--ink)}
        .ov-x{width:32px;height:32px;border-radius:8px;color:var(--muted);display:grid;place-items:center;background:transparent}
        .ov-x:hover{background:var(--bg);color:var(--ink)}
        .ov-body{display:grid;grid-template-columns:280px 1fr;gap:24px;padding:24px 28px;overflow-y:auto}
        .ov-left{display:flex;flex-direction:column;gap:14px}
        .img-drop{position:relative;background:#fff;border:1.5px dashed var(--line);border-radius:14px;height:300px;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:18px;cursor:pointer;transition:border-color .15s, background .15s}
        .img-drop:hover{border-color:var(--accent)}
        .img-drop.over{border-color:var(--accent);background:var(--accent-soft);border-style:solid}
        .img-drop.has-image{padding:14px;background:var(--paper);border-style:solid;border-color:var(--line)}
        .img-drop.has-image:hover{border-color:#cdc4b3}
        .img-drop img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;object-position:center}
        .img-empty{display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;color:var(--muted);padding:0 10px;pointer-events:none}
        .img-icon{width:46px;height:46px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;margin-bottom:8px}
        .img-t{font-size:13.5px;font-weight:600;color:var(--ink)}
        .img-s{font-size:11.5px;color:var(--muted);line-height:1.5;max-width:240px}

        .img-actions{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:5}
        .img-replace{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;background:#fff;border:1px solid var(--line);border-radius:8px;font-size:11.5px;font-weight:600;color:var(--ink);box-shadow:0 2px 6px rgba(0,0,0,.06);transition:all .15s}
        .img-replace:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-1px)}
        .img-replace.solo{position:absolute;bottom:10px;left:50%;transform:translateX(-50%)}
        .img-remove{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;background:#fff;border:1px solid var(--line);border-radius:8px;color:var(--muted);box-shadow:0 2px 6px rgba(0,0,0,.06);transition:all .15s}
        .img-remove:hover{border-color:var(--accent);color:var(--accent)}

        .ov-right{display:flex;flex-direction:column;gap:12px}
        .frow{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .frow:has(>*:nth-child(3)){grid-template-columns:1fr 1fr 1fr}
        .section-h{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-top:8px;padding:0 2px}
        .tag-row{display:flex;flex-wrap:wrap;gap:5px}
        .tagpill{padding:6px 12px;border-radius:99px;font-size:11.5px;font-weight:500;color:var(--ink-2);background:#fff;border:1px solid var(--line);transition:all .12s}
        .tagpill:hover{border-color:#cdc4b3}
        .tagpill.on{background:var(--accent);color:#fff;border-color:var(--accent)}
        .ftarea{padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:13px;color:var(--ink);resize:vertical;font-family:inherit;outline:none;transition:all .15s}
        .ftarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}

        .ov-foot{display:flex;justify-content:space-between;padding:18px 28px;border-top:1px solid var(--line);background:#fff;border-radius:0 0 18px 18px}
        .foot-r{display:flex;gap:8px}
        .btn{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:550;transition:all .15s;border:1px solid transparent}
        .btn:disabled{opacity:.55;cursor:not-allowed}
        .btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}
        .btn-ghost:hover{border-color:#cdc4b3}
        .btn-danger{background:#fff;border:1px solid var(--line);color:var(--accent)}
        .btn-danger:hover{background:var(--accent-soft);border-color:var(--accent)}
        .btn-primary{background:var(--accent);color:#fff;box-shadow:0 1px 2px rgba(167,77,74,.3),0 4px 14px -4px rgba(167,77,74,.4)}
        .btn-primary:hover{background:var(--accent-2)}

        @media (max-width:900px){
          .ov-body{grid-template-columns:1fr}
        }
      `}</style>
    </div>
  );
}

function Field({ label, v, onChange, type = 'text', opts, mono, num, placeholder }) {
  return (
    <div className="field">
      <label>{label}</label>
      {type === 'select' ? (
        <select value={v} onChange={e => onChange(e.target.value)}>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          type={num ? 'number' : 'text'}
          value={v}
          onChange={e => onChange(e.target.value)}
          className={mono ? 'mono-in' : ''}
          placeholder={placeholder}
        />
      )}
      <style>{`
        .field{display:flex;flex-direction:column;gap:5px;min-width:0}
        .field label{font-size:11px;font-weight:600;color:var(--ink-2);letter-spacing:.2px}
        .field input,.field select{padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;font-size:13px;color:var(--ink);font-family:inherit;outline:none;transition:all .15s;width:100%}
        .field input:focus,.field select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .field .mono-in{font-variant-numeric:tabular-nums;letter-spacing:.3px}
      `}</style>
    </div>
  );
}
