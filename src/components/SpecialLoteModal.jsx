import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I } from './icons.jsx';
import { parseExcelOrder, parsePdfOrder, resolveOrder } from '../lib/parsers.js';
import { slugLoteEspecial } from '../lib/special-lotes.js';

// Genera los 3 PDFs de un lote que NO está en el catálogo.
//
// De dónde sale cada cosa:
//   · El listado de productos, del presupuesto que suben (PDF o Excel).
//     El PDF es mucho mejor: trae la referencia RP de cada producto, con lo
//     que las etiquetas traseras se encuentran exactas. El Excel solo trae
//     nombres, así que hay que emparejarlos contra el catálogo y alguno puede
//     quedarse sin etiqueta.
//   · La referencia, el título y el precio también salen del presupuesto; se
//     proponen rellenos y ellas los confirman o los corrigen.
//   · La foto la suben en el momento.
//
// Props:
//   open, products (catálogo), initial (lote guardado que se reedita)
//   existentes (los ya guardados, para no repetir nombre)
//   onClose, onGenerate({ ref, titulo, precio, productos, fotoFile, guardar, slug })
//
// El NOMBRE DEL LOTE es uno solo y manda en todo: es lo que se ve en la
// lista, lo que se busca y lo que da nombre a los PDFs y al ZIP. Antes había
// además un "nombre del fichero PDF" aparte y solo generaba dudas.
// "ALTADIA-1( PALETA IBERICA).pdf" → "ALTADIA-1"
function nombreDesdeFichero(name) {
  return String(name || '')
    .replace(/\.[^.]+$/, '')
    .split('(')[0]
    .replace(/[_]+/g, ' ')
    .trim();
}

