import { NextResponse } from "next/server";
import { LAB_PACKAGES_TABLE, LAB_PACKAGE_TESTS_TABLE, labPackageHasMembers } from "@/lib/labPackages";
import { loadOnePackageAdmin, loadPackagesWithMembersAdmin } from "@/lib/labPackagesAdmin";
import { normalizePackageImagingCatalogIdsForStorage } from "@/lib/imagingCatalog";
import { normalizePackageLabTestIdsForStorage } from "@/lib/labTests";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";
import { afterLaboratoryCatalogSettingsMutation } from "@/lib/cacheInvalidation";

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

function dedupeIds(ids: string[]): string[] {
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

  const { packages, error } = await loadPackagesWithMembersAdmin(db);
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
    imaging_catalog_ids?: string[];
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
  const labTestIdsRaw = dedupeIds(Array.isArray(body?.lab_test_ids) ? body!.lab_test_ids! : []);
  const normalized = await normalizePackageLabTestIdsForStorage(db, labTestIdsRaw);
  if (normalized.error) return NextResponse.json({ error: normalized.error }, { status: 400 });
  const labTestIds = normalized.testIds;

  const imagingRaw = dedupeIds(Array.isArray(body?.imaging_catalog_ids) ? body!.imaging_catalog_ids! : []);
  const imagingNorm = await normalizePackageImagingCatalogIdsForStorage(db, imagingRaw);
  if (imagingNorm.error) return NextResponse.json({ error: imagingNorm.error }, { status: 400 });
  const imagingCatalogIds = imagingNorm.catalogIds;

  if (!labPackageHasMembers({ labTestIds, imagingCatalogIds })) {
    return NextResponse.json(
      { error: "Select at least one laboratory test or imaging study for the package." },
      { status: 400 },
    );
  }

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

  if (imagingCatalogIds.length > 0) {
    const imgRows = imagingCatalogIds.map((imaging_catalog_id, idx) => ({
      lab_package_id: pkgId,
      imaging_catalog_id,
      sort_order: idx,
    }));
    const { error: imgErr } = await db.from("lab_package_imaging").insert(imgRows);
    if (imgErr) {
      await db.from(LAB_PACKAGES_TABLE).delete().eq("id", pkgId);
      return NextResponse.json({ error: imgErr.message }, { status: 400 });
    }
  }

  const { package: pkg, error: loadErr } = await loadOnePackageAdmin(db, pkgId);
  if (loadErr) return NextResponse.json({ error: loadErr }, { status: 400 });
  if (!pkg) return NextResponse.json({ error: "Created package could not be reloaded." }, { status: 500 });

  await afterLaboratoryCatalogSettingsMutation();
  return NextResponse.json({ package: pkg });
}
