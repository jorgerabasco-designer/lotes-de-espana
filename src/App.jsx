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
import BodegonEditorOverlay from './components/BodegonEditorOverlay.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import WebScreen from './components/WebScreen.jsx';
import MinimizedGenPill from './components/MinimizedGenPill.jsx';
import {
  listProducts, upsertProduct, deleteProduct, uploadProductPhoto,
  listBodegones, updateBodegon, deleteBodegon,
  startBodegonGeneration, pollBodegon, commitBodegon, discardBodegon,
  listInProgress,
} from './lib/api.js';
import { SUPABASE_READY } from './lib/supabase.js';
import { useTaxonomy } from './lib/taxonomy.jsx';

// Mapa vista ↔ path para que cada tab tenga URL propia y se puedan compartir.
// El fallback SPA de Netlify (netlify.toml) ya redirige cualquier ruta a
// index.html, así que estos paths funcionan en producción tal cual.
const VIEW_PATHS = {
  catalog:  '/catalogo',
  products: '/productos',
  history:  '/historial',
  settings: '/configuracion',
  web:      '/pdfs-web',
};
function pathFromView(view) {
  return VIEW_PATHS[view] || '/';
}
function viewFromPath(path) {
  const p = String(path || '').replace(/\/+$/, '') || '/';
  const hit = Object.entries(VIEW_PATHS).find(([, v]) => v === p);
  return hit ? hit[0] : 'catalog';
}

