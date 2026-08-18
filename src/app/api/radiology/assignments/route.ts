import { NextResponse } from "next/server";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import {
  clearRadiologistAssignment,
  listAssignmentPatientsGrouped,
  upsertRadiologistAssignment,
} from "@/lib/radiologyAssignments";
import {
  isRadiologistRoleName,
  userCanAssignRadiology,
  userCanViewRadiologyAssignmentList,
} from "@/lib/radiologyRole";

function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export async function GET(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!(await userCanViewRadiologyAssignmentList(admin, sessionUserId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const url = new URL(req.url);
  const date = (url.searchParams.get("date") ?? "").trim() || null;
  const scopeRaw = (url.searchParams.get("scope") ?? "today").trim().toLowerCase();
  const scope = scopeRaw === "all" ? "all" : "today";
  const page = parsePositiveInt(url.searchParams.get("page"), 0);
  const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 20);

  const { rows, total, error } = await listAssignmentPatientsGrouped(admin, {
    date,
    scope,
    page,
    pageSize,
  });

  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ rows, total, page, pageSize });
}

export async function PUT(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!(await userCanAssignRadiology(admin, sessionUserId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    imagingRequestItemId?: string;
    radiologistUserId?: number | null;
  };

  const imagingRequestItemId =
    typeof body.imagingRequestItemId === "string" ? body.imagingRequestItemId.trim() : "";
  if (!imagingRequestItemId) {
    return NextResponse.json({ error: "imagingRequestItemId is required." }, { status: 400 });
  }

  const { data: itemRow, error: itemErr } = await admin
    .from("imaging_request_items")
    .select("id")
    .eq("id", imagingRequestItemId)
    .maybeSingle();

  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
  if (!itemRow) return NextResponse.json({ error: "Imaging study not found." }, { status: 404 });

  const radId =
    body.radiologistUserId != null && Number.isFinite(body.radiologistUserId) && body.radiologistUserId > 0
      ? body.radiologistUserId
      : null;

  if (radId == null) {
    const { error } = await clearRadiologistAssignment(admin, imagingRequestItemId);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ ok: true, radiologistUserId: null });
  }

  const { data: radUser, error: radErr } = await admin
    .from("users")
    .select("user_id, role, can_read_imaging")
    .eq("user_id", radId)
    .maybeSingle();

  if (radErr) return NextResponse.json({ error: radErr.message }, { status: 500 });
  if (!radUser) return NextResponse.json({ error: "Radiologist user not found." }, { status: 404 });

  const role = String((radUser as { role?: string }).role ?? "").trim();
  const canReadImaging = (radUser as { can_read_imaging?: boolean | null }).can_read_imaging === true;
  if (!canReadImaging && !isRadiologistRoleName(role)) {
    return NextResponse.json({ error: "Selected user is not a radiologist." }, { status: 400 });
  }

  const { error } = await upsertRadiologistAssignment(admin, {
    imagingRequestItemId,
    radiologistUserId: radId,
    assignedByUserId: sessionUserId,
  });

  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ ok: true, radiologistUserId: radId });
}
