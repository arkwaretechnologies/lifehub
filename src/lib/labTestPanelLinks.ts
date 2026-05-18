import type { SupabaseClient } from "@supabase/supabase-js";
import type { LabTestCatalogItem } from "@/lib/labTests";

export const LAB_TEST_PANEL_LINKS_TABLE = "lab_test_panel_links" as const;

export type LabTestPanelLinkRow = {
  component_lab_test_id: string;
  panel_lab_test_id: string;
};

/** Group panel ids by component test id. */
export function groupPanelIdsByComponentId(
  rows: readonly LabTestPanelLinkRow[],
): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of rows) {
    const cid = String(r.component_lab_test_id ?? "").trim();
    const pid = String(r.panel_lab_test_id ?? "").trim();
    if (!cid || !pid) continue;
    const list = m.get(cid) ?? [];
    if (!list.includes(pid)) list.push(pid);
    m.set(cid, list);
  }
  return m;
}

export async function fetchPanelLinksForComponentIds(
  db: SupabaseClient,
  componentIds: string[],
): Promise<{ linksByComponentId: Map<string, string[]>; error: string | null }> {
  const ids = [...new Set(componentIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return { linksByComponentId: new Map(), error: null };

  const res = await db
    .from(LAB_TEST_PANEL_LINKS_TABLE)
    .select("component_lab_test_id, panel_lab_test_id")
    .in("component_lab_test_id", ids);

  if (res.error) return { linksByComponentId: new Map(), error: res.error.message };

  const rows = (res.data ?? []) as LabTestPanelLinkRow[];
  return { linksByComponentId: groupPanelIdsByComponentId(rows), error: null };
}

export async function fetchPanelLinksForPanelIds(
  db: SupabaseClient,
  panelIds: string[],
): Promise<{ links: LabTestPanelLinkRow[]; error: string | null }> {
  const ids = [...new Set(panelIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return { links: [], error: null };

  const res = await db
    .from(LAB_TEST_PANEL_LINKS_TABLE)
    .select("component_lab_test_id, panel_lab_test_id")
    .in("panel_lab_test_id", ids);

  if (res.error) return { links: [], error: res.error.message };
  return { links: (res.data ?? []) as LabTestPanelLinkRow[], error: null };
}

export async function attachPanelLinksToCatalogItems(
  db: SupabaseClient,
  tests: LabTestCatalogItem[],
): Promise<{ tests: LabTestCatalogItem[]; error: string | null }> {
  if (tests.length === 0) return { tests, error: null };

  const componentIds = tests.map((t) => t.id);
  const { linksByComponentId, error } = await fetchPanelLinksForComponentIds(db, componentIds);
  if (error) return { tests, error };

  const enriched = tests.map((t) => {
    const ids = linksByComponentId.get(t.id);
    return { ...t, panel_lab_test_ids: ids ?? [] };
  });
  return { tests: enriched, error: null };
}

/** Replace all panel links for a component test (result line or hybrid orderable+linked). */
export async function syncLabTestPanelLinks(
  db: SupabaseClient,
  componentTestId: string,
  panelIds: string[],
): Promise<{ error: string | null }> {
  const cid = componentTestId.trim();
  if (!cid) return { error: "Invalid lab test id." };

  const uniquePanelIds = [
    ...new Set(panelIds.map((x) => String(x).trim()).filter(Boolean)),
  ];

  const { error: delErr } = await db
    .from(LAB_TEST_PANEL_LINKS_TABLE)
    .delete()
    .eq("component_lab_test_id", cid);
  if (delErr) return { error: delErr.message };

  if (uniquePanelIds.length === 0) return { error: null };

  const rows = uniquePanelIds.map((panel_lab_test_id) => ({
    component_lab_test_id: cid,
    panel_lab_test_id,
  }));

  const { error: insErr } = await db.from(LAB_TEST_PANEL_LINKS_TABLE).insert(rows);
  return { error: insErr?.message ?? null };
}

export async function countComponentsForPanel(
  db: SupabaseClient,
  panelTestId: string,
): Promise<{ count: number; error: string | null }> {
  const pid = panelTestId.trim();
  if (!pid) return { count: 0, error: "Invalid panel test id." };

  const { count, error } = await db
    .from(LAB_TEST_PANEL_LINKS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("panel_lab_test_id", pid);

  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}
