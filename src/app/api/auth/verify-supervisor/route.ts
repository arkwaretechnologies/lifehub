import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeAuthenticateUserPayload } from "@/lib/authenticateUserRpc";
import { allowRateLimit, clientIpFromRequest } from "@/lib/loginRateLimit";
import { getMenuAccessForRoleName } from "@/lib/roleMenuAccessServer";
import { canApprovePharmacyLineRequests } from "@/lib/navPermissionCatalog";
import { getBearerSessionUserId } from "@/lib/requireSession";
import { numericSessionUserId } from "@/lib/sessionUserId";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

type Body = {
  identifier?: string;
  input_password?: string;
};

export async function POST(req: Request) {
  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  const input_password = typeof body.input_password === "string" ? body.input_password : "";
  if (!identifier || !input_password) {
    return NextResponse.json({ error: "identifier and input_password are required." }, { status: 400 });
  }

  const ip = clientIpFromRequest(req);
  const idLower = identifier.toLowerCase();
  if (
    !allowRateLimit(`verify-supervisor:ip:${ip}`, 80) ||
    !allowRateLimit(`verify-supervisor:user:${ip}:${idLower}`, 25)
  ) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const admin = adminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { data, error: rpcError } = await admin.rpc("authenticate_user", {
    identifier,
    input_password,
  });

  if (rpcError || data == null) {
    return NextResponse.json({ error: "Invalid supervisor username or password." }, { status: 401 });
  }

  const normalized = normalizeAuthenticateUserPayload(data);
  if (!normalized?.profile) {
    return NextResponse.json({ error: "Invalid authentication response." }, { status: 500 });
  }

  const profile = normalized.profile;
  const userId = numericSessionUserId(profile, normalized.user as Record<string, unknown>);
  if (userId == null) {
    return NextResponse.json({ error: "Invalid authentication response." }, { status: 500 });
  }

  const role = profile.role != null ? String(profile.role) : "";
  const menuAccess = role ? await getMenuAccessForRoleName(admin, role) : { rbac: false, pageKeys: [] as string[] };
  if (!menuAccess.rbac || !canApprovePharmacyLineRequests(menuAccess.pageKeys)) {
    return NextResponse.json(
      { error: "This account is not authorized to approve line authorization requests." },
      { status: 403 },
    );
  }

  const displayName =
    (typeof profile.fullname === "string" && profile.fullname.trim()) ||
    (typeof profile.username === "string" && profile.username.trim()) ||
    identifier;

  return NextResponse.json({ ok: true, userId, displayName });
}
