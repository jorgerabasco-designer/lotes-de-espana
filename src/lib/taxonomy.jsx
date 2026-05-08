import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSetting, setSetting } from './api.js';
import { DEFAULT_CATEGORIES, DEFAULT_TAGS, makeCatLabels, makeCatOpts } from './constants.js';

const TaxCtx = createContext(null);

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function TaxonomyProvider({ children }) {
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [c, t] = await Promise.all([
          getSetting('categories', null),
          getSetting('tags', null),
        ]);
        if (Array.isArray(c) && c.length) setCategories(c);
        if (Array.isArray(t) && t.length) setTags(t);
      } catch (e) {
        console.warn('No se pudo cargar la taxonomía, uso valores por defecto.', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persistCategories = async (next) => {
    setCategories(next);
    try { await setSetting('categories', next); } catch (e) { console.error('Error guardando categorías:', e); }
  };
  const persistTags = async (next) => {
    setTags(next);
    try { await setSetting('tags', next); } catch (e) { console.error('Error guardando etiquetas:', e); }
  };

  const addCategory = (label) => {
    const v = String(label || '').trim();
    if (!v) return false;
    const id = slugify(v);
    if (!id) return false;
    if (categories.some(c => c.id === id)) return false;
    persistCategories([...categories, { id, label: v }]);
    return true;
  };

  const updateCategory = (id, label) => {
    const v = String(label || '').trim();
    if (!v) return;
    persistCategories(categories.map(c => c.id === id ? { ...c, label: v } : c));
  };

  const removeCategory = (id) => persistCategories(categories.filter(c => c.id !== id));

  const addTag = (label) => {
    const v = String(label || '').trim();
    if (!v) return false;
    const id = slugify(v);
    if (!id) return false;
    if (tags.some(t => t.id === id)) return false;
    persistTags([...tags, { id, label: v }]);
    return true;
  };

  const updateTag = (id, label) => {
    const v = String(label || '').trim();
    if (!v) return;
    persistTags(tags.map(t => t.id === id ? { ...t, label: v } : t));
  };

  const removeTag = (id) => persistTags(tags.filter(t => t.id !== id));

  const value = useMemo(() => ({
    loaded,
    categories,
    tags,
    catLabels: makeCatLabels(categories),
    catOpts: makeCatOpts(categories),
    tagLabels: Object.fromEntries(tags.map(t => [t.id, t.label])),
    addCategory, updateCategory, removeCategory,
    addTag, updateTag, removeTag,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [loaded, categories, tags]);

  return <TaxCtx.Provider value={value}>{children}</TaxCtx.Provider>;
}

export function useTaxonomy() {
  const v = useContext(TaxCtx);
  if (!v) throw new Error('useTaxonomy debe usarse dentro de <TaxonomyProvider>');
  return v;
}
