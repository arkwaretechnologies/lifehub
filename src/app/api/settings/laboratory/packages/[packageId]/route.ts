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

function parsePackageId(raw: string): number | null {
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function numPrice(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
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

async function loadOnePackage(
  db: NonNullable<ReturnType<typeof supabaseAdminClient>>,
  packageId: number,
): Promise<{ package: LabPackageWithTests | null; error: string | null }> {
  const { data: row, error: pErr } = await db
    .from(LAB_PACKAGES_TABLE)
    .select("id, name, description, is_active, sort_order, package_price")
    .eq("id", packageId)
    .maybeSingle();

  if (pErr) return { package: null, error: pErr.message };
  if (!row) return { package: null, error: null };

  const r = row as Record<string, unknown>;
  const id = String(r.id ?? "");

  const { data: linkRows, error: lErr } = await db
    .from(LAB_PACKAGE_TESTS_TABLE)
    .select("lab_test_id, sort_order")
    .eq("lab_package_id", packageId)
    .order("sort_order", { ascending: true, nullsFirst: false });

  if (lErr) return { package: null, error: lErr.message };

  const labTestIds = ((linkRows ?? []) as Array<{ lab_test_id: string }>)
    .map((x) => String(x.lab_test_id ?? "").trim())
    .filter(Boolean);

  const pkg: LabPackageWithTests = {
    id,
    name: String(r.name ?? ""),
    description: (r.description as string | null) ?? null,
    is_active: r.is_active !== false,
    sort_order: r.sort_order == null || r.sort_order === "" ? null : Number(r.sort_order),
    package_price: numPrice(r.package_price),
    labTestIds,
  };

  return { package: pkg, error: null };
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ packageId: string }> },
) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { packageId: param } = await context.params;
  const packageId = parsePackageId(param);
  if (packageId === null) {
    return NextResponse.json({ error: "Invalid package id." }, { status: 400 });
  }

  const { package: pkg, error } = await loadOnePackage(db, packageId);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!pkg) return NextResponse.json({ error: "Package not found." }, { status: 404 });

  return NextResponse.json({ package: pkg });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ packageId: string }> },
) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { packageId: param } = await context.params;
  const packageId = parsePackageId(param);
  if (packageId === null) {
    return NextResponse.json({ error: "Invalid package id." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    description?: string | null;
    package_price?: number | string | null;
    is_active?: boolean;
    sort_order?: number | null;
    lab_test_ids?: string[];
  } | null;

  if (!body || Object.keys(body).length === 0) {
    return NextResponse.json({ error: "Provide at least one field to update." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const n = String(body.name).trim();
    if (!n) return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
    patch.name = n;
  }
  if (body.description !== undefined) {
    patch.description =
      body.description === null ? null : String(body.description).trim() || null;
  }
  if (body.package_price !== undefined) {
    if (body.package_price === null || body.package_price === ("" as unknown)) patch.package_price = 0;
    else {
      const p =
        typeof body.package_price === "number" ? body.package_price : Number(String(body.package_price));
      patch.package_price = Number.isFinite(p) ? p : 0;
    }
  }
  if (body.is_active !== undefined) patch.is_active = body.is_active !== false;
  if (body.sort_order !== undefined) {
    if (body.sort_order === null) patch.sort_order = null;
    else {
      const s = Number(body.sort_order);
      patch.sort_order = Number.isFinite(s) ? s : null;
    }
  }

  if (Object.keys(patch).length > 0) {
    const { data: updated, error: uErr } = await db
      .from(LAB_PACKAGES_TABLE)
      .update(patch)
      .eq("id", packageId)
      .select("id")
      .maybeSingle();
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });
    if (!updated) return NextResponse.json({ error: "Package not found." }, { status: 404 });
  }

  if (body.lab_test_ids !== undefined) {
    const labTestIdsRaw = dedupeTestIds(Array.isArray(body.lab_test_ids) ? body.lab_test_ids : []);
    const normalized = await normalizePackageLabTestIdsForStorage(db, labTestIdsRaw);
    if (normalized.error) return NextResponse.json({ error: normalized.error }, { status: 400 });
    const labTestIds = normalized.testIds;
    const { error: delErr } = await db.from(LAB_PACKAGE_TESTS_TABLE).delete().eq("lab_package_id", packageId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

    if (labTestIds.length > 0) {
      const linkRows = labTestIds.map((lab_test_id, idx) => ({
        lab_package_id: packageId,
        lab_test_id,
        sort_order: idx,
      }));
      const { error: insErr } = await db.from(LAB_PACKAGE_TESTS_TABLE).insert(linkRows);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
    }
  }

  const { package: pkg, error: loadErr } = await loadOnePackage(db, packageId);
  if (loadErr) return NextResponse.json({ error: loadErr }, { status: 400 });
  if (!pkg) return NextResponse.json({ error: "Package not found." }, { status: 404 });

  return NextResponse.json({ package: pkg });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ packageId: string }> },
) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { packageId: param } = await context.params;
  const packageId = parsePackageId(param);
  if (packageId === null) {
    return NextResponse.json({ error: "Invalid package id." }, { status: 400 });
  }

  const { count, error: uErr } = await db
    .from(LAB_REQUEST_PACKAGES_TABLE)
    .select("lab_request_id", { count: "exact", head: true })
    .eq("lab_package_id", packageId);

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 });
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot delete a package that is referenced by existing lab requests. Deactivate it instead.",
      },
      { status: 409 },
    );
  }

  const { error: lErr } = await db.from(LAB_PACKAGE_TESTS_TABLE).delete().eq("lab_package_id", packageId);
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 400 });

  const { error } = await db.from(LAB_PACKAGES_TABLE).delete().eq("id", packageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
