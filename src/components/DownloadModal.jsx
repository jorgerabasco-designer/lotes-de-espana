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
      const margin = 18;

      // ---- Paleta ----
      const ink = [45, 42, 38];
      const ink2 = [91, 85, 76];
      const muted = [139, 131, 117];
      const accent = [167, 77, 74];
      const olive = [47, 74, 61];
      const line = [230, 222, 210];

      // ---- Cabecera con logo + marca ----
      // Banda superior crudo claro
      doc.setFillColor(245, 241, 232);
      doc.rect(0, 0, pageW, 32, 'F');

      // Logo (si carga) — respetando proporción real
      let logoEndX = margin; // dónde acaba el logo, para colocar el texto después
      try {
        const logoRes = await fetch('/favicon.png', { mode: 'cors' });
        if (logoRes.ok) {
          const lblob = await logoRes.blob();
          const ldata = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(lblob);
          });
          const lbitmap = await createImageBitmap(lblob);
          const logoMaxH = 16;  // alto máximo del logo en la cabecera (mm)
          const logoMaxW = 22;  // ancho máximo
          const lRatio = lbitmap.width / lbitmap.height;
          let lW, lH;
          if (lRatio > logoMaxW / logoMaxH) {
            lW = logoMaxW;
            lH = logoMaxW / lRatio;
          } else {
            lH = logoMaxH;
            lW = logoMaxH * lRatio;
          }
          const lY = (32 - lH) / 2; // vertical-centered en la banda de 32mm
          doc.addImage(ldata, 'PNG', margin, lY, lW, lH, undefined, 'FAST');
          logoEndX = margin + lW + 5;
        }
      } catch {}

      // Texto cabecera
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...ink);
      doc.text('LOTES DE ESPAÑA', margin + 18, 16);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text('Studio · Composición personalizada', margin + 18, 21);

      // Fecha alineada a la derecha en la banda
      const dateStr = bodegon.created_at
        ? new Date(bodegon.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text(dateStr.toUpperCase(), pageW - margin, 16, { align: 'right' });
      doc.setFontSize(9);
      doc.setTextColor(...ink2);
      doc.text(`${(bodegon.skus || []).length} productos`, pageW - margin, 21, { align: 'right' });

      // Línea separadora bajo cabecera
      doc.setDrawColor(...line);
      doc.setLineWidth(0.3);
      doc.line(margin, 32, pageW - margin, 32);

      // ---- Título del bodegón (serif Times) ----
      // El texto se posiciona por baseline en jsPDF. Para que la primera línea
      // del título empiece justo bajo la banda con respiro, baseline = top + cap.
      const titleSize = 28; // pt
      const titleLineH = 11; // mm — line-height generoso para 28pt
      let cursorY = 32 + 14 + (titleSize * 0.353);
      doc.setFont('times', 'normal');
      doc.setFontSize(titleSize);
      doc.setTextColor(...ink);
      const title = bodegon.title || 'Bodegón';
      const titleLines = doc.splitTextToSize(title, pageW - margin * 2);
      doc.text(titleLines, margin, cursorY, { baseline: 'alphabetic' });
      cursorY += (titleLines.length - 1) * titleLineH + 12;

      // ---- Imagen del bodegón (sin marco, alineada a margen izquierdo) ----
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
      const maxImgH = 110;
      let imgW = maxImgW;
      let imgH = imgW / imgRatio;
      if (imgH > maxImgH) {
        imgH = maxImgH;
        imgW = imgH * imgRatio;
      }
      const imgX = (pageW - imgW) / 2; // centrada horizontalmente bajo el título

      doc.addImage(dataUrl, 'JPEG', imgX, cursorY, imgW, imgH, undefined, 'FAST');
      cursorY += imgH + 16;

      // ---- Descripción ----
      if (bodegon.description) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...muted);
        doc.text('DESCRIPCIÓN', margin, cursorY, { baseline: 'alphabetic' });
        cursorY += 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(...ink2);
        const descLines = doc.splitTextToSize(bodegon.description, pageW - margin * 2);
        doc.text(descLines, margin, cursorY, { baseline: 'alphabetic', lineHeightFactor: 1.45 });
        cursorY += descLines.length * 5.4 + 10;
      }

      // ---- Productos ----
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...muted);
      doc.text(`PRODUCTOS INCLUIDOS · ${(bodegon.skus || []).length}`, margin, cursorY, { baseline: 'alphabetic' });
      cursorY += 8;

      const skuList = bodegon.skus || [];
      doc.setLineWidth(0.2);
      doc.setDrawColor(...line);

      // Layout de fila de producto:
      //   bullet   |   nombre / marca         |     ref. (derecha)
      //   2mm      |   resto del ancho        |
      const bulletX = margin + 1.4;
      const textX = margin + 6;
      const rowH = 11;       // alto reservado por fila
      const nameBaseline = 4.2; // mm desde el top de la fila al baseline del nombre
      const brandBaseline = 8.6; // mm desde el top de la fila al baseline de marca

      for (const sku of skuList) {
        const p = (products || []).find(x => x.sku === sku);
        if (cursorY + rowH > pageH - 16) {
          doc.addPage();
          cursorY = margin;
        }
        if (p) {
          // Bullet alineado con el baseline visual del nombre (cap height ~ 2.6 mm para 11pt)
          doc.setFillColor(...olive);
          doc.circle(bulletX, cursorY + nameBaseline - 1.3, 0.9, 'F');

          // Nombre
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(...ink);
          doc.text(p.name, textX, cursorY + nameBaseline, { baseline: 'alphabetic' });

          // Ref alineada al baseline del nombre
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...muted);
          doc.text(`Ref. ${p.sku}`, pageW - margin, cursorY + nameBaseline, { baseline: 'alphabetic', align: 'right' });

          // Marca
          doc.setFontSize(9);
          doc.setTextColor(...muted);
          doc.text(p.brand, textX, cursorY + brandBaseline, { baseline: 'alphabetic' });

          // Línea separadora
          doc.line(textX, cursorY + rowH, pageW - margin, cursorY + rowH);
          cursorY += rowH;
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(...ink2);
          doc.text(`• ${sku}`, margin, cursorY + 4, { baseline: 'alphabetic' });
          cursorY += 7;
        }
      }

      // ---- Pie ----
      const footY = pageH - 12;
      doc.setDrawColor(...line);
      doc.setLineWidth(0.3);
      doc.line(margin, footY - 4, pageW - margin, footY - 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...muted);
      doc.text('lotesdeespana.es', margin, footY);
      doc.text(`Página 1`, pageW - margin, footY, { align: 'right' });

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
