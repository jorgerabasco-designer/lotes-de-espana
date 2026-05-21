import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I } from './icons.jsx';
import { uploadProductPhoto, describeProduct } from '../lib/api.js';
import { useTaxonomy } from '../lib/taxonomy.jsx';
import { optimizeImage, formatBytes } from '../lib/image-optimize.js';

const EMPTY_PRODUCT = { sku: '', name: '', brand: '', cat: 'vinos', h: '', w: '', d: '', img: '', tags: [], desc: '', posicion: '', descripcion_visual: '', notas: '' };

export default function ProductEditOverlay({ open, product, initialFile, onClose, onSave, showInfo }) {
  // Fallback si no nos pasan showInfo
  const info = showInfo || ((cfg) => alert(cfg.description || cfg.title));
  const isNew = !product?.sku;
  const [form, setForm] = useState(() => product ? { ...EMPTY_PRODUCT, ...product } : EMPTY_PRODUCT);
  const [pendingFile, setPendingFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optInfo, setOptInfo] = useState(null);
  const [genDescBusy, setGenDescBusy] = useState(false);
  const fileRef = useRef(null);

  const { catOpts, tags: taxTags } = useTaxonomy();
  const catOptions = useMemo(() => {
    if (!form.cat || catOpts.some(o => o.value === form.cat)) return catOpts;
    return [...catOpts, { value: form.cat, label: form.cat }];
  }, [catOpts, form.cat]);

  useEffect(() => {
    setForm(product ? { ...EMPTY_PRODUCT, ...product } : EMPTY_PRODUCT);
    setPendingFile(null);
    setOptInfo(null);
    setSavedSuccess(false);
    setErrorMsg(null);
    setBusy(false);
    // Si vienen con un archivo (drag&drop desde el catálogo), pre-cargarlo + optimizar
    if (open && initialFile instanceof File && initialFile.type.startsWith('image/')) {
      handleFile(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, open, initialFile]);

  if (!open) return null;
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      info({
        icon: 'upload',
        tone: 'info',
        title: 'Archivo no válido',
        description: 'El archivo tiene que ser una imagen (PNG, JPG, WEBP).',
        confirmLabel: 'Entendido',
        confirmTone: 'neutral',
      });
      return;
    }
    setOptimizing(true);
    setOptInfo(null);
    try {
      const result = await optimizeImage(file);
      setPendingFile(result.file);
      const url = URL.createObjectURL(result.file);
      upd('img', url);
      if (result.optimized) {
        setOptInfo({
          message: `Optimizada · ${formatBytes(result.originalSize)} → ${formatBytes(result.newSize)}`,
          ratio: Math.round((1 - result.newSize / result.originalSize) * 100),
        });
      } else {
        setOptInfo({ message: `Sin cambios · ${formatBytes(file.size)}`, ratio: 0 });
      }
    } catch (e) {
      console.warn('No se pudo optimizar, usando original', e);
      setPendingFile(file);
      const url = URL.createObjectURL(file);
      upd('img', url);
      setOptInfo(null);
    } finally {
      setOptimizing(false);
    }
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
    setOptInfo(null);
    upd('img', '');
    upd('foto_path', null);
  };

  const handleGenerateDesc = async () => {
    if (genDescBusy) return;
    if (!pendingFile && !form.foto_path) {
      info({
        icon: 'upload',
        tone: 'info',
        title: 'Falta la foto',
        description: 'Sube primero una foto del producto. La IA necesita la imagen para escribir la descripción.',
        confirmLabel: 'Entendido',
        confirmTone: 'neutral',
      });
      return;
    }
    setGenDescBusy(true);
    try {
      const description = await describeProduct(
        pendingFile ? { file: pendingFile } : { foto_path: form.foto_path }
      );
      if (description) upd('descripcion_visual', description);
    } catch (e) {
      info({
        icon: 'sparkle',
        tone: 'danger',
        title: 'No se pudo generar la descripción',
        description: e.message || String(e),
        confirmLabel: 'Cerrar',
        confirmTone: 'neutral',
      });
    } finally {
      setGenDescBusy(false);
    }
  };

  // Formato de referencia: 2 dígitos + 2 letras + 3 dígitos (ej. 03TC316).
  const REF_REGEX = /^[0-9]{2}[A-Z]{2}[0-9]{3}$/;

  const handleSave = async () => {
    setErrorMsg(null);

    // Validaciones antes de tocar nada
    if (!form.name?.trim()) {
      setErrorMsg('El nombre del producto es obligatorio.');
      return;
    }
    if (!form.sku) {
      setErrorMsg('La referencia (RP) es obligatoria.');
      return;
    }
    if (!REF_REGEX.test(form.sku)) {
      setErrorMsg(
        `La referencia "${form.sku}" no es válida. Debe ser exactamente 2 dígitos + 2 letras + 3 dígitos (7 caracteres). Ejemplo: 03TC316.`
      );
      return;
    }

    setBusy(true);
    try {
      let next = { ...form };
      // Sanear etiquetas: filtrar solo las que existen en la taxonomía actual.
      const validTagIds = new Set((taxTags || []).map(t => t.id));
      next.tags = (next.tags || []).filter(t => validTagIds.has(t));

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
      setTimeout(() => onClose && onClose(), 1100);
    } catch (e) {
      const raw = e.message || String(e);
      let msg = raw;
      // Traducir errores comunes de Supabase a mensajes amigables.
      if (/ref_format|check constraint/i.test(raw)) {
        msg = `La referencia "${form.sku}" no es válida. Debe ser 2 dígitos + 2 letras + 3 dígitos. Ejemplo: 03TC316.`;
      } else if (/duplicate key|already exists/i.test(raw)) {
        msg = `Ya existe un producto con la referencia "${form.sku}". Usa otra distinta.`;
      } else if (/violates not-null/i.test(raw)) {
        msg = 'Falta algún campo obligatorio (nombre, marca o dimensiones).';
      }
      setErrorMsg(msg);
      setBusy(false);
    }
  };

  return (
    <div className="ov-bg" onClick={onClose}>
      <div className="ov" onClick={e => e.stopPropagation()}>
        <header className="ov-head">
          <div>
            <div className="ov-eyebrow">{isNew ? 'Nuevo' : 'Editar'} producto</div>
            <h3 className="ov-title">{isNew ? 'Nuevo producto' : form.name}</h3>
          </div>
          <button className="ov-x" onClick={onClose}>{I.x({ size: 18 })}</button>
        </header>

        <div className="ov-body">
          <div className="ov-left">
            <div
              className={`img-drop ${form.img ? 'has-image' : ''} ${dragOver ? 'over' : ''} ${optimizing ? 'optimizing' : ''}`}
              onClick={() => !optimizing && fileRef.current?.click()}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {optimizing && (
                <div className="img-overlay">
                  <div className="img-spinner"/>
                  <div className="img-overlay-t">Optimizando…</div>
                </div>
              )}
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
            {optInfo && (
              <div className={`img-optinfo ${optInfo.ratio > 0 ? 'reduced' : 'unchanged'}`}>
                {optInfo.ratio > 0 && <span className="opt-pct">−{optInfo.ratio}%</span>}
                <span>{optInfo.message}</span>
              </div>
            )}
          </div>

          <div className="ov-right">
            <div className="frow">
              <Field label="Nombre" v={form.name} onChange={v => upd('name', v)} placeholder="ej. Bardos Viñedos de Altura"/>
              <Field label="Marca" v={form.brand} onChange={v => upd('brand', v)}/>
            </div>
            <div className="frow">
              <Field
                label="Referencia (RP)"
                v={form.sku}
                onChange={v => upd('sku', v.toUpperCase())}
                mono
                placeholder="03TC316"
                hint="2 dígitos + 2 letras + 3 dígitos"
                maxLength={7}
              />
              <Field label="Categoría" type="select" v={form.cat} onChange={v => upd('cat', v)} opts={catOptions}/>
            </div>

            <div className="section-h">Dimensiones reales</div>
            <div className="frow">
              <Field label="Altura (cm)" v={form.h} onChange={v => upd('h', v)} mono num/>
              <Field label="Anchura (cm)" v={form.w} onChange={v => upd('w', v)} mono num/>
              <Field label="Profundidad (cm)" v={form.d} onChange={v => upd('d', v)} mono num/>
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

            <div className="section-h-row">
              <div className="section-h">Descripción visual (para el prompt de IA)</div>
              <button
                type="button"
                className={`ai-gen-btn ${form.descripcion_visual ? 'subtle' : ''}`}
                onClick={handleGenerateDesc}
                disabled={genDescBusy || (!pendingFile && !form.foto_path)}
                title={(!pendingFile && !form.foto_path) ? 'Sube una foto primero' : (form.descripcion_visual ? 'Regenerar a partir de la foto' : 'Generar a partir de la foto')}
              >
                {genDescBusy ? (
                  <span className="ai-spinner"/>
                ) : (
                  I.sparkle({ size: 12 })
                )}
                <span>{genDescBusy ? 'Generando…' : (form.descripcion_visual ? 'Regenerar con IA' : 'Generar con IA')}</span>
              </button>
            </div>
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

        .img-overlay{position:absolute;inset:0;background:rgba(250,250,247,.85);backdrop-filter:blur(4px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;z-index:6;border-radius:14px;animation:fadeIn .15s ease}
        .img-overlay-t{font-size:12.5px;font-weight:600;color:var(--ink-2);letter-spacing:.04em}
        .img-spinner{width:32px;height:32px;border-radius:50%;border:2.5px solid var(--accent-soft);border-top-color:var(--accent);animation:spin .9s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .img-drop.optimizing{cursor:wait}

        .img-optinfo{display:inline-flex;align-items:center;gap:8px;margin-top:10px;padding:6px 11px;border-radius:99px;font-size:11.5px;font-weight:500;background:var(--paper);border:1px solid var(--line);color:var(--ink-2)}
        .img-optinfo.reduced{background:rgba(58,122,90,.06);border-color:rgba(58,122,90,.3);color:#3a7a5a}
        .opt-pct{font-family:ui-monospace,Menlo,monospace;font-weight:700;font-size:11px}

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
        .section-h-row{display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px}
        .section-h-row .section-h{margin-top:0}

        .ai-gen-btn{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--accent);background:transparent;border:1px solid var(--accent-soft);cursor:pointer;font-weight:600;padding:5px 11px;border-radius:99px;transition:all .15s;letter-spacing:0;text-transform:none;font-family:inherit;white-space:nowrap}
        .ai-gen-btn:hover:not(:disabled){background:var(--accent-soft);border-color:var(--accent)}
        .ai-gen-btn:disabled{opacity:.4;cursor:not-allowed}
        .ai-gen-btn.subtle{font-size:11px;border-color:transparent;color:var(--muted);font-weight:500}
        .ai-gen-btn.subtle:hover:not(:disabled){color:var(--accent);border-color:var(--accent-soft)}
        .ai-spinner{width:11px;height:11px;border-radius:50%;border:1.5px solid var(--accent-soft);border-top-color:var(--accent);animation:spin .7s linear infinite;display:inline-block}
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

function Field({ label, v, onChange, type = 'text', opts, mono, num, placeholder, hint, maxLength }) {
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
          maxLength={maxLength}
        />
      )}
      {hint && <div className="field-hint">{hint}</div>}
      <style>{`
        .field{display:flex;flex-direction:column;gap:5px;min-width:0}
        .field label{font-size:11px;font-weight:600;color:var(--ink-2);letter-spacing:.2px}
        .field input,.field select{padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;font-size:13px;color:var(--ink);font-family:inherit;outline:none;transition:all .15s;width:100%}
        .field input:focus,.field select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .field .mono-in{font-variant-numeric:tabular-nums;letter-spacing:.3px}
        .field-hint{font-size:10.5px;color:var(--muted);font-style:italic;margin-top:1px;padding:0 2px}
      `}</style>
    </div>
  );
}
