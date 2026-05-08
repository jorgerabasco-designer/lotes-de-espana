import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Catalog from './components/Catalog.jsx';
import ProductsScreen from './components/ProductsScreen.jsx';
import ProductEditOverlay from './components/ProductEditOverlay.jsx';
import HistoryScreen from './components/HistoryScreen.jsx';
import SettingsScreen from './components/SettingsScreen.jsx';
import BodegonOverlay from './components/BodegonOverlay.jsx';
import ImportExcelModal from './components/ImportExcelModal.jsx';
import { CAT_LABELS } from './lib/constants.js';
import {
  listProducts, upsertProduct, deleteProduct,
  listBodegones, updateBodegon, deleteBodegon,
} from './lib/api.js';
import { SUPABASE_READY } from './lib/supabase.js';

export default function App() {
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
    const set = new Set(products.map(p => p.cat));
    return Object.entries(CAT_LABELS)
      .filter(([id]) => set.has(id))
      .map(([id, label]) => ({ id, label }));
  }, [products]);
  const allTags = ['Vegano', 'Bio', 'Con alcohol', 'Sin gluten'];

  const toggle = (sku) => setSelected(s => s.includes(sku) ? s.filter(x => x !== sku) : [...s, sku]);
  const clearSel = () => setSelected([]);

  const handleCreate = () => {
    if (selected.length === 0) return;
    setBodegonTitle(`Bodegón IA #${bodegonNumber}`);
    setBodegonDesc('');
    setBodegonOpen(true);
  };

  const handleSavedBodegon = (gen) => {
    setBodegonOpen(false);
    setBodegonNumber(n => n + 1);
    if (gen) {
      setHistory(h => [{
        id: gen.id || `tmp-${Date.now()}`,
        n: gen.n || bodegonNumber,
        title: gen.title || bodegonTitle,
        description: bodegonDesc,
        skus: selected,
        image: gen.image || null,
        image_path: gen.image_path || null,
        created_at: new Date().toISOString(),
      }, ...h]);
    }
  };

  const handleDeletedBodegon = async (id) => {
    if (id && SUPABASE_READY) {
      try { await deleteBodegon(id); } catch (e) { console.error(e); }
    }
    setHistory(h => h.filter(x => x.id !== id));
  };

  const openNew = () => { setEditProduct(null); setEditOpen(true); };
  const openEdit = (p) => { setEditProduct(p); setEditOpen(true); };

  const handleSaveProduct = async (form) => {
    try {
      const saved = await upsertProduct(form);
      setProducts(ps => {
        const i = ps.findIndex(x => x.sku === saved.sku);
        if (i >= 0) {
          const next = [...ps]; next[i] = { ...ps[i], ...saved }; return next;
        }
        return [saved, ...ps];
      });
      setEditOpen(false);
    } catch (e) {
      alert('Error guardando producto: ' + e.message);
    }
  };

  const handleDeleteProduct = async (sku) => {
    try {
      await deleteProduct(sku);
      setProducts(ps => ps.filter(p => p.sku !== sku));
      setSelected(s => s.filter(x => x !== sku));
    } catch (e) {
      alert('Error eliminando producto: ' + e.message);
    }
  };

  const handleImport = async (rows) => {
    let added = 0;
    for (const p of rows) {
      try {
        const saved = await upsertProduct({ ...p, tags: p.tags || [] });
        setProducts(ps => {
          const i = ps.findIndex(x => x.sku === saved.sku);
          if (i >= 0) { const next = [...ps]; next[i] = saved; return next; }
          return [saved, ...ps];
        });
        added++;
      } catch (e) {
        console.error('No se pudo importar', p.sku, e);
      }
    }
    alert(`✓ Importados ${added} productos.`);
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
          query={query} setQuery={setQuery}
          sort={sort} setSort={setSort}
          cat={cat} tags={tags} selBrands={selBrands}
          onCreate={handleCreate}
          onClearSel={clearSel}
          onCreateProduct={openNew}
          onImport={() => setImportOpen(true)}
        />
      )}

      {!loading && active === 'products' && (
        <ProductsScreen products={products} onEdit={openEdit} onDelete={handleDeleteProduct} onNew={openNew}/>
      )}

      {!loading && active === 'history' && (
        <HistoryScreen
          products={products}
          history={history}
          onRename={handleRenameBodegon}
          onDelete={handleDeletedBodegon}
        />
      )}

      {!loading && active === 'settings' && <SettingsScreen/>}

      <ProductEditOverlay
        open={editOpen}
        product={editProduct}
        onClose={() => setEditOpen(false)}
        onSave={handleSaveProduct}
      />

      <ImportExcelModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />

      <BodegonOverlay
        open={bodegonOpen}
        onClose={() => setBodegonOpen(false)}
        products={products}
        selected={selected}
        title={bodegonTitle} setTitle={setBodegonTitle}
        description={bodegonDesc} setDescription={setBodegonDesc}
        onSaved={handleSavedBodegon}
        onDeleted={handleDeletedBodegon}
      />

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
