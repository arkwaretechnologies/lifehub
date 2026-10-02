import { NextResponse } from "next/server";
import { userCanManageUsers } from "@/lib/adminRole";
import { getBearerSessionUserId } from "@/lib/requireSession";
import {
  fetchUserRxTemplateFilename,
  listRxTemplateFilenames,
  rxTemplateFileExists,
  sanitizeRxTemplateBasename,
  setUserRxTemplateFilename,
  userRoleCanSelectRxTemplate,
} from "@/lib/rxTemplates";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export const runtime = "nodejs";

async function assertRxTemplateAccess(req: Request, opts?: { allowUserManagers?: boolean }) {
  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  const db = supabaseAdminClient();
  if (!db) {
    return {
      error: NextResponse.json(
        { error: "Server missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL." },
        { status: 500 },
      ),
    };
  }
  const { filename, role, error } = await fetchUserRxTemplateFilename(db, sessionUserId);
  if (error) return { error: NextResponse.json({ error }, { status: 400 }) };
  const canSelect = !!role && userRoleCanSelectRxTemplate(role);
  const canManage = opts?.allowUserManagers ? await userCanManageUsers(db, sessionUserId) : false;
  if (!canSelect && !canManage) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { db, sessionUserId, selected: filename, canSelect };
}

export async function GET(req: Request) {
  const access = await assertRxTemplateAccess(req, { allowUserManagers: true });
  if ("error" in access && access.error) return access.error;
  const { selected } = access as {
    selected: string | null;
  };

  const files = await listRxTemplateFilenames();
  const selectedOk = selected && files.includes(selected) ? selected : null;
  return NextResponse.json({ files, selected: selectedOk });
}

export async function PATCH(req: Request) {
  const access = await assertRxTemplateAccess(req);
  if ("error" in access && access.error) return access.error;
  const { db, sessionUserId, canSelect } = access as {
    db: NonNullable<ReturnType<typeof supabaseAdminClient>>;
    sessionUserId: number;
    canSelect: boolean;
  };
  if (!canSelect) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { filename?: string | null } | null;
  const raw = body?.filename;
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    const { error } = await setUserRxTemplateFilename(db, sessionUserId, null);
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ selected: null });
  }

  const filename = sanitizeRxTemplateBasename(String(raw));
  if (!filename) {
    return NextResponse.json({ error: "Invalid template filename." }, { status: 400 });
  }
  if (!(await rxTemplateFileExists(filename))) {
    return NextResponse.json({ error: "Template file not found." }, { status: 404 });
  }

  const { error } = await setUserRxTemplateFilename(db, sessionUserId, filename);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ selected: filename });
}
