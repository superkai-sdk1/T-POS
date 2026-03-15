import { createClient } from '@supabase/supabase-js';

const directUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const supabaseUrl = import.meta.env.PROD
  ? `${window.location.origin}/sb`
  : directUrl;

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [!supabaseUrl && 'VITE_SUPABASE_URL', !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY'].filter(Boolean).join(', ');
  throw new Error(`Supabase не настроен. Добавьте в .env: ${missing}`);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
