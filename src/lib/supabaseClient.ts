import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://ytukrmdelbaieadwinww.supabase.co";

const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  "sb_publishable_vyS5BrO_ojzJM9v_5-_yXA_neGM2Biz";

function buildClient(): SupabaseClient {
  if (!url.startsWith("http") || !key) {
    return createClient("https://placeholder.supabase.co", "placeholder");
  }
  return createClient(url, key);
}

export const supabase = buildClient();