export default function App() {
  const taxonomy = useTaxonomy();
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState([]);
  const [active, setActiveRaw] = useState(() => viewFromPath(window.location.pathname));

  // Cambia la vista activa y refleja el cambio en la URL (history.pushState).
  const setActive = React.useCallback((view) => {
    setActiveRaw(view);
    const targetPath = pathFromView(view);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ view }, '', targetPath);
    }
  }, []);

  // Al navegar con el back/forward del navegador, sincronizamos el state.
  useEffect(() => {
    const onPop = () => setActiveRaw(viewFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
  const [editorGen, setEditorGen] = useState(null); // bodegón abierto en el editor de maqueta

  // Diálogo informativo / de aviso global (sustituye a los alert() nativos).
  // Se rellena con { title, description, icon, tone, confirmLabel, onConfirm? }
  const [infoModal, setInfoModal] = useState(null);
  const showInfo = (cfg) => setInfoModal(cfg);

  // Bodegón — COLA de generaciones en background.
  //   activeGens   array de generaciones vivas (status: generating | draft | failed).
  //                Cada entrada: { ref, title, description, tags, items, status,
  //                image, image_path, error, t0 }. Sobreviven a cerrar el overlay
  //                (minimizar) y, gracias a Supabase, a recargar la página.
  //   viewingRef   cuál se está viendo en el BodegonOverlay grande. null = cerrado.
  //                El usuario puede tener N en cola y abrir solo una a la vez.
  const [bodegonNumber, setBodegonNumber] = useState(1);
  const [activeGens, setActiveGens] = useState([]);
  const [viewingRef, setViewingRef] = useState(null);

  // Helpers para mutar la cola de forma segura.
  const addGen = (gen) => setActiveGens(gs => [...gs, gen]);
  const updateGen = (ref, patch) => setActiveGens(gs =>
    gs.map(g => g.ref === ref ? { ...g, ...patch } : g)
  );
  const removeGen = (ref) => setActiveGens(gs => gs.filter(g => g.ref !== ref));
  const viewingGen = activeGens.find(g => g.ref === viewingRef) || null;

  // Initial load. Recogemos también las generaciones que estaban en cola en
  // Supabase: si el usuario recargó la web mientras se generaba un bodegón,
  // al volver lo encuentra en "En curso" sin perder nada.
  useEffect(() => {
    (async () => {
      try {
        const [ps, bs, queue] = await Promise.all([
          listProducts(),
          listBodegones(),
          listInProgress().catch(() => []),
        ]);
        setProducts(ps);
        setHistory(bs);
        if (queue.length) setActiveGens(queue);
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

  // Notifica al sistema (solo si hay permiso y el overlay no muestra ya esa gen).
  // El click en la notificación abre EL bodegón concreto que terminó.
  const notifyBodegonReady = (ref, title) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const n = new Notification('Bodegón listo', {
        body: title || 'Tu bodegón está listo para revisar.',
        icon: '/favicon.ico',
        tag: 'bodegon-' + ref, // tag por gen evita que se sobrescriban entre sí
      });
      n.onclick = () => {
        try { window.focus(); } catch {}
        setViewingRef(ref);
        try { n.close(); } catch {}
      };
    } catch {}
  };

  // Arranca una generación nueva. Se PERMITE tener varias en cola (multi-gen):
  // al lanzarla se añade a `activeGens` y se abre el overlay para verla. Si
  // ya hay otra abierta, se minimiza y la nueva pasa al primer plano.
  const startBodegon = async ({ items, extras, title, description, tags, layout, instrucciones, layoutEditado }) => {
    // `items` puede venir mezclado (productos del catálogo + extras sin foto),
    // porque al regenerar se reutiliza la lista completa del bodegón anterior.
    // Separarlos aquí evita que un extra acabe colándose como producto.
    const all = items || [];
    const realItems = all.filter(it => it.sku).map(it => ({ sku: it.sku, qty: it.qty || 1 }));
    const extraItems = [
      ...all.filter(it => !it.sku).map(it => ({ name: it.name, ref: it.ref || null, qty: it.qty || 1 })),
      ...(extras || []).map(e => ({ name: e.name, ref: e.ref || null, qty: e.qty || 1 })),
    ];
    if (realItems.length < 2) return;
    ensureNotifPermission();
    try {
      const created = await startBodegonGeneration({
        items: realItems, extras: extraItems, title, description: description || '', tags: tags || [],
        layout: layout || null,
        instrucciones: instrucciones || '',
        layoutEditado: !!layoutEditado,
        products,   // el catálogo: hace falta para montar maqueta y hoja de contactos
      });
      const gen = {
        ref: created.id,
        title: created.title || title || `Bodegón IA #${bodegonNumber}`,
        description: description || '',
        tags: tags || [],
        // items = productos con foto (sku) + extras sin foto (name), para que el
        // PDF y el listado los muestren todos.
        items: [
          ...realItems,
          ...extraItems.map(e => ({ sku: null, name: e.name, ref: e.ref, qty: e.qty })),
        ],
        layout: created.layout || layout || null,
        instrucciones: instrucciones || '',
        status: 'generating',
        image: null,
        image_path: null,
        error: null,
        t0: Date.now(),
      };
      addGen(gen);
      setViewingRef(created.id);
      setBodegonNumber(n => n + 1); // siguiente nombre por defecto, sin esperar guardar
    } catch (e) {
      showInfo({
        icon: 'trash', tone: 'danger',
        title: 'No se pudo iniciar el bodegón',
        description: e.message || 'Error desconocido al registrar el bodegón.',
        confirmLabel: 'Cerrar', confirmTone: 'neutral',
      });
    }
  };

  // Polling MULTI — un poll por cada gen en 'generating'. pollingRefs guarda
  // los refs con un poll en curso para no duplicar al re-renderizar.
  const pollingRefs = React.useRef(new Set());
  const viewingRefRef = React.useRef(null);
  viewingRefRef.current = viewingRef;
  useEffect(() => {
    for (const gen of activeGens) {
      if (gen.status !== 'generating') continue;
      if (pollingRefs.current.has(gen.ref)) continue;
      pollingRefs.current.add(gen.ref);
      const ref = gen.ref;
      const fixedTitle = gen.title;
      (async () => {
        try {
          const result = await pollBodegon(ref);
          updateGen(ref, {
            status: 'draft',
            image: result.image,
            image_path: result.image_path,
          });
          // Notifica solo si no está siendo vista en este momento.
          if (viewingRefRef.current !== ref) notifyBodegonReady(ref, fixedTitle);
        } catch (e) {
          updateGen(ref, { status: 'failed', error: e.message || String(e) });
        } finally {
          pollingRefs.current.delete(ref);
        }
      })();
    }
  }, [activeGens]);

  // Llamado desde SpecialOrderModal y BodegonEditOverlay → arranca la generación.
  const handleSpecialOrderConfirm = ({ items, extras, title, description, tags }) => {
    if (!items || !items.length) return;
    setSpecialOrderOpen(false);
    startBodegon({
      items,
      extras: extras || [],
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
    // Tras lanzar, vaciamos la selección para que el usuario pueda armar el
    // siguiente bodegón inmediatamente.
    clearSel();
    startBodegon({
      items,
      title: `Bodegón IA #${bodegonNumber}`,
      description: '',
      tags: [],
    });
  };

  // ---- Acciones desde el BodegonOverlay ----
  // Operan SIEMPRE sobre la generación que se está viendo (viewingGen).
  // Minimizar/X = solo cerrar la vista; la gen sigue corriendo en background.
  const handleOverlayMinimize = () => setViewingRef(null);
  // "Editar y regenerar": abre el editor de maqueta en vez de repetir la
  // generación a ciegas (que solía repetir los mismos fallos).
  const handleOverlayRegen = () => {
    if (viewingGen) setEditorGen(viewingGen);
  };

  // Editar la composición de un bodegón ya guardado en el historial. El
  // original NO se borra: se genera uno nuevo y ellas deciden cuál se quedan.
  const handleEditHistoryLayout = (b) => {
    if (!b) return;
    setEditorGen({
      ref: b.id,
      title: b.title,
      description: b.description || '',
      tags: b.tags || [],
      items: b.items || (b.skus || []).map(s => ({ sku: s, qty: 1 })),
      image: b.image,
      layout: b.layout || null,
      instrucciones: b.instrucciones || '',
      fromHistory: true,
    });
  };

  // Vuelve a generar el bodegón aplicando la maqueta y las correcciones.
  //
  // El orden importa para que no parpadee: primero se arranca la generación
  // nueva (que ya deja el overlay abierto en "generando"), y solo entonces se
  // cierra el editor y se tira el bodegón viejo. Antes se cerraba todo primero
  // y aparecía una ventana nueva unos segundos después, sin nada en medio.
  const handleEditorApply = async ({ layout, instrucciones }) => {
    const gen = editorGen;
    if (!gen) return;
    const { items, title, description, tags } = gen;
    const oldRef = gen.ref;
    try {
      await startBodegon({
        items, title, description, tags,
        layout, instrucciones, layoutEditado: true,
      });
    } finally {
      setEditorGen(null);
      // Si venía del historial, el bodegón guardado se conserva: el nuevo se
      // añade aparte y ya deciden ellas con cuál se quedan.
      if (!gen.fromHistory) {
        removeGen(oldRef);
        discardBodegon(oldRef).catch(() => {});
      }
    }
  };
  const handleOverlaySave = async () => {
    const gen = viewingGen;
    if (!gen || gen.status !== 'draft') return;
    const saved = await commitBodegon(gen.ref, {
      nombre: gen.title,
      descripcion: gen.description || null,
      tags: gen.tags || [],
    });
    removeGen(gen.ref);
    setViewingRef(null);
    try { const bs = await listBodegones(); setHistory(bs); } catch (e) { console.error(e); }
    return saved;
  };
  const handleOverlayDiscard = async () => {
    const gen = viewingGen;
    if (!gen) return;
    const ref = gen.ref;
    removeGen(ref);
    setViewingRef(null);
    try { await discardBodegon(ref); } catch (e) { console.warn(e); }
  };
  // Actualizar metadatos en la gen que se está viendo.
  const handleOverlayUpdateMeta = (patch) => {
    if (viewingRef) updateGen(viewingRef, patch);
  };
  // Click en una card de "En curso" del historial: abre el overlay de esa gen.
  const handleViewGen = (ref) => setViewingRef(ref);

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
          activeGens={activeGens}
          onRename={handleRenameBodegon}
          onDelete={handleDeletedBodegon}
          onRefresh={refreshHistory}
          onEdit={(b) => setEditBodegon(b)}
          onEditLayout={handleEditHistoryLayout}
          onViewGen={handleViewGen}
        />
      )}

      {!loading && active === 'settings' && <SettingsScreen products={products} onProductsChanged={refreshProducts}/>}

      {!loading && active === 'web' && <WebScreen showInfo={showInfo}/>}

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
        open={!!viewingGen}
        activeGen={viewingGen}
        products={products}
        onMinimize={handleOverlayMinimize}
        onRegen={handleOverlayRegen}
        onSave={handleOverlaySave}
        onDiscard={handleOverlayDiscard}
        onUpdateMeta={handleOverlayUpdateMeta}
      />

      {/* Píldora: muestra la última gen activa que NO se esté viendo. Si solo
          hay una y está en el overlay, se oculta. Si hay varias en cola con
          el overlay cerrado, muestra la más reciente. */}
      <MinimizedGenPill
        activeGens={activeGens}
        viewingRef={viewingRef}
        onOpen={(ref) => setViewingRef(ref)}
        onCancel={(ref) => {
          removeGen(ref);
          discardBodegon(ref).catch(() => {});
        }}
      />

      <SpecialOrderModal
        open={specialOrderOpen}
        onClose={() => setSpecialOrderOpen(false)}
        products={products}
        onConfirm={handleSpecialOrderConfirm}
      />

      <BodegonEditorOverlay
        open={!!editorGen}
        gen={editorGen}
        products={products}
        onClose={() => setEditorGen(null)}
        onApply={handleEditorApply}
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
