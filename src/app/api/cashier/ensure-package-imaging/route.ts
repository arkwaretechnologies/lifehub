import { NextResponse } from "next/server";
import { ensureImagingRequestForLabPackages } from "@/lib/imagingRequests";
import { fetchLabRequestPackageIdsByRequestIdMap } from "@/lib/labRequests";
import { queueAdminClient } from "@/lib/receptionQueueServer";

type Body = {
  encounterTransId?: string;
  labRequestIds?: string[] | null;
  patientId?: number | null;
};

export async function POST(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const encounterTransId = typeof body.encounterTransId === "string" ? body.encounterTransId.trim() : "";
  const labRequestIds = Array.isArray(body.labRequestIds)
    ? body.labRequestIds.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  const patientId =
    body.patientId != null && Number.isFinite(body.patientId) && body.patientId > 0 ? body.patientId : null;

  if (!encounterTransId || labRequestIds.length === 0) {
    return NextResponse.json({ error: "encounterTransId and labRequestIds are required." }, { status: 400 });
  }

  const { map: pkgByLab, error: pkgMapErr } = await fetchLabRequestPackageIdsByRequestIdMap(admin, labRequestIds);
  if (pkgMapErr) return NextResponse.json({ error: pkgMapErr }, { status: 500 });

  const packageIds = [...new Set([...pkgByLab.values()].flat().filter((n) => Number.isFinite(n) && n > 0))];
  if (packageIds.length === 0) {
    return NextResponse.json({ ok: true, imagingRequestIds: [] as string[] });
  }

  const { imagingRequestId, error } = await ensureImagingRequestForLabPackages(admin, {
    encounterId: encounterTransId,
    patientId,
    packageIds,
    remarks: "Laboratory package imaging (cashier)",
  });
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({
    ok: true,
    imagingRequestIds: imagingRequestId ? [imagingRequestId] : [],
  });
}
