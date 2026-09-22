import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configurados — copie apps/web/.env.example para .env.local e preencha."
  );
}

// Usa um URL de placeholder válido quando ainda não configurado, só para o
// cliente não rebentar ao carregar o módulo — nenhuma chamada de rede
// acontece antes de isSupabaseConfigured ser checado pela UI.
export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder-anon-key");
