import { NextResponse } from "next/server";
import {
  LAB_PACKAGES_TABLE,
  LAB_PACKAGE_TESTS_TABLE,
  type LabPackageWithTests,
} from "@/lib/labPackages";
import { LAB_REQUEST_PACKAGES_TABLE } from "@/lib/labRequests";
import { normalizePackageLabTestIdsForStorage } from "@/lib/labTests";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

function adminOr500() {
  const db = supabaseAdminClient();
  if (!db) {
    return {
      db: null as null,
      res: NextResponse.json(
        { error: "Server missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL." },
        { status: 500 },
      ),
    };
  }
  return { db, res: null as null };
}

function numPrice(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

async function loadPackagesWithTests(db: NonNullable<ReturnType<typeof supabaseAdminClient>>): Promise<{
  packages: LabPackageWithTests[];
  error: string | null;
}> {
  const { data: pkgRows, error: pErr } = await db
    .from(LAB_PACKAGES_TABLE)
    .select("id, name, description, is_active, sort_order, package_price")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (pErr) return { packages: [], error: pErr.message };

  const packagesRaw = (pkgRows ?? []) as Array<Record<string, unknown>>;
  if (packagesRaw.length === 0) return { packages: [], error: null };

  const pkgIds = packagesRaw.map((r) => String(r.id ?? "")).filter(Boolean);
  const { data: linkRows, error: lErr } = await db
    .from(LAB_PACKAGE_TESTS_TABLE)
    .select("lab_package_id, lab_test_id, sort_order")
    .in("lab_package_id", pkgIds)
    .order("sort_order", { ascending: true, nullsFirst: false });

  if (lErr) return { packages: [], error: lErr.message };

  const byPkg = new Map<string, string[]>();
  for (const row of (linkRows ?? []) as Array<{ lab_package_id: string | number; lab_test_id: string }>) {
    const pid = String(row.lab_package_id ?? "");
    const tid = String(row.lab_test_id ?? "").trim();
    if (!pid || !tid) continue;
    const list = byPkg.get(pid) ?? [];
    list.push(tid);
    byPkg.set(pid, list);
  }

  const packages: LabPackageWithTests[] = packagesRaw.map((r) => {
    const id = String(r.id ?? "");
    return {
      id,
      name: String(r.name ?? ""),
      description: (r.description as string | null) ?? null,
      is_active: r.is_active !== false,
      sort_order: r.sort_order == null || r.sort_order === "" ? null : Number(r.sort_order),
      package_price: numPrice(r.package_price),
      labTestIds: byPkg.get(id) ?? [],
    };
  });

  return { packages, error: null };
}

function dedupeTestIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function GET() {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { packages, error } = await loadPackagesWithTests(db);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ packages });
}

export async function POST(req: Request) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    description?: string | null;
    package_price?: number | string | null;
    is_active?: boolean;
    sort_order?: number | null;
    lab_test_ids?: string[];
  } | null;

  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  const description =
    body?.description === undefined || body?.description === null
      ? null
      : String(body.description).trim() || null;

  let package_price = 0;
  if (body?.package_price != null && body.package_price !== ("" as unknown)) {
    const p = typeof body.package_price === "number" ? body.package_price : Number(String(body.package_price));
    package_price = Number.isFinite(p) ? p : 0;
  }

  const is_active = body?.is_active !== false;
  const sort_order =
    body?.sort_order == null || body.sort_order === ("" as unknown)
      ? null
      : Number(body.sort_order);
  const labTestIdsRaw = dedupeTestIds(Array.isArray(body?.lab_test_ids) ? body!.lab_test_ids! : []);
  const normalized = await normalizePackageLabTestIdsForStorage(db, labTestIdsRaw);
  if (normalized.error) return NextResponse.json({ error: normalized.error }, { status: 400 });
  const labTestIds = normalized.testIds;

  const insertPkg: Record<string, unknown> = {
    name,
    description,
    package_price,
    is_active,
    sort_order: Number.isFinite(sort_order as number) ? sort_order : null,
  };

  const { data: created, error: insErr } = await db
    .from(LAB_PACKAGES_TABLE)
    .insert(insertPkg)
    .select("id, name, description, is_active, sort_order, package_price")
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
  if (!created) return NextResponse.json({ error: "Insert failed." }, { status: 500 });

  const pkgIdRaw = (created as Record<string, unknown>).id;
  const pkgId = typeof pkgIdRaw === "number" ? pkgIdRaw : Number.parseInt(String(pkgIdRaw ?? ""), 10);
  if (!Number.isFinite(pkgId) || pkgId <= 0) {
    return NextResponse.json({ error: "Package id missing after insert." }, { status: 500 });
  }

  if (labTestIds.length > 0) {
    const linkRows = labTestIds.map((lab_test_id, idx) => ({
      lab_package_id: pkgId,
      lab_test_id,
      sort_order: idx,
    }));
    const { error: linkErr } = await db.from(LAB_PACKAGE_TESTS_TABLE).insert(linkRows);
    if (linkErr) {
      await db.from(LAB_PACKAGES_TABLE).delete().eq("id", pkgId);
      return NextResponse.json({ error: linkErr.message }, { status: 400 });
    }
  }

  const { packages, error: loadErr } = await loadPackagesWithTests(db);
  if (loadErr) return NextResponse.json({ error: loadErr }, { status: 400 });
  const pkg = packages.find((p) => p.id === String(pkgId));
  if (!pkg) return NextResponse.json({ error: "Created package could not be reloaded." }, { status: 500 });

  return NextResponse.json({ package: pkg });
}
