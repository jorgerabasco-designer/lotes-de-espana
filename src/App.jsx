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
import {
  listProducts, upsertProduct, deleteProduct, uploadProductPhoto,
  listBodegones, updateBodegon, deleteBodegon,
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

  // Bodegón
  const [bodegonNumber, setBodegonNumber] = useState(1);
  const [bodegonTitle, setBodegonTitle] = useState('');
  const [bodegonDesc, setBodegonDesc] = useState('');
  const [bodegonOpen, setBodegonOpen] = useState(false);

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

  // Llamado desde SpecialOrderModal: precarga selección y lanza el overlay.
  const handleSpecialOrderConfirm = ({ items, title, description }) => {
    if (!items || !items.length) return;
    const skus = items.map(i => i.sku);
    const qtyMap = Object.fromEntries(items.map(i => [i.sku, i.qty || 1]));
    setSelected(skus);
    setQtys(qtyMap);
    setBodegonTitle(title || `Bodegón IA #${bodegonNumber}`);
    setBodegonDesc(description || '');
    setSpecialOrderOpen(false);
    setBodegonOpen(true);
  };

  const handleCreate = () => {
    if (selected.length < 2) {
      showInfo({
        icon: 'sparkle',
        tone: 'info',
        title: 'Selecciona al menos 2 productos',
        description: 'Para crear un bodegón necesitas elegir como mínimo 2 productos del catálogo.',
        confirmLabel: 'Entendido',
        confirmTone: 'neutral',
      });
      return;
    }
    const missing = selected.filter(sku => {
      const p = products.find(x => x.sku === sku);
      return !p || !p.img;
    });
    if (missing.length) {
      showInfo({
        icon: 'upload',
        tone: 'info',
        title: 'Algunos productos no tienen foto',
        description: (
          <>
            No se puede generar el bodegón porque <strong>{missing.length} producto{missing.length === 1 ? '' : 's'}</strong> no tiene{missing.length === 1 ? '' : 'n'} foto: <strong>{missing.join(', ')}</strong>.
            <br/><br/>
            Edita esos productos y sube una imagen antes de incluirlos.
          </>
        ),
        confirmLabel: 'Entendido',
        confirmTone: 'neutral',
      });
      return;
    }
    setBodegonTitle(`Bodegón IA #${bodegonNumber}`);
    setBodegonDesc('');
    setBodegonOpen(true);
  };

  const handleSavedBodegon = async (gen) => {
    setBodegonOpen(false);
    setBodegonNumber(n => n + 1);
    // Refrescar el historial desde la base de datos para que aparezca el guardado
    try {
      const bs = await listBodegones();
      setHistory(bs);
    } catch (e) { console.error(e); }
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
        onClose={() => setBodegonOpen(false)}
        products={products}
        selected={selected}
        qtys={qtys}
        title={bodegonTitle} setTitle={setBodegonTitle}
        description={bodegonDesc} setDescription={setBodegonDesc}
        onSaved={handleSavedBodegon}
        onDeleted={handleDeletedBodegon}
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
          onConfirm={({ items, title, description }) => {
            setEditBodegon(null);
            handleSpecialOrderConfirm({ items, title, description });
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
