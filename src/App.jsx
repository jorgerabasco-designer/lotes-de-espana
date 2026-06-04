import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Catalog from './components/Catalog.jsx';
import ProductsScreen from './components/ProductsScreen.jsx';
import ProductEditOverlay from './components/ProductEditOverlay.jsx';
import HistoryScreen from './components/HistoryScreen.jsx';
import SettingsScreen from './components/SettingsScreen.jsx';
import BodegonOverlay from './components/BodegonOverlay.jsx';
import ImportExcelModal from './components/ImportExcelModal.jsx';
import SpecialOrderModal from './components/SpecialOrderModal.jsx';
import BodegonEditOverlay from './components/BodegonEditOverlay.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import MinimizedGenPill from './components/MinimizedGenPill.jsx';
import {
  listProducts, upsertProduct, deleteProduct, uploadProductPhoto,
  listBodegones, updateBodegon, deleteBodegon,
  startBodegonGeneration, pollBodegon, commitBodegon, discardBodegon,
} from './lib/api.js';
import { SUPABASE_READY } from './lib/supabase.js';
import { useTaxonomy } from './lib/taxonomy.jsx';

export default function App() {
  const taxonomy = useTaxonomy();
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState([]);
  const [active, setActive] = useState('catalog');

  // Filters
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('all');
  const [tags, setTags] = useState([]);
  const [selBrands, setSelBrands] = useState([]);
  const [sort, setSort] = useState('used');

  // Modals
  const [importOpen, setImportOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editInitialFile, setEditInitialFile] = useState(null);
  const [specialOrderOpen, setSpecialOrderOpen] = useState(false);

  // Editar un bodegón del historial (regenerar o crear como nuevo).
  const [editBodegon, setEditBodegon] = useState(null);

  // Diálogo informativo / de aviso global (sustituye a los alert() nativos).
  // Se rellena con { title, description, icon, tone, confirmLabel, onConfirm? }
  const [infoModal, setInfoModal] = useState(null);
  const showInfo = (cfg) => setInfoModal(cfg);

  // Bodegón — generación viva en background con posibilidad de minimizar.
  // activeGen es la generación en curso (o el draft pendiente de guardar). Su
  // ciclo de vida sobrevive a que el overlay se cierre (minimizar). bodegonOpen
  // solo controla si el overlay es visible o no.
  const [bodegonNumber, setBodegonNumber] = useState(1);
  const [bodegonOpen, setBodegonOpen] = useState(false);
  // activeGen: { ref, title, description, tags, items, status, image, image_path, error, t0 }
  const [activeGen, setActiveGen] = useState(null);

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        const [ps, bs] = await Promise.all([listProducts(), listBodegones()]);
        setProducts(ps);
        setHistory(bs);
        if (bs.length) {
          const max = Math.max(...bs.map(b => b.n || 0), 0);
          setBodegonNumber(max + 1);
        }
      } catch (e) {
        console.error('Error cargando datos', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const brands = useMemo(() => Array.from(new Set(products.map(p => p.brand))).filter(Boolean).sort(), [products]);
  const cats = useMemo(() => {
    // En la sidebar mostramos solo categorías que tengan al menos 1 producto.
    const used = new Set(products.map(p => p.cat));
    return taxonomy.categories.filter(c => used.has(c.id));
  }, [products, taxonomy.categories]);
  const allTags = taxonomy.tags;

  // Cantidades por producto seleccionado: { sku: nº de unidades }
  const [qtys, setQtys] = useState({});

  // Click en una card: añade 1 unidad (o la primera, si no estaba seleccionado)
  const addUnit = (sku) => {
    setSelected(s => s.includes(sku) ? s : [...s, sku]);
    setQtys(q => ({ ...q, [sku]: (q[sku] || 0) + 1 }));
  };
  // Resta 1 unidad; si llega a 0, deselecciona el producto
  const removeUnit = (sku) => {
    setQtys(q => {
      const next = (q[sku] || 0) - 1;
      const copy = { ...q };
      if (next <= 0) {
        delete copy[sku];
        setSelected(s => s.filter(x => x !== sku));
      } else {
        copy[sku] = next;
      }
      return copy;
    });
  };
  // Click en la card: si no está seleccionado lo selecciona (1 unidad);
  // si ya estaba seleccionado lo deselecciona por completo (todas las unidades).
  const toggle = (sku) => {
    if (selected.includes(sku)) {
      setSelected(s => s.filter(x => x !== sku));
      setQtys(q => { const copy = { ...q }; delete copy[sku]; return copy; });
    } else {
      setSelected(s => [...s, sku]);
      setQtys(q => ({ ...q, [sku]: 1 }));
    }
  };
  const clearSel = () => { setSelected([]); setQtys({}); };

  // Pide permiso de notificación (la primera vez). Si el usuario lo deniega,
  // simplemente no notificamos. Llamamos sin await para no bloquear.
  const ensureNotifPermission = () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      try { Notification.requestPermission().catch(() => {}); } catch {}
    }
  };

  // Notifica al sistema (solo si hay permiso y el overlay está cerrado).
  const notifyBodegonReady = (title) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const n = new Notification('Bodegón listo', {
        body: title || 'Tu bodegón está listo para revisar.',
        icon: '/favicon.ico',
        tag: 'bodegon-listo', // sustituye notificaciones anteriores
      });
      n.onclick = () => {
        try { window.focus(); } catch {}
        setBodegonOpen(true);
        try { n.close(); } catch {}
      };
    } catch {}
  };

  // Arranca una generación nueva. Centraliza el flujo manual y el de pedidos
  // especiales / regenerar.
  const startBodegon = async ({ items, title, description, tags }) => {
    if (activeGen) {
      showInfo({
        icon: 'sparkle', tone: 'info',
        title: 'Ya hay un bodegón generándose',
        description: 'Espera a que termine (o cancélalo desde la píldora) antes de iniciar otro.',
        confirmLabel: 'Entendido', confirmTone: 'neutral',
      });
      return;
    }
    if (!items || items.length < 2) return;
    ensureNotifPermission();
    try {
      const created = await startBodegonGeneration({
        items, title, description: description || '', tags: tags || [],
      });
      setActiveGen({
        ref: created.id,
        title: created.title || title || `Bodegón IA #${bodegonNumber}`,
        description: description || '',
        tags: tags || [],
        items: items.map(i => ({ sku: i.sku, qty: i.qty || 1 })),
        status: 'generating',
        image: null,
        image_path: null,
        error: null,
        t0: Date.now(),
      });
      setBodegonOpen(true);
    } catch (e) {
      showInfo({
        icon: 'trash', tone: 'danger',
        title: 'No se pudo iniciar el bodegón',
        description: e.message || 'Error desconocido al registrar el bodegón.',
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
    }
  };

  // Effect de polling — sobrevive al cierre del overlay. Cuando termina,
  // si el overlay está cerrado, notifica al sistema.
  const overlayOpenRef = React.useRef(false);
  overlayOpenRef.current = bodegonOpen;
  useEffect(() => {
    if (!activeGen || activeGen.status !== 'generating') return;
    let cancelled = false;
    const ref = activeGen.ref;
    const fixedTitle = activeGen.title;
    (async () => {
      try {
        const result = await pollBodegon(ref);
        if (cancelled) return;
        setActiveGen(prev => (prev && prev.ref === ref) ? {
          ...prev,
          status: 'draft',
          image: result.image,
          image_path: result.image_path,
        } : prev);
        if (!overlayOpenRef.current) notifyBodegonReady(fixedTitle);
      } catch (e) {
        if (cancelled) return;
        setActiveGen(prev => (prev && prev.ref === ref) ? {
          ...prev, status: 'failed', error: e.message || String(e),
        } : prev);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGen?.ref, activeGen?.status]);

  // Llamado desde SpecialOrderModal y BodegonEditOverlay → arranca la generación.
  const handleSpecialOrderConfirm = ({ items, title, description, tags }) => {
    if (!items || !items.length) return;
    setSpecialOrderOpen(false);
    startBodegon({
      items,
      title: title || `Bodegón IA #${bodegonNumber}`,
      description: description || '',
      tags: tags || [],
    });
  };

  const handleCreate = () => {
    if (selected.length < 2) {
      showInfo({
        icon: 'sparkle', tone: 'info',
        title: 'Selecciona al menos 2 productos',
        description: 'Para crear un bodegón necesitas elegir como mínimo 2 productos del catálogo.',
        confirmLabel: 'Entendido', confirmTone: 'neutral',
      });
      return;
    }
    const missing = selected.filter(sku => {
      const p = products.find(x => x.sku === sku);
      return !p || !p.img;
    });
    if (missing.length) {
      showInfo({
        icon: 'upload', tone: 'info',
        title: 'Algunos productos no tienen foto',
        description: (
          <>
            No se puede generar el bodegón porque <strong>{missing.length} producto{missing.length === 1 ? '' : 's'}</strong> no tiene{missing.length === 1 ? '' : 'n'} foto: <strong>{missing.join(', ')}</strong>.
            <br/><br/>
            Edita esos productos y sube una imagen antes de incluirlos.
          </>
        ),
        confirmLabel: 'Entendido', confirmTone: 'neutral',
      });
      return;
    }
    const items = selected.map(sku => ({ sku, qty: qtys[sku] || 1 }));
    startBodegon({
      items,
      title: `Bodegón IA #${bodegonNumber}`,
      description: '',
      tags: [],
    });
  };

  // ---- Acciones desde el BodegonOverlay (pasa por activeGen) ----
  const handleOverlayMinimize = () => setBodegonOpen(false);
  const handleOverlayRegen = () => {
    if (!activeGen) return;
    const items = activeGen.items;
    const title = activeGen.title;
    const description = activeGen.description;
    const tags = activeGen.tags;
    // Descartamos el actual (borra fila + imagen) y arrancamos uno nuevo con
    // los mismos parámetros.
    const oldRef = activeGen.ref;
    setActiveGen(null);
    discardBodegon(oldRef).catch(() => {});
    setTimeout(() => startBodegon({ items, title, description, tags }), 50);
  };
  const handleOverlaySave = async () => {
    if (!activeGen || activeGen.status !== 'draft') return;
    const saved = await commitBodegon(activeGen.ref, {
      nombre: activeGen.title,
      descripcion: activeGen.description || null,
      tags: activeGen.tags || [],
    });
    setBodegonNumber(n => n + 1);
    setBodegonOpen(false);
    setActiveGen(null);
    try { const bs = await listBodegones(); setHistory(bs); } catch (e) { console.error(e); }
    return saved;
  };
  const handleOverlayDiscard = async () => {
    if (!activeGen) return;
    try { await discardBodegon(activeGen.ref); } catch (e) { console.warn(e); }
    setBodegonOpen(false);
    setActiveGen(null);
  };
  // Actualizar metadatos en activeGen (título / descripción / etiquetas).
  const handleOverlayUpdateMeta = (patch) => {
    setActiveGen(prev => prev ? { ...prev, ...patch } : prev);
  };

  const handleDeletedBodegon = async (id) => {
    if (id && SUPABASE_READY) {
      try { await deleteBodegon(id); } catch (e) { console.error(e); }
    }
    setHistory(h => h.filter(x => x.id !== id));
  };

  const refreshHistory = async () => {
    try {
      const bs = await listBodegones();
      setHistory(bs);
    } catch (e) { console.error(e); }
  };

  const openNew = (initialFile) => {
    setEditProduct(null);
    setEditInitialFile(initialFile instanceof File ? initialFile : null);
    setEditOpen(true);
  };
  const openEdit = (p) => {
    setEditProduct(p);
    setEditInitialFile(null);
    setEditOpen(true);
  };

  const handleSaveProduct = async (form) => {
    // Lanza si falla — el overlay captura y muestra el banner de error.
    const saved = await upsertProduct(form);
    setProducts(ps => {
      const i = ps.findIndex(x => x.sku === saved.sku);
      if (i >= 0) {
        const next = [...ps]; next[i] = { ...ps[i], ...saved }; return next;
      }
      return [saved, ...ps];
    });
    return saved;
  };

  const refreshProducts = async () => {
    const ps = await listProducts();
    setProducts(ps);
  };

  const handleDeleteProduct = async (sku) => {
    try {
      await deleteProduct(sku);
      setProducts(ps => ps.filter(p => p.sku !== sku));
      setSelected(s => s.filter(x => x !== sku));
    } catch (e) {
      showInfo({
        icon: 'trash',
        tone: 'danger',
        title: 'No se pudo eliminar el producto',
        description: e.message || 'Error desconocido.',
        confirmLabel: 'Cerrar',
        confirmTone: 'neutral',
      });
    }
  };

  const handleImport = async (item) => {
    // item = { data: producto, photoFile?: File }
    const { data, photoFile } = item;
    let foto_path = null;
    if (photoFile && data.sku) {
      try {
        foto_path = await uploadProductPhoto(photoFile, data.sku);
      } catch (e) {
        console.warn('No se pudo subir foto de', data.sku, e);
      }
    }
    const saved = await upsertProduct({ ...data, foto_path });
    setProducts(ps => {
      const i = ps.findIndex(x => x.sku === saved.sku);
      if (i >= 0) { const next = [...ps]; next[i] = saved; return next; }
      return [saved, ...ps];
    });
    return saved;
  };

  const handleRenameBodegon = async (id, title) => {
    setHistory(h => h.map(x => x.id === id ? { ...x, title } : x));
    if (SUPABASE_READY) {
      try { await updateBodegon(id, { nombre: title }); } catch (e) { console.error(e); }
    }
  };

  return (
    <div className="app">
      <Sidebar
        active={active}
        onNav={setActive}
        cat={cat} setCat={setCat}
        tags={tags} setTags={setTags}
        brands={brands}
        selBrands={selBrands} setSelBrands={setSelBrands}
        cats={cats}
        allTags={allTags}
      />

      {loading && (
        <section style={{ flex: 1, display: 'grid', placeItems: 'center', height: '100vh' }}>
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: 'var(--ink)', marginBottom: 8 }}>
              Lotes de España
            </div>
            Cargando catálogo…
          </div>
        </section>
      )}

      {!loading && active === 'catalog' && (
        <Catalog
          products={products} selected={selected} onToggle={toggle}
          qtys={qtys} onAddUnit={addUnit} onRemoveUnit={removeUnit}
          query={query} setQuery={setQuery}
          sort={sort} setSort={setSort}
          cat={cat} setCat={setCat}
          tags={tags} setTags={setTags}
          selBrands={selBrands} setSelBrands={setSelBrands}
          cats={cats} allTags={allTags} brands={brands}
          onCreate={handleCreate}
          onClearSel={clearSel}
          onCreateProduct={openNew}
          onImport={() => setImportOpen(true)}
          onSpecialOrder={() => setSpecialOrderOpen(true)}
          onEditProduct={openEdit}
        />
      )}

      {!loading && active === 'products' && (
        <ProductsScreen
          products={products}
          onEdit={openEdit}
          onDelete={handleDeleteProduct}
          onNew={openNew}
          onImport={() => setImportOpen(true)}
        />
      )}

      {!loading && active === 'history' && (
        <HistoryScreen
          products={products}
          history={history}
          onRename={handleRenameBodegon}
          onDelete={handleDeletedBodegon}
          onRefresh={refreshHistory}
          onEdit={(b) => setEditBodegon(b)}
        />
      )}

      {!loading && active === 'settings' && <SettingsScreen products={products} onProductsChanged={refreshProducts}/>}

      <ProductEditOverlay
        open={editOpen}
        product={editProduct}
        initialFile={editInitialFile}
        onClose={() => { setEditOpen(false); setEditInitialFile(null); }}
        onSave={handleSaveProduct}
        showInfo={showInfo}
      />

      <ImportExcelModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
        existingSkus={products.map(p => p.sku)}
        showInfo={showInfo}
      />

      <BodegonOverlay
        open={bodegonOpen}
        activeGen={activeGen}
        products={products}
        onMinimize={handleOverlayMinimize}
        onRegen={handleOverlayRegen}
        onSave={handleOverlaySave}
        onDiscard={handleOverlayDiscard}
        onUpdateMeta={handleOverlayUpdateMeta}
      />

      <MinimizedGenPill
        activeGen={activeGen}
        visible={!!activeGen && !bodegonOpen}
        onOpen={() => setBodegonOpen(true)}
        onCancel={handleOverlayDiscard}
      />

      <SpecialOrderModal
        open={specialOrderOpen}
        onClose={() => setSpecialOrderOpen(false)}
        products={products}
        onConfirm={handleSpecialOrderConfirm}
      />

      {editBodegon && (
        <BodegonEditOverlay
          bodegon={editBodegon}
          products={products}
          onClose={() => setEditBodegon(null)}
          onConfirm={({ items, title, description, tags }) => {
            setEditBodegon(null);
            handleSpecialOrderConfirm({ items, title, description, tags });
          }}
          onSaveMeta={async (id, patch) => {
            await updateBodegon(id, patch);
            await refreshHistory();
            setEditBodegon(null);
          }}
          showInfo={showInfo}
        />
      )}

      {infoModal && (
        <ConfirmModal
          open={true}
          icon={infoModal.icon}
          tone={infoModal.tone}
          title={infoModal.title}
          description={infoModal.description}
          cancelLabel={infoModal.cancelLabel ?? null}
          confirmLabel={infoModal.confirmLabel || 'Entendido'}
          confirmTone={infoModal.confirmTone || 'neutral'}
          onCancel={() => setInfoModal(null)}
          onConfirm={() => {
            const cb = infoModal.onConfirm;
            setInfoModal(null);
            cb && cb();
          }}
        />
      )}

      {!SUPABASE_READY && !loading && (
        <div style={{
          position: 'fixed', bottom: 16, right: 16, padding: '10px 14px',
          background: 'rgba(167,77,74,.08)', border: '1px solid var(--accent)',
          borderRadius: 10, color: 'var(--accent)', fontSize: 12, fontWeight: 600,
          maxWidth: 320, lineHeight: 1.5, zIndex: 9999,
        }}>
          🛈 Modo demo — Supabase aún no está conectado. Sigue el README para conectar tu base de datos.
        </div>
      )}
    </div>
  );
}
