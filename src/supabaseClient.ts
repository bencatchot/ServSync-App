import { createClient } from '@supabase/supabase-js';

export const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(configuredSupabaseUrl && supabaseAnonKey);

export const supabase = supabaseConfigured
  ? createClient(configuredSupabaseUrl, supabaseAnonKey)
  : null;
