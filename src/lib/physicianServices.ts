import { supabase } from "@/lib/supabaseClient";

export const PHYSICIAN_SERVICES_TABLE = "physician_services" as const;

export type PhysicianServiceRow = {
  id: number;
  code: string;
  name: string;
  service_type: string;
  description: string | null;
  default_fee: number | string;
  is_active: boolean | null;
  sort_order: number | null;
};

function isActiveRow(v: boolean | null | undefined): boolean {
  return v !== false;
}

function sortServices(a: PhysicianServiceRow, b: PhysicianServiceRow): number {
  const sa = a.sort_order ?? 0;
  const sb = b.sort_order ?? 0;
  if (sa !== sb) return sa - sb;
  const ta = (a.service_type ?? "").localeCompare(b.service_type ?? "", undefined, { sensitivity: "base" });
  if (ta !== 0) return ta;
  return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
}

export async function fetchActivePhysicianServices(): Promise<{
  services: PhysicianServiceRow[];
  error: string | null;
}> {
  const res = await supabase
    .from(PHYSICIAN_SERVICES_TABLE)
    .select("id, code, name, service_type, description, default_fee, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("service_type", { ascending: true })
    .order("name", { ascending: true });

  if (res.error) return { services: [], error: res.error.message };
  const rows = (res.data ?? []) as PhysicianServiceRow[];
  const active = rows.filter((r) => isActiveRow(r.is_active)).sort(sortServices);
  return { services: active, error: null };
}

