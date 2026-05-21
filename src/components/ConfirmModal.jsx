import React, { useEffect } from 'react';
import { I } from './icons.jsx';

// Modal reutilizable de confirmación / aviso. Reemplaza los `alert()` y
// `confirm()` nativos por uno con el mismo estilo que el resto de la app.
//
// Props:
//   open               boolean
//   icon               nombre del icono ('trash', 'upload', 'check', 'sparkle', 'plus')
//   tone               'danger' (rojo) | 'info' (gris-rojizo suave) — controla el color del icono
//   title              string
//   description        string | ReactNode (se puede pasar JSX con <strong>)
//   cancelLabel        string | null  (oculta el botón si null)
//   confirmLabel       string | null  (oculta el botón si null)
//   confirmTone        'danger' (rojo sólido) | 'primary' (igual) | 'neutral' (gris)
//   secondaryLabel     string | null — botón adicional (ej. "Editar producto")
//   secondaryIcon      string opcional para el secondary
//   onCancel           () => void
//   onConfirm          () => void
//   onSecondary        () => void
export default function ConfirmModal({
  open,
  icon = 'trash',
  tone = 'danger',
  title,
  description,
  cancelLabel = 'Cancelar',
  confirmLabel = 'Confirmar',
  confirmTone = 'danger',
  secondaryLabel = null,
  secondaryIcon = 'edit',
  onCancel,
  onConfirm,
  onSecondary,
}) {
  // Permite cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape' && onCancel) onCancel(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onCancel]);

  if (!open) return null;

  const IconComp = I[icon] || I.trash;
  const SecIcon = I[secondaryIcon] || null;

  return (
    <div className="conf-bg" onClick={onCancel}>
      <div
        className="conf"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conf-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`conf-icon tone-${tone}`}>{IconComp({ size: 22 })}</div>
        <h3 id="conf-title" className="conf-title">{title}</h3>
        {description && <div className="conf-sub">{description}</div>}
        <div className="conf-actions">
          {cancelLabel && (
            <button type="button" className="conf-btn conf-btn-ghost" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button type="button" className="conf-btn conf-btn-secondary" onClick={onSecondary}>
              {SecIcon && SecIcon({ size: 14 })} {secondaryLabel}
            </button>
          )}
          {confirmLabel && (
            <button
              type="button"
              className={`conf-btn ${confirmTone === 'neutral' ? 'conf-btn-neutral' : 'conf-btn-danger'}`}
              onClick={onConfirm}
              autoFocus
            >
              {confirmTone === 'danger' && I.trash({ size: 14 })}
              {confirmLabel}
            </button>
          )}
        </div>
      </div>

      <style>{`
        .conf-bg{position:fixed;inset:0;background:rgba(20,16,12,.45);backdrop-filter:blur(6px);z-index:1500;display:grid;place-items:center;padding:30px;animation:fadeIn .2s}
        .conf{background:#FAFAF7;border-radius:16px;padding:32px;width:460px;max-width:100%;box-shadow:0 30px 80px -20px rgba(0,0,0,.4);text-align:center;animation:popIn .25s cubic-bezier(.2,.8,.2,1)}
        .conf-icon{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;margin:0 auto 18px}
        .conf-icon.tone-danger{background:var(--accent-soft);color:var(--accent)}
        .conf-icon.tone-info{background:var(--bg);color:var(--ink-2)}
        .conf-title{font-family:'Fraunces',serif;font-weight:400;font-size:22px;margin:0 0 10px;color:var(--ink);line-height:1.25}
        .conf-sub{font-size:13.5px;line-height:1.55;color:var(--muted);margin:0 0 24px}
        .conf-sub strong{color:var(--ink);font-weight:600}
        .conf-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
        .conf-btn{display:inline-flex;align-items:center;gap:7px;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:600;letter-spacing:-.005em;transition:all .15s;border:1px solid transparent;cursor:pointer;font-family:inherit;white-space:nowrap}
        .conf-btn-ghost{background:#fff;color:var(--ink-2);border:1px solid var(--line)}
        .conf-btn-ghost:hover{border-color:var(--ink-2);color:var(--ink)}
        .conf-btn-secondary{background:#fff;color:var(--accent);border:1px solid var(--accent)}
        .conf-btn-secondary:hover{background:var(--accent-soft)}
        .conf-btn-danger{background:var(--accent);color:#fff;box-shadow:0 1px 2px rgba(167,77,74,.3),0 4px 14px -4px rgba(167,77,74,.4)}
        .conf-btn-danger:hover{background:var(--accent-2);transform:translateY(-1px)}
        .conf-btn-neutral{background:var(--ink);color:#fff}
        .conf-btn-neutral:hover{background:#1f1c19;transform:translateY(-1px)}
      `}</style>
    </div>
  );
}
