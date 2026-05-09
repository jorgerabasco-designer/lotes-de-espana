import React, { useState } from 'react';
import { I } from './icons.jsx';
import { downloadImageWithQuality } from '../lib/download.js';

const QUALITIES = [
  { id: 'media', label: 'Media', sub: 'Web, redes sociales', maxSide: 1280, quality: 0.78, kb: '~250 KB · 1280px' },
  { id: 'alta',  label: 'Alta',  sub: 'Catálogo digital, presentación', maxSide: 2560, quality: 0.9, kb: '~1.5 MB · 2560px' },
  { id: 'muy_alta', label: 'Muy alta', sub: 'Imprenta, original sin reescalar', maxSide: null, quality: 0.95, kb: '~4 MB · resolución original' },
];

export default function DownloadModal({ open, onClose, bodegon, products }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  if (!open || !bodegon) return null;

  const safeName = (bodegon.title || 'bodegon')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const handleJpg = async (q) => {
    if (!bodegon.image) { setError('Este bodegón no tiene imagen.'); return; }
    setBusy(q.id);
    setError(null);
    try {
      await downloadImageWithQuality(bodegon.image, `${safeName}-${q.id}.jpg`, {
        maxSide: q.maxSide,
        quality: q.quality,
        format: 'image/jpeg',
      });
      setTimeout(onClose, 400);
    } catch (e) {
      setError(e.message || 'Error descargando.');
    } finally {
      setBusy(null);
    }
  };

  const handlePdf = async () => {
    if (!bodegon.image) { setError('Este bodegón no tiene imagen.'); return; }
    setBusy('pdf');
    setError(null);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 16;

      // Cabecera
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(45, 42, 38);
      doc.text(bodegon.title || 'Bodegón', margin, margin + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(139, 131, 117);
      const dateStr = bodegon.created_at
        ? new Date(bodegon.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
      doc.text(`${(bodegon.skus || []).length} productos · ${dateStr}`, margin, margin + 11);

      // Imagen del bodegón (centrada, ratio mantenido)
      const res = await fetch(bodegon.image, { mode: 'cors' });
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const bitmap = await createImageBitmap(blob);
      const imgRatio = bitmap.width / bitmap.height;
      const maxImgW = pageW - margin * 2;
      const maxImgH = 130;
      let imgW = maxImgW;
      let imgH = imgW / imgRatio;
      if (imgH > maxImgH) {
        imgH = maxImgH;
        imgW = imgH * imgRatio;
      }
      const imgX = (pageW - imgW) / 2;
      const imgY = margin + 18;
      doc.addImage(dataUrl, 'JPEG', imgX, imgY, imgW, imgH, undefined, 'FAST');

      let cursorY = imgY + imgH + 10;

      // Descripción
      if (bodegon.description) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(45, 42, 38);
        doc.text('Descripción', margin, cursorY);
        cursorY += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(91, 85, 76);
        const descLines = doc.splitTextToSize(bodegon.description, pageW - margin * 2);
        doc.text(descLines, margin, cursorY);
        cursorY += descLines.length * 5 + 4;
      }

      // Productos
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(45, 42, 38);
      doc.text(`Productos incluidos (${(bodegon.skus || []).length})`, margin, cursorY);
      cursorY += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(45, 42, 38);
      const skuList = bodegon.skus || [];
      for (const sku of skuList) {
        const p = (products || []).find(x => x.sku === sku);
        if (cursorY > pageH - margin) {
          doc.addPage();
          cursorY = margin;
        }
        if (p) {
          doc.setFont('helvetica', 'bold');
          doc.text(`• ${p.name}`, margin, cursorY);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(139, 131, 117);
          doc.text(`  ${p.brand} · ref. ${p.sku}`, margin, cursorY + 4);
          doc.setTextColor(45, 42, 38);
          cursorY += 9;
        } else {
          doc.text(`• ${sku}`, margin, cursorY);
          cursorY += 6;
        }
      }

      // Pie
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(139, 131, 117);
      doc.text('Lotes de España · Generado con IA', margin, pageH - 8);

      doc.save(`${safeName}.pdf`);
      setTimeout(onClose, 400);
    } catch (e) {
      setError(e.message || 'Error generando el PDF.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="dl-bg" onClick={onClose}>
      <div className="dl" onClick={e => e.stopPropagation()}>
        <header className="dl-h">
          <div>
            <div className="dl-eye">Exportar</div>
            <h3 className="dl-title">Descargar bodegón</h3>
          </div>
          <button className="dl-x" onClick={onClose}>{I.x({ size: 18 })}</button>
        </header>

        <div className="dl-section">
          <div className="dl-sect-h">JPG</div>
          {QUALITIES.map(q => (
            <button key={q.id} className="dl-opt" disabled={busy} onClick={() => handleJpg(q)}>
              <div className="dl-opt-l">
                <div className="dl-opt-t">{q.label}</div>
                <div className="dl-opt-s">{q.sub}</div>
              </div>
              <div className="dl-opt-meta">{q.kb}</div>
              <div className="dl-opt-arrow">{busy === q.id ? '…' : I.download({ size: 16 })}</div>
            </button>
          ))}
        </div>

        <div className="dl-section">
          <div className="dl-sect-h">PDF</div>
          <button className="dl-opt featured" disabled={busy} onClick={handlePdf}>
            <div className="dl-opt-l">
              <div className="dl-opt-t">PDF completo</div>
              <div className="dl-opt-s">Imagen + título + descripción + listado de productos</div>
            </div>
            <div className="dl-opt-meta">A4 · ~2 MB</div>
            <div className="dl-opt-arrow">{busy === 'pdf' ? '…' : I.download({ size: 16 })}</div>
          </button>
        </div>

        {error && <div className="dl-err">{error}</div>}
      </div>

      <style>{`
        .dl-bg{position:fixed;inset:0;background:rgba(20,16,12,.45);backdrop-filter:blur(6px);z-index:1100;display:grid;place-items:center;padding:30px;animation:fadeIn .2s ease}
        .dl{background:#fff;border-radius:18px;width:480px;max-width:100%;padding:24px;box-shadow:0 30px 80px -20px rgba(0,0,0,.4);animation:popIn .25s cubic-bezier(.2,.8,.2,1);max-height:90vh;overflow-y:auto}
        .dl-h{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px}
        .dl-eye{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);font-weight:600}
        .dl-title{font-family:'Fraunces',serif;font-weight:400;font-size:24px;margin:4px 0 0;color:var(--ink)}
        .dl-x{width:32px;height:32px;border-radius:8px;color:var(--muted);display:grid;place-items:center;background:transparent}
        .dl-x:hover{background:var(--bg);color:var(--ink)}

        .dl-section{margin-top:14px}
        .dl-sect-h{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:8px;padding:0 4px}

        .dl-opt{display:grid;grid-template-columns:1fr auto auto;gap:14px;align-items:center;padding:14px;border:1px solid var(--line);border-radius:12px;background:#fff;cursor:pointer;transition:all .15s;text-align:left;width:100%;margin-bottom:6px}
        .dl-opt:hover:not(:disabled){border-color:var(--accent);background:var(--accent-soft);transform:translateY(-1px)}
        .dl-opt:disabled{opacity:.5;cursor:not-allowed}
        .dl-opt.featured{border-color:var(--olive);background:linear-gradient(180deg,#FAFAF7,#F1ECDF)}
        .dl-opt.featured:hover:not(:disabled){background:#fff;border-color:var(--olive)}
        .dl-opt-t{font-size:14px;font-weight:600;color:var(--ink);font-family:'Fraunces',serif}
        .dl-opt-s{font-size:11.5px;color:var(--muted);margin-top:2px;line-height:1.4}
        .dl-opt-meta{font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums;letter-spacing:.3px;font-weight:500;text-align:right}
        .dl-opt-arrow{color:var(--muted);min-width:20px;text-align:center}
        .dl-opt:hover .dl-opt-arrow{color:var(--accent)}

        .dl-err{margin-top:14px;padding:10px 14px;background:rgba(167,77,74,.08);border:1px solid var(--accent);color:var(--accent);font-size:12.5px;font-weight:600;border-radius:8px}
      `}</style>
    </div>
  );
}
