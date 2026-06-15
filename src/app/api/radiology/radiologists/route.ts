import { NextResponse } from "next/server";
import { userHasAdminRole } from "@/lib/adminRole";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { queueAdminClient } from "@/lib/receptionQueueServer";
import { listRadiologistUsers, userCanAssignRadiology } from "@/lib/radiologyRole";

export async function GET(req: Request) {
  const admin = queueAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const canAssign = await userCanAssignRadiology(admin, sessionUserId);
  const isAdmin = await userHasAdminRole(admin, sessionUserId);
  if (!canAssign && !isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { rows, error } = await listRadiologistUsers(admin);
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ rows });
}
