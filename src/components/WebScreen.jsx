import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { I } from './icons.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import FilesGridModal from './FilesGridModal.jsx';
import {
  uploadEtiqueta, uploadLotePhoto, uploadMasterExcel,
  listEtiquetas, listLotePhotos, deleteEtiqueta, deleteLotePhoto,
  getMasterExcelInfo, fetchMasterExcelBuffer,
  getEtiquetaUrlByRef, getLotePhotoUrl,
  listLoteMetadata, getLoteMetadata, getSyncStatus, triggerScrape,
  ALLOWED_LABEL_EXTS, ALLOWED_LOTE_EXTS, ALLOWED_EXCEL_EXTS,
} from '../lib/web-files.js';
import { generateEtiquetasPDF, generateDescripcionPDF } from '../lib/pdf-lotes.js';
import { SUPABASE_READY } from '../lib/supabase.js';

// Helpers de formato
function formatDate(iso) {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

// Parsea "104, 105, 200-205, 300" → ['104','105','200','201','202','203','204','205','300']
function parseLoteInput(str) {
  if (!str) return [];
  const out = [];
  const seen = new Set();
  for (const raw of String(str).split(/[,;\s]+/)) {
    const s = raw.trim();
    if (!s) continue;
    const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      if (isFinite(a) && isFinite(b) && a <= b && b - a <= 200) {
        for (let n = a; n <= b; n++) {
          const key = String(n);
          if (!seen.has(key)) { seen.add(key); out.push(key); }
        }
      }
    } else if (/^\d+$/.test(s)) {
      if (!seen.has(s)) { seen.add(s); out.push(s); }
    }
  }
  return out;
}

// Del sheet de un lote saca [{ ref, uds, descripcion }].
function readLoteSheet(workbook, loteNum) {
  const name = String(loteNum);
  const ws = workbook.Sheets[name];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  const productos = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    // Columnas: 0 = ART/RP, 1 = UDS., 2 = DESCRIPCION
    const ref = r[0] ? String(r[0]).trim().toUpperCase() : '';
    const uds = Number(r[1]) || 1;
    const descripcion = r[2] ? String(r[2]).trim() : '';
    if (!ref && !descripcion) continue;
    productos.push({ ref, uds, descripcion });
  }
  return productos;
}

