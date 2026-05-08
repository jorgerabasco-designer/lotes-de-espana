import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_READY = Boolean(url && anonKey);

export const supabase = SUPABASE_READY
  ? createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export const STORAGE_BUCKET_PRODUCTS = 'productos';
export const STORAGE_BUCKET_BODEGONES = 'bodegones';

export function publicUrl(bucket, path) {
  if (!supabase || !path) return path || '';
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || '';
}
