import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Browser: only NEXT_PUBLIC_* is available. Server: SUPABASE_* also works.
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

function buildClient(): SupabaseClient {
  if (!url || !anonKey || !url.startsWith("http")) {
    return createClient("https://placeholder.supabase.co", "placeholder-anon-key");
  }
  return createClient(url, anonKey);
}

export const supabase = buildClient();