export default function SpecialLoteModal({ open, products, initial, existentes, onClose, onGenerate }) {
  const [stage, setStage] = useState('upload');   // upload | leyendo | form
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const [ref, setRef] = useState('');
  const [titulo, setTitulo] = useState('');
  const [precio, setPrecio] = useState('');
  const [productos, setProductos] = useState([]);  // [{ ref, uds, descripcion }]
  const [guardar, setGuardar] = useState(true);

  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoDrag, setFotoDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  const inputRef = useRef(null);
  const fotoRef = useRef(null);

  // Al reeditar uno guardado se entra directamente al formulario.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setStage('form');
      setRef(initial.ref || '');
      setTitulo(initial.titulo || '');
      setPrecio(initial.precio != null ? Number(initial.precio).toFixed(2).replace('.', ',') : '');
      setProductos(initial.productos || []);
      setFotoPreview(initial.fotoUrl || null);
      setFotoFile(null);
      setFileName('');
      setGuardar(true);
    } else {
      reset();
    }
  }, [open, initial?.slug]);

  const reset = () => {
    setStage('upload'); setError(''); setFileName('');
    setRef(''); setTitulo(''); setPrecio('');
    setProductos([]); setFotoFile(null); setFotoPreview(null); setGuardar(true);
  };

  const close = () => { reset(); onClose && onClose(); };

  const conEtiqueta = useMemo(() => productos.filter(p => p.ref).length, [productos]);

  // Dos lotes especiales no pueden llamarse igual: el segundo pisaría al
  // primero (comparten nombre de fichero, de foto y de ficha guardada).
  const duplicado = useMemo(() => {
    const slug = slugLoteEspecial(ref);
    if (!slug) return null;
    return (existentes || []).find(l => l.slug === slug && l.slug !== initial?.slug) || null;
  }, [ref, existentes, initial?.slug]);

  // ---------- presupuesto ----------
  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setError('');
    const ext = file.name.toLowerCase().split('.').pop();
    const esPdf = ext === 'pdf' || file.type === 'application/pdf';
    const esExcel = ['xlsx', 'xls', 'xlsm'].includes(ext);
    if (!esPdf && !esExcel) {
      setError('Formato no soportado. Sube el presupuesto en PDF o el Excel de componentes.');
      return;
    }
    setStage('leyendo');
    try {
      const parsed = esPdf ? await parsePdfOrder(file) : await parseExcelOrder(file);
      const lineas = [];

      if ((parsed.items || []).some(it => it.ref)) {
        // Camino bueno: el presupuesto trae las referencias RP.
        for (const it of parsed.items) {
          if (!it.ref) continue;
          const p = (products || []).find(x => x.sku === it.ref);
          lineas.push({
            ref: it.ref,
            uds: it.qty || 1,
            descripcion: it.desc || p?.name || it.raw || it.ref,
          });
        }
      } else {
        // Sin referencias (el Excel de componentes): hay que emparejar por
        // nombre contra el catálogo para poder sacar las etiquetas.
        const { matched, unmatched } = resolveOrder(parsed, products || []);
        for (const m of matched) {
          lineas.push({ ref: m.sku, uds: m.qty || 1, descripcion: m.original?.name || m.name });
        }
        for (const u of unmatched) {
          lineas.push({ ref: null, uds: u.original?.qty || 1, descripcion: u.original?.name || u.original?.ref || '' });
        }
      }

      if (!lineas.length) {
        setStage('upload');
        setError('No se ha reconocido ningún producto en ese fichero.');
        return;
      }

      // El nombre sale de la referencia del presupuesto; si no viene, del
      // nombre del fichero ("ALTADIA-1( PALETA IBERICA).pdf" → "ALTADIA-1").
      const refProp = parsed.referencia || parsed.lote || nombreDesdeFichero(file.name);
      setRef(refProp);
      setTitulo(parsed.titulo || parsed.title || '');
      setPrecio(parsed.precio != null ? parsed.precio.toFixed(2).replace('.', ',') : '');
      setProductos(lineas);
      setStage('form');
    } catch (e) {
      setStage('upload');
      setError(e?.message || 'No se ha podido leer el fichero.');
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer?.files?.[0]);
  };

  // ---------- foto ----------
  const handleFoto = (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      setError('La foto tiene que ser JPG, PNG o WEBP.');
      return;
    }
    setError('');
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  const quitarLinea = (i) => setProductos(l => l.filter((_, k) => k !== i));
  const cambiarUds = (i, v) => setProductos(l => l.map((p, k) =>
    k === i ? { ...p, uds: Math.max(1, Math.min(99, parseInt(v, 10) || 1)) } : p));

  const generar = async () => {
    if (busy) return;
    if (!ref.trim()) { setError('Ponle un nombre al lote (por ejemplo ALTADIA-1).'); return; }
    if (duplicado) { setError(`Ya hay un lote especial llamado «${duplicado.ref}». Ponle otro nombre.`); return; }
    if (!productos.length) { setError('No hay productos en el lote.'); return; }
    const n = precio.trim() ? Number(precio.replace(/\./g, '').replace(',', '.')) : null;
    if (precio.trim() && (!isFinite(n) || n < 0)) { setError('El precio no se entiende. Escríbelo como 100,00.'); return; }
    setError('');
    setBusy(true);
    try {
      await onGenerate?.({
        slug: initial?.slug || slugLoteEspecial(ref),
        ref: ref.trim(),
        titulo: titulo.trim() || `LOTE ESPECIAL ${ref.trim()}`,
        nombrePdf: `${ref.trim()}.pdf`,
        precio: n,
        productos,
        fotoFile,
        fotoPath: initial?.fotoPath || null,
        guardar,
      });
    } catch (e) {
      setError(e?.message || 'No se han podido generar los PDFs.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="sl-back" onClick={close}>
      <div className="sl-modal" onClick={e => e.stopPropagation()}>
        <button className="sl-close" onClick={close} aria-label="Cerrar">{I.close({ size: 18 })}</button>

        <header className="sl-head">
          <div className="sl-eye">Lote especial</div>
          <h2 className="sl-title">
            {stage === 'upload' && 'Sube el presupuesto del lote'}
            {stage === 'leyendo' && 'Leyendo el presupuesto…'}
            {stage === 'form' && (initial ? `Lote ${initial.ref}` : 'Revisa y genera')}
          </h2>
          <p className="sl-sub">
            {stage === 'upload' && 'Mejor el PDF del presupuesto: trae la referencia de cada producto y salen todas las etiquetas.'}
            {stage === 'leyendo' && fileName}
            {stage === 'form' && 'Comprueba que los datos son correctos y añade la foto del lote.'}
          </p>
        </header>

        {stage === 'upload' && (
          <div className="sl-body">
            <div
              className={`sl-drop ${dragOver ? 'over' : ''}`}
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => inputRef.current?.click()}
            >
              <div className="sl-drop-i">{I.upload({ size: 28 })}</div>
              <div className="sl-drop-t">Arrastra aquí el presupuesto</div>
              <div className="sl-drop-s">PDF (recomendado) o Excel de componentes</div>
              <input
                ref={inputRef} type="file" accept=".pdf,.xlsx,.xls,.xlsm" hidden
                onChange={e => handleFile(e.target.files?.[0])}
              />
            </div>
            {error && <div className="sl-err">{error}</div>}
          </div>
        )}

        {stage === 'leyendo' && (
          <div className="sl-body sl-busy">
            <div className="sl-spin"/>
            <div>Buscando los productos…</div>
          </div>
        )}

        {stage === 'form' && (
          <div className="sl-body">
            <div className="sl-grid">
              <div className="sl-field">
                <label className="sl-label">Nombre del lote</label>
                <input
                  className={`sl-input ${duplicado ? 'mal' : ''}`}
                  value={ref}
                  onChange={e => setRef(e.target.value)}
                  placeholder="ALTADIA-1"
                />
              </div>
              <div className="sl-field">
                <label className="sl-label">Precio sin IVA <span className="sl-opt">(opcional)</span></label>
                <input className="sl-input" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="100,00" inputMode="decimal"/>
              </div>
            </div>

            <div className="sl-field">
              <label className="sl-label">Título dentro del PDF</label>
              <input className="sl-input" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="LOTE ESP. ALTADIA-1 ( PALETA IBÉRICA )"/>
            </div>

            <div className="sl-hint sl-nombre-hint">
              {duplicado
                ? <span className="sl-dup">Ya hay un lote especial que se llama «{duplicado.ref}». Ponle otro nombre.</span>
                : <>Los PDFs saldrán como <strong>{(ref || 'NOMBRE').trim()}.pdf</strong> y <strong>{(ref || 'NOMBRE').trim()} - Etiquetas.pdf</strong>.</>}
            </div>

            <div className="sl-field">
              <label className="sl-label">Foto del lote</label>
              <div
                className={`sl-foto ${fotoDrag ? 'over' : ''} ${fotoPreview ? 'has' : ''}`}
                onDrop={e => { e.preventDefault(); setFotoDrag(false); handleFoto(e.dataTransfer?.files?.[0]); }}
                onDragOver={e => { e.preventDefault(); setFotoDrag(true); }}
                onDragLeave={() => setFotoDrag(false)}
                onClick={() => fotoRef.current?.click()}
              >
                {fotoPreview
                  ? <img src={fotoPreview} alt=""/>
                  : <><div className="sl-drop-i">{I.upload({ size: 20 })}</div><div className="sl-drop-s">Arrastra la foto o pulsa aquí</div></>}
                <input ref={fotoRef} type="file" accept="image/*" hidden onChange={e => handleFoto(e.target.files?.[0])}/>
              </div>
              {!fotoPreview && <div className="sl-hint">Sin foto el PDF se genera igual, pero sale sin imagen.</div>}
            </div>

            <div className="sl-sec">
              Productos <span className="sl-count">{productos.length}</span>
              <span className="sl-note">{conEtiqueta} con referencia</span>
            </div>
            <div className="sl-list">
              {productos.map((p, i) => (
                <div key={i} className={`sl-item ${p.ref ? '' : 'sin'}`}>
                  <input
                    className="sl-uds"
                    value={p.uds}
                    onChange={e => cambiarUds(i, e.target.value)}
                    inputMode="numeric"
                    aria-label="Unidades"
                  />
                  <span className="sl-ref">{p.ref || '—'}</span>
                  <span className="sl-desc">{p.descripcion}</span>
                  <button className="sl-x" onClick={() => quitarLinea(i)} aria-label="Quitar">{I.close({ size: 13 })}</button>
                </div>
              ))}
            </div>
            <div className="sl-hint" style={{ marginTop: 8 }}>
              Quita con la × lo que no deba salir en el PDF (cajas, asas, felicitaciones…).
            </div>
            {conEtiqueta < productos.length && (
              <div className="sl-hint">
                Los que salen con «—» no tienen referencia, así que no llevarán etiqueta trasera. Sí aparecen en el listado del PDF.
              </div>
            )}

            {!initial && (
              <label className="sl-check">
                <input type="checkbox" checked={guardar} onChange={e => setGuardar(e.target.checked)}/>
                <span>Guardarlo para poder regenerarlo sin volver a subir nada</span>
              </label>
            )}

            {error && <div className="sl-err">{error}</div>}
          </div>
        )}

        {stage === 'form' && (
          <footer className="sl-foot">
            <button className="sl-btn sl-ghost" onClick={initial ? close : () => setStage('upload')} disabled={busy}>
              {initial ? 'Cancelar' : 'Atrás'}
            </button>
            <button className="sl-btn sl-primary" onClick={generar} disabled={busy || !productos.length || !!duplicado}>
              {busy ? 'Generando…' : <>{I.download ? I.download({ size: 14 }) : null} Generar los 3 PDFs</>}
            </button>
          </footer>
        )}

        <style>{`
          .sl-back{position:fixed;inset:0;background:rgba(20,16,12,.62);backdrop-filter:blur(10px);z-index:620;display:grid;place-items:center;padding:24px;animation:fadeIn .2s ease}
          .sl-modal{position:relative;background:#FAFAF7;border-radius:18px;width:min(760px,96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 40px 90px -20px rgba(0,0,0,.4);animation:popIn .3s cubic-bezier(.2,.8,.2,1)}
          .sl-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.9);border:1px solid var(--line);color:var(--ink);z-index:10;cursor:pointer}
          .sl-head{padding:26px 28px 14px;border-bottom:1px solid var(--line);background:#fff}
          .sl-eye{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:700}
          .sl-title{font-family:'Fraunces',serif;font-size:23px;font-weight:500;color:var(--ink);margin:4px 0 0}
          .sl-sub{font-size:12.5px;color:var(--muted);margin:5px 0 0;line-height:1.5}
          .sl-body{padding:20px 28px;overflow-y:auto;flex:1;min-height:0}
          .sl-busy{display:flex;flex-direction:column;align-items:center;gap:12px;padding:48px;color:var(--muted);font-size:13px}
          .sl-spin{width:26px;height:26px;border:2.5px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}
          @keyframes spin{to{transform:rotate(360deg)}}

          .sl-drop{border:1.5px dashed var(--line);border-radius:14px;padding:38px 20px;text-align:center;cursor:pointer;transition:all .15s;background:#fff}
          .sl-drop:hover,.sl-drop.over{border-color:var(--accent);background:var(--accent-soft)}
          .sl-drop-i{display:grid;place-items:center;width:52px;height:52px;margin:0 auto 10px;border-radius:50%;background:var(--accent-soft);color:var(--accent)}
          .sl-drop-t{font-size:14px;font-weight:600;color:var(--ink)}
          .sl-drop-s{font-size:12px;color:var(--muted);margin-top:4px}

          .sl-grid{display:grid;grid-template-columns:1fr 200px;gap:14px}
          .sl-field{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
          .sl-label{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700}
          .sl-opt{font-weight:400;text-transform:none;letter-spacing:0}
          .sl-input{font-family:inherit;font-size:13.5px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px;outline:none;transition:all .15s}
          .sl-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
          .sl-hint{font-size:11.5px;color:var(--muted);line-height:1.45}
          .sl-nombre-hint{margin:-10px 0 16px}
          .sl-dup{color:var(--accent);font-weight:600}
          .sl-input.mal{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}

          .sl-foto{border:1.5px dashed var(--line);border-radius:12px;padding:18px;text-align:center;cursor:pointer;background:#fff;transition:all .15s}
          .sl-foto:hover,.sl-foto.over{border-color:var(--accent);background:var(--accent-soft)}
          .sl-foto.has{padding:8px}
          .sl-foto img{max-height:150px;max-width:100%;object-fit:contain;border-radius:8px;display:block;margin:0 auto}

          .sl-sec{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:6px 0 8px;display:flex;align-items:center;gap:8px}
          .sl-count{background:var(--accent-soft);color:var(--accent);border-radius:99px;padding:2px 8px;letter-spacing:0}
          .sl-note{margin-left:auto;text-transform:none;letter-spacing:0;font-weight:500;font-size:11px}
          .sl-list{border:1px solid var(--line);border-radius:12px;background:#fff;overflow:hidden;max-height:230px;overflow-y:auto}
          .sl-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--line);font-size:12.5px}
          .sl-item:last-child{border-bottom:none}
          .sl-item.sin{background:#fdf7f4}
          .sl-uds{width:34px;flex-shrink:0;text-align:center;font-family:inherit;font-size:12.5px;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:3px 2px;outline:none;font-variant-numeric:tabular-nums}
          .sl-uds:focus{border-color:var(--accent);background:#fff}
          .sl-ref{font-family:ui-monospace,monospace;font-size:11px;color:var(--accent);min-width:64px}
          .sl-desc{flex:1;min-width:0;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
          .sl-x{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:transparent;border:none;color:var(--muted);cursor:pointer}
          .sl-x:hover{background:var(--accent-soft);color:var(--accent)}

          .sl-check{display:flex;align-items:center;gap:9px;margin-top:16px;font-size:12.5px;color:var(--ink);cursor:pointer}
          .sl-err{margin-top:12px;font-size:12.5px;color:var(--accent);font-weight:600;line-height:1.45}

          .sl-foot{display:flex;gap:8px;padding:14px 28px;border-top:1px solid var(--line);background:#fff;flex-shrink:0}
          .sl-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;border:1px solid transparent;transition:all .15s}
          .sl-btn:disabled{opacity:.5;cursor:not-allowed}
          .sl-ghost{background:#fff;color:var(--ink-2);border-color:var(--line)}
          .sl-primary{background:var(--accent);color:#fff;flex:1}
          .sl-primary:hover:not(:disabled){background:var(--accent-2)}

          @media (max-width:700px){ .sl-grid{grid-template-columns:1fr} }
        `}</style>
      </div>
    </div>
  );
}