export default function WebScreen({ showInfo }) {
  // ---- Excel maestro ----
  const [excel, setExcel] = useState(null);       // { path, url, size, updatedAt }
  const [excelBuffer, setExcelBuffer] = useState(null);
  const [excelWorkbook, setExcelWorkbook] = useState(null);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [dragOverExcel, setDragOverExcel] = useState(false);

  // ---- Etiquetas ----
  const [etiquetas, setEtiquetas] = useState([]);
  const [dragOverEt, setDragOverEt] = useState(false);
  const [uploadingEt, setUploadingEt] = useState({ total: 0, done: 0, errors: [] });

  // ---- Fotos de lotes ----
  const [lotePhotos, setLotePhotos] = useState([]);
  const [dragOverLo, setDragOverLo] = useState(false);
  const [uploadingLo, setUploadingLo] = useState({ total: 0, done: 0, errors: [] });

  // ---- Generación de PDF ----
  const [loteInput, setLoteInput] = useState('');
  const [generating, setGenerating] = useState(null); // 'etiquetas' | 'descripcion' | null
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
  const [pdfs, setPdfs] = useState([]);              // [{ id, type, numero, filename, blob, url }]

  // ---- Listado ampliado (modales) ----
  const [showEtiquetasList, setShowEtiquetasList] = useState(false);
  const [showLotesList, setShowLotesList] = useState(false);

  // ---- Metadata de web (títulos + descripciones) ----
  const [loteMetadata, setLoteMetadata] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null); // { status, done, total, upserted, errors, message, ... }
  const [syncing, setSyncing] = useState(false);

  // ---- Carga inicial ----
  useEffect(() => {
    (async () => {
      try {
        const info = await getMasterExcelInfo();
        setExcel(info);
        if (info) {
          const buf = await fetchMasterExcelBuffer();
          setExcelBuffer(buf);
          setExcelWorkbook(XLSX.read(buf, { type: 'array' }));
        }
      } catch (e) { console.warn('Excel maestro no disponible:', e); }
      try {
        setEtiquetas(await listEtiquetas());
        setLotePhotos(await listLotePhotos());
      } catch (e) { console.warn(e); }
      try {
        setLoteMetadata(await listLoteMetadata());
        setSyncStatus(await getSyncStatus());
      } catch (e) { console.warn(e); }
    })();
  }, []);

  // Polling del estado de sincronización mientras está corriendo.
  useEffect(() => {
    if (syncStatus?.status !== 'running') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const st = await getSyncStatus();
        if (cancelled) return;
        setSyncStatus(st);
        if (st?.status === 'done' || st?.status === 'failed') {
          setSyncing(false);
          // Refrescar los metadatos completos al terminar
          try { setLoteMetadata(await listLoteMetadata()); } catch {}
          return;
        }
      } catch (e) { console.warn(e); }
      if (!cancelled) setTimeout(tick, 2500);
    };
    const t = setTimeout(tick, 2000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [syncStatus?.status]);

  const loteMetadataMap = useMemo(() => {
    const m = new Map();
    for (const row of loteMetadata) m.set(String(row.numero), row);
    return m;
  }, [loteMetadata]);

  const excelSheetsSet = useMemo(() => new Set(excelWorkbook?.SheetNames || []), [excelWorkbook]);

  // ---- Subida Excel ----
  const handleExcelFile = async (file) => {
    if (!file) return;
    setUploadingExcel(true);
    try {
      const res = await uploadMasterExcel(file);
      if (!res.ok) throw new Error(res.error);
      const info = await getMasterExcelInfo();
      setExcel(info);
      const buf = await file.arrayBuffer();
      setExcelBuffer(buf);
      setExcelWorkbook(XLSX.read(buf, { type: 'array' }));
      showInfo?.({
        icon: 'check', tone: 'info',
        title: 'Excel actualizado',
        description: `Se ha sustituido el catálogo maestro (${res.originalName || file.name}).`,
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
    } catch (e) {
      showInfo?.({
        icon: 'trash', tone: 'danger',
        title: 'Error subiendo el Excel',
        description: e.message,
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
    } finally { setUploadingExcel(false); }
  };

  // ---- Subida Etiquetas (batch) ----
  const handleEtiquetasFiles = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    setUploadingEt({ total: list.length, done: 0, errors: [] });
    const errors = [];
    for (let i = 0; i < list.length; i++) {
      try {
        const res = await uploadEtiqueta(list[i]);
        if (!res.ok) errors.push({ name: list[i].name, error: res.error });
      } catch (e) {
        errors.push({ name: list[i].name, error: e.message });
      }
      setUploadingEt(s => ({ ...s, done: i + 1 }));
    }
    setUploadingEt({ total: 0, done: 0, errors });
    try { setEtiquetas(await listEtiquetas()); } catch {}
    if (errors.length) {
      showInfo?.({
        icon: 'trash', tone: 'danger',
        title: `Se subieron ${list.length - errors.length}/${list.length} etiquetas`,
        description: (
          <>
            No se pudieron subir <strong>{errors.length}</strong>. Los primeros:
            <br/>{errors.slice(0, 5).map((e, i) => <span key={i}>· {e.name}: {e.error}<br/></span>)}
          </>
        ),
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
    }
  };

  // ---- Subida Fotos de Lotes (batch) ----
  const handleLotePhotosFiles = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    setUploadingLo({ total: list.length, done: 0, errors: [] });
    const errors = [];
    for (let i = 0; i < list.length; i++) {
      try {
        const res = await uploadLotePhoto(list[i]);
        if (!res.ok) errors.push({ name: list[i].name, error: res.error });
      } catch (e) {
        errors.push({ name: list[i].name, error: e.message });
      }
      setUploadingLo(s => ({ ...s, done: i + 1 }));
    }
    setUploadingLo({ total: 0, done: 0, errors });
    try { setLotePhotos(await listLotePhotos()); } catch {}
    if (errors.length) {
      showInfo?.({
        icon: 'trash', tone: 'danger',
        title: `Se subieron ${list.length - errors.length}/${list.length} fotos`,
        description: (
          <>
            No se pudieron subir <strong>{errors.length}</strong>.
            <br/>{errors.slice(0, 5).map((e, i) => <span key={i}>· {e.name}: {e.error}<br/></span>)}
          </>
        ),
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
    }
  };

  // ---- Generar PDFs ----
  const doGenerate = async (kind) => {
    if (!excelWorkbook) {
      showInfo?.({
        icon: 'excel', tone: 'info',
        title: 'Falta el Excel maestro',
        description: 'Sube primero el Excel con los textos del catálogo.',
        confirmLabel: 'Entendido', confirmTone: 'neutral',
      });
      return;
    }
    const numeros = parseLoteInput(loteInput);
    if (!numeros.length) {
      showInfo?.({
        icon: 'sparkle', tone: 'info',
        title: 'Introduce un número de lote',
        description: 'Ejemplos: 104   ·   104, 105   ·   200-205, 300',
        confirmLabel: 'Entendido', confirmTone: 'neutral',
      });
      return;
    }
    // Filtramos números que existen en el Excel
    const validos = numeros.filter(n => excelSheetsSet.has(n));
    const invalidos = numeros.filter(n => !excelSheetsSet.has(n));

    if (!validos.length) {
      showInfo?.({
        icon: 'excel', tone: 'info',
        title: 'Ninguno de los números está en el Excel',
        description: `No se encontraron pestañas para: ${invalidos.join(', ')}`,
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
      return;
    }

    setGenerating(kind);
    setGenProgress({ current: 0, total: validos.length });
    const results = [];
    for (let i = 0; i < validos.length; i++) {
      const num = validos[i];
      setGenProgress({ current: i, total: validos.length });
      const productos = readLoteSheet(excelWorkbook, num) || [];
      let blob;
      try {
        if (kind === 'etiquetas') {
          // Enriquecer con URL de la etiqueta por RP
          const withUrls = await Promise.all(
            productos.map(async (p) => ({
              ...p,
              url: p.ref ? await getEtiquetaUrlByRef(p.ref) : null,
            }))
          );
          blob = await generateEtiquetasPDF({ loteNumero: num, productos: withUrls });
        } else {
          const fotoUrl = await getLotePhotoUrl(num);
          const meta = loteMetadataMap.get(String(num));
          blob = await generateDescripcionPDF({
            loteNumero: num,
            tituloLote: meta?.titulo || `Lote de Navidad surtido ${num}`,
            descripcionLote: meta?.descripcion || null,
            loteFotoUrl: fotoUrl,
            productos,
          });
        }
        const filename = kind === 'etiquetas'
          ? `Lote-${num}-etiquetas.pdf`
          : `Lote-${num}-descripcion.pdf`;
        const url = URL.createObjectURL(blob);
        results.push({ id: `${kind}-${num}-${Date.now()}-${i}`, type: kind, numero: num, filename, blob, url });
      } catch (e) {
        console.error('PDF gen error para lote', num, e);
        results.push({ id: `${kind}-${num}-${Date.now()}-${i}-err`, type: kind, numero: num, error: e.message });
      }
    }
    setGenProgress({ current: validos.length, total: validos.length });
    setPdfs(ps => [...results, ...ps]);
    setGenerating(null);
    setGenProgress({ current: 0, total: 0 });

    if (invalidos.length) {
      showInfo?.({
        icon: 'excel', tone: 'info',
        title: 'Algunos lotes no están en el Excel',
        description: `Se han generado los válidos. Números no encontrados: ${invalidos.join(', ')}`,
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
    }
  };

  const downloadOne = (pdf) => {
    if (!pdf.url) return;
    const a = document.createElement('a');
    a.href = pdf.url; a.download = pdf.filename;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const downloadAllZip = async () => {
    const withBlob = pdfs.filter(p => p.blob);
    if (!withBlob.length) return;
    const zip = new JSZip();
    for (const p of withBlob) {
      zip.file(p.filename, p.blob);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url; a.download = `PDFs-lotes-${new Date().toISOString().slice(0,10)}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const clearPdfs = () => {
    pdfs.forEach(p => { if (p.url) try { URL.revokeObjectURL(p.url); } catch {} });
    setPdfs([]);
  };

  // ---- Sincronizar con la web ----
  const handleSync = async () => {
    setSyncing(true);
    try {
      await triggerScrape();
      // Ponemos un estado optimista para que el polling arranque; la función
      // real actualizará settings.lote_metadata_sync inmediatamente.
      setSyncStatus({ status: 'running', message: 'Iniciando…', total: 0, done: 0 });
    } catch (e) {
      setSyncing(false);
      showInfo?.({
        icon: 'trash', tone: 'danger',
        title: 'No se pudo iniciar la sincronización',
        description: e.message,
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
    }
  };

  // ---- Borrado desde el listado modal ----
  const handleDeleteEtiqueta = async (item) => {
    const res = await deleteEtiqueta(item.path);
    if (!res.ok) throw new Error(res.error || 'Error borrando la etiqueta.');
    setEtiquetas(await listEtiquetas());
  };
  const handleDeleteLotePhoto = async (item) => {
    const res = await deleteLotePhoto(item.path);
    if (!res.ok) throw new Error(res.error || 'Error borrando la foto.');
    setLotePhotos(await listLotePhotos());
  };

  // ---- Render ----
  return (
    <section className="screen wide web-screen">
      <header className="cat-head">
        <div>
          <h1 className="cat-title">Web</h1>
          <p className="cat-sub">Sube etiquetas y fotos de lotes, y genera PDFs a partir del catálogo Excel maestro.</p>
        </div>
      </header>

      {!SUPABASE_READY && (
        <div className="web-warn">
          Supabase no está conectado. En modo demo la subida de ficheros no persiste.
        </div>
      )}

      {/* ---- 1. Excel del catálogo ---- */}
      <div className="web-block">
        <div className="web-blockh">
          <h3>Excel del catálogo</h3>
          <p>Documento con los textos y el listado de productos por lote. Al subir uno nuevo, se sustituye al anterior.</p>
        </div>
        <div className="excel-row">
          <div className="excel-info">
            {excel ? (
              <>
                <div className="excel-name">
                  {I.excel({ size: 18 })}
                  <span>master-catalog.xlsx</span>
                </div>
                <div className="excel-meta">
                  Actualizado {formatDate(excel.updatedAt)} · {formatBytes(excel.size)}
                  {excelWorkbook && ` · ${excelWorkbook.SheetNames.length} hojas (lotes)`}
                </div>
              </>
            ) : (
              <>
                <div className="excel-name empty">
                  {I.excel({ size: 18 })}
                  <span>Sin Excel subido todavía</span>
                </div>
                <div className="excel-meta">Sube el Excel para poder generar PDFs.</div>
              </>
            )}
          </div>
          <label
            className={`excel-drop ${dragOverExcel ? 'over' : ''} ${uploadingExcel ? 'busy' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOverExcel(true); }}
            onDragLeave={() => setDragOverExcel(false)}
            onDrop={(e) => { e.preventDefault(); setDragOverExcel(false); const f = e.dataTransfer.files?.[0]; if (f) handleExcelFile(f); }}
          >
            {I.upload({ size: 14 })}
            {uploadingExcel ? 'Subiendo…' : (excel ? 'Sustituir Excel' : 'Subir Excel')}
            <input type="file" accept=".xlsx,.xlsm,.xls" onChange={(e) => handleExcelFile(e.target.files?.[0])} hidden />
          </label>
        </div>
      </div>

      {/* ---- 2 + 3. Etiquetas & Fotos de lotes (2 columnas) ---- */}
      <div className="web-two-col">
        <div className="web-block">
          <div className="web-blockh">
            <h3>Etiquetas traseras</h3>
            <p>Fotos PNG/JPG/WEBP/PDF nombradas por la referencia del producto (ej. <code>06AC044.png</code>). Al subir otra con la misma referencia se reescribe.</p>
          </div>
          <UploadDrop
            label="Arrastra aquí etiquetas o pulsa para seleccionar"
            hint="Formato admitido: PNG · JPG · WEBP · PDF"
            accept={ALLOWED_LABEL_EXTS.map(e => '.' + e).join(',')}
            onFiles={handleEtiquetasFiles}
            multiple
            dragOver={dragOverEt}
            setDragOver={setDragOverEt}
            progress={uploadingEt}
          />
          <div className="web-count-row">
            <span>{etiquetas.length} etiqueta{etiquetas.length === 1 ? '' : 's'} guardada{etiquetas.length === 1 ? '' : 's'}</span>
            {etiquetas.length > 0 && (
              <button className="btn btn-ghost" onClick={() => setShowEtiquetasList(true)}>
                {I.catalog({ size: 14 })} Ver listado
              </button>
            )}
          </div>
        </div>

        <div className="web-block">
          <div className="web-blockh">
            <h3>Fotos de lotes</h3>
            <p>Fotos de los lotes ya montados. El número se extrae del nombre del fichero (ej. <code>lote-de-navidad-surtido-<b>216</b>.jpg</code>) y se renombra a <code>216.jpg</code>.</p>
          </div>
          <UploadDrop
            label="Arrastra aquí fotos de lotes o pulsa para seleccionar"
            hint="Formato admitido: PNG · JPG · WEBP · PDF"
            accept={ALLOWED_LOTE_EXTS.map(e => '.' + e).join(',')}
            onFiles={handleLotePhotosFiles}
            multiple
            dragOver={dragOverLo}
            setDragOver={setDragOverLo}
            progress={uploadingLo}
          />
          <div className="web-count-row">
            <span>{lotePhotos.length} foto{lotePhotos.length === 1 ? '' : 's'} guardada{lotePhotos.length === 1 ? '' : 's'}</span>
            {lotePhotos.length > 0 && (
              <button className="btn btn-ghost" onClick={() => setShowLotesList(true)}>
                {I.catalog({ size: 14 })} Ver listado
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- 3.5 Sincronización con la web ---- */}
      <div className="web-block">
        <div className="web-blockh">
          <h3>Títulos y descripciones desde lotesdeespana.es</h3>
          <p>Al pulsar el botón, el sistema descarga los títulos y descripciones actuales de cada lote desde la web y los usa en los PDFs de descripción. Tarda 2-4 min. Puedes seguir usando la app mientras tanto.</p>
        </div>
        <div className="sync-row">
          <div className="sync-info">
            <div className="sync-eye">Estado</div>
            <div className="sync-stat">
              {syncStatus?.status === 'running'
                ? <>Sincronizando · {syncStatus.done || 0} de {syncStatus.total || '…'}</>
                : loteMetadata.length > 0
                  ? <>{loteMetadata.length} lotes con metadatos guardados</>
                  : 'Nunca sincronizado'}
            </div>
            {syncStatus?.finished_at && syncStatus?.status !== 'running' && (
              <div className="sync-meta">
                Última sincronización: {formatDate(syncStatus.finished_at)}
                {syncStatus.errors > 0 && ` · ${syncStatus.errors} errores`}
              </div>
            )}
            {syncStatus?.message && syncStatus?.status === 'running' && (
              <div className="sync-meta">{syncStatus.message}</div>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSync}
            disabled={syncing || syncStatus?.status === 'running'}
          >
            {(syncing || syncStatus?.status === 'running')
              ? <><span className="mini-spin"/>Sincronizando…</>
              : <>{I.refresh({ size: 14 })} Sincronizar con la web</>}
          </button>
        </div>
      </div>

      {/* ---- 4. Generar PDFs ---- */}
      <div className="web-block">
        <div className="web-blockh">
          <h3>Generar PDFs desde el Excel</h3>
          <p>Introduce el número (o varios) de lote y elige qué PDF generar. Puedes usar comas, espacios y rangos.</p>
        </div>
        <div className="lote-input-row">
          <input
            className="lote-input"
            type="text"
            placeholder="Ej: 104   ·   104, 105   ·   200-205, 300"
            value={loteInput}
            onChange={(e) => setLoteInput(e.target.value)}
            disabled={!!generating}
          />
        </div>
        <div className="gen-btns">
          <button
            className="btn btn-primary"
            onClick={() => doGenerate('etiquetas')}
            disabled={!excelWorkbook || !!generating || !loteInput.trim()}
          >
            {I.download({ size: 14 })}
            {generating === 'etiquetas'
              ? `Generando ${genProgress.current + 1}/${genProgress.total}…`
              : 'Generar PDF etiquetas'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => doGenerate('descripcion')}
            disabled={!excelWorkbook || !!generating || !loteInput.trim()}
          >
            {I.download({ size: 14 })}
            {generating === 'descripcion'
              ? `Generando ${genProgress.current + 1}/${genProgress.total}…`
              : 'Generar PDF descripción'}
          </button>
        </div>

        <FilesGridModal
          open={showEtiquetasList}
          onClose={() => setShowEtiquetasList(false)}
          title="Etiquetas guardadas"
          items={etiquetas.map(e => ({
            id: e.path,
            label: e.ref,
            url: e.url,
            size: e.size,
            updatedAt: e.updatedAt,
            path: e.path,
            isPdf: /\.pdf$/i.test(e.path),
          }))}
          onDelete={handleDeleteEtiqueta}
          searchPlaceholder="Buscar por referencia…"
          emptyText="Aún no has subido ninguna etiqueta."
        />
        <FilesGridModal
          open={showLotesList}
          onClose={() => setShowLotesList(false)}
          title="Fotos de lotes guardadas"
          items={lotePhotos.map(p => ({
            id: p.path,
            label: `Lote ${p.numero}`,
            url: p.url,
            size: p.size,
            updatedAt: p.updatedAt,
            path: p.path,
            isPdf: /\.pdf$/i.test(p.path),
          }))}
          onDelete={handleDeleteLotePhoto}
          searchPlaceholder="Buscar por nº de lote…"
          emptyText="Aún no has subido ninguna foto de lote."
        />

        {pdfs.length > 0 && (
          <div className="pdfs-section">
            <div className="pdfs-header">
              <h4>PDFs generados en esta sesión ({pdfs.length})</h4>
              <div className="pdfs-actions">
                {pdfs.filter(p => p.blob).length > 1 && (
                  <button className="btn btn-ghost" onClick={downloadAllZip}>
                    {I.download({ size: 13 })} Descargar todos (ZIP)
                  </button>
                )}
                <button className="btn btn-ghost" onClick={clearPdfs}>
                  {I.trash({ size: 13 })} Limpiar
                </button>
              </div>
            </div>
            <div className="pdfs-list">
              {pdfs.map(p => (
                <div key={p.id} className={`pdf-row ${p.error ? 'err' : ''}`}>
                  <div className="pdf-info">
                    <div className="pdf-name">
                      Lote {p.numero} · {p.type === 'etiquetas' ? 'Etiquetas traseras' : 'Descripción'}
                    </div>
                    <div className="pdf-meta">
                      {p.error ? <span style={{ color: 'var(--accent)' }}>Error: {p.error}</span> : p.filename}
                    </div>
                  </div>
                  {!p.error && (
                    <button className="btn btn-ghost" onClick={() => downloadOne(p)}>
                      {I.download({ size: 13 })} Descargar
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .screen{flex:1;min-width:0;padding:38px 56px 56px 64px;display:flex;flex-direction:column;gap:22px;overflow-y:auto;height:100vh;width:100%}
        .web-screen .cat-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap}
        .cat-title{font-family:'Fraunces',serif;font-weight:400;font-size:46px;line-height:1;letter-spacing:-.02em;color:var(--ink);margin:0}
        .cat-sub{margin:12px 0 0;color:var(--muted);font-size:14px;line-height:1.55}

        .web-warn{padding:12px 16px;background:rgba(167,77,74,.08);border:1px solid var(--accent);color:var(--accent);font-size:12.5px;border-radius:12px;font-weight:600}

        .web-block{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px 26px;display:flex;flex-direction:column;gap:14px}
        .web-two-col{display:grid;grid-template-columns:1fr 1fr;gap:22px}
        @media (max-width:1100px){ .web-two-col{grid-template-columns:1fr} }
        .web-blockh h3{font-family:'Fraunces',serif;font-weight:500;font-size:22px;color:var(--ink);letter-spacing:-.01em;margin:0 0 4px}
        .web-blockh p{margin:0;font-size:13px;color:var(--muted);line-height:1.5;max-width:820px}
        .web-blockh code{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:12px;background:var(--bg);padding:1px 6px;border-radius:5px;color:var(--ink-2)}

        .excel-row{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}
        .excel-info{flex:1;min-width:220px}
        .excel-name{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:600;color:var(--ink)}
        .excel-name.empty{color:var(--muted);font-weight:500}
        .excel-meta{font-size:12px;color:var(--muted);margin-top:4px}
        .excel-drop{display:inline-flex;align-items:center;gap:7px;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;background:var(--accent);color:#fff;border:1px solid var(--accent);transition:all .15s;box-shadow:0 1px 2px rgba(167,77,74,.2)}
        .excel-drop:hover{background:var(--accent-2);transform:translateY(-1px)}
        .excel-drop.over{outline:2px dashed #fff;outline-offset:-4px}
        .excel-drop.busy{opacity:.7;cursor:progress}

        .web-count{font-size:12px;color:var(--muted);text-align:right}
        .web-count-row{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px;color:var(--muted);flex-wrap:wrap}
        .web-count-row .btn{padding:7px 12px;font-size:12px}

        .sync-row{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap;padding:14px 16px;background:var(--bg);border:1px solid var(--line);border-radius:12px}
        .sync-info{flex:1;min-width:220px}
        .sync-eye{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:4px}
        .sync-stat{font-size:14px;font-weight:600;color:var(--ink)}
        .sync-meta{font-size:11.5px;color:var(--muted);margin-top:3px;font-variant-numeric:tabular-nums}
        .mini-spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:spin .9s linear infinite;margin-right:2px}
        @keyframes spin{to{transform:rotate(360deg)}}

        .lote-input-row{display:flex;gap:10px}
        .lote-input{flex:1;font-family:inherit;font-size:14px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 14px;outline:none;transition:all .15s}
        .lote-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}

        .gen-btns{display:flex;gap:10px;flex-wrap:wrap}
        .gen-btns .btn{flex:1;justify-content:center;min-width:220px}

        .btn{display:inline-flex;align-items:center;gap:7px;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;letter-spacing:-.005em;transition:all .15s;border:1px solid transparent;cursor:pointer;font-family:inherit;white-space:nowrap}
        .btn:disabled{opacity:.5;cursor:not-allowed}
        .btn-primary{background:var(--accent);color:#fff;box-shadow:0 1px 2px rgba(167,77,74,.3),0 4px 14px -4px rgba(167,77,74,.4)}
        .btn-primary:hover:not(:disabled){background:var(--accent-2);transform:translateY(-1px)}
        .btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink-2)}
        .btn-ghost:hover:not(:disabled){border-color:var(--ink-2);color:var(--ink)}

        .pdfs-section{margin-top:8px;padding-top:16px;border-top:1px solid var(--line)}
        .pdfs-header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap}
        .pdfs-header h4{font-family:'Fraunces',serif;font-weight:500;font-size:16px;color:var(--ink);margin:0}
        .pdfs-actions{display:flex;gap:6px;flex-wrap:wrap}
        .pdfs-list{display:flex;flex-direction:column;gap:6px}
        .pdf-row{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border:1px solid var(--line);border-radius:10px;gap:10px}
        .pdf-row.err{background:rgba(167,77,74,.05);border-color:rgba(167,77,74,.2)}
        .pdf-name{font-size:13px;font-weight:600;color:var(--ink)}
        .pdf-meta{font-size:11px;color:var(--muted);margin-top:2px}
      `}</style>
    </section>
  );
}

// --------- Drop reutilizable ---------
function UploadDrop({ label, hint, accept, onFiles, multiple, dragOver, setDragOver, progress }) {
  const busy = progress?.total > 0 && progress.done < progress.total;
  return (
    <label
      className={`up-drop ${dragOver ? 'over' : ''} ${busy ? 'busy' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
    >
      <div className="up-icon">{I.upload({ size: 22 })}</div>
      <div className="up-t">{busy ? `Subiendo ${progress.done}/${progress.total}…` : label}</div>
      <div className="up-s">{hint}</div>
      <input type="file" accept={accept} multiple={multiple} onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} hidden />

      <style>{`
        .up-drop{display:flex;flex-direction:column;align-items:center;gap:5px;padding:26px 18px;border:1.5px dashed var(--line);border-radius:12px;background:#fff;cursor:pointer;transition:all .15s;text-align:center}
        .up-drop:hover{border-color:var(--accent);background:var(--accent-soft)}
        .up-drop.over{border-color:var(--accent);background:var(--accent-soft);border-style:solid}
        .up-drop.busy{cursor:progress;opacity:.85}
        .up-icon{width:44px;height:44px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;margin-bottom:4px}
        .up-t{font-size:14px;font-weight:600;color:var(--ink)}
        .up-s{font-size:11.5px;color:var(--muted);letter-spacing:.02em}
      `}</style>
    </label>
  );
}
