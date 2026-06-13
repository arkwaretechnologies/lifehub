import { NextResponse } from "next/server";
import { userCanManageUsers } from "@/lib/adminRole";
import { getBearerSessionUserId } from "@/lib/requireSession";
import {
  buildPhysicianSignatureStoragePath,
  userRoleCanHaveSignature,
  validateSignatureUploadFile,
} from "@/lib/signatureImageShared";
import {
  createSignatureSignedUrl,
  deleteSignatureObject,
  downloadSignatureBytes,
  optimizeSignatureBuffer,
  uploadSignatureBuffer,
} from "@/lib/signatureImageServer";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export const runtime = "nodejs";

async function assertUserSignatureAccess(req: Request, userId: number) {
  const sessionUserId = await getBearerSessionUserId(req);
  if (sessionUserId == null) {
    return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  const db = supabaseAdminClient();
  if (!db) {
    return {
      error: NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 }),
    };
  }
  const isSelf = sessionUserId === userId;
  const canManage = await userCanManageUsers(db, sessionUserId);
  if (!isSelf && !canManage) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { db, sessionUserId };
}

async function fetchPhysicianSignaturePath(
  db: NonNullable<ReturnType<typeof supabaseAdminClient>>,
  userId: number,
): Promise<{ path: string | null; error: string | null }> {
  const { data, error } = await db
    .from("users")
    .select("signature_storage_path, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { path: null, error: error.message };
  if (!data) return { path: null, error: "User not found." };
  const role = String((data as { role?: string }).role ?? "").trim();
  if (!userRoleCanHaveSignature(role)) return { path: null, error: null };
  const path = String((data as { signature_storage_path?: string | null }).signature_storage_path ?? "").trim();
  return { path: path || null, error: null };
}

async function setPhysicianSignaturePath(
  db: NonNullable<ReturnType<typeof supabaseAdminClient>>,
  userId: number,
  storagePath: string | null,
): Promise<{ error: string | null }> {
  const { error } = await db
    .from("users")
    .update({ signature_storage_path: storagePath, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return { error: error?.message ?? null };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: userIdRaw } = await context.params;
  const userId = Number.parseInt(userIdRaw, 10);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const access = await assertUserSignatureAccess(req, userId);
  if ("error" in access && access.error) return access.error;
  const { db } = access as { db: NonNullable<ReturnType<typeof supabaseAdminClient>> };

  const { data: userRow, error: userErr } = await db
    .from("users")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });
  if (!userRow) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (!userRoleCanHaveSignature(String((userRow as { role?: string }).role ?? ""))) {
    return NextResponse.json({ error: "Signature upload is only for PHYSICIAN or ADMIN users." }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const validationError = validateSignatureUploadFile({
    name: file.name,
    size: file.size,
    type: file.type,
  });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { path: previousPath } = await fetchPhysicianSignaturePath(db, userId);
  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const optimized = await optimizeSignatureBuffer(inputBuffer, file.name);
  const storagePath = buildPhysicianSignatureStoragePath(userId, optimized.ext);

  const { error: upErr } = await uploadSignatureBuffer(
    db,
    storagePath,
    optimized.buffer,
    optimized.contentType,
  );
  if (upErr) return NextResponse.json({ error: upErr }, { status: 500 });

  const { error: setErr } = await setPhysicianSignaturePath(db, userId, storagePath);
  if (setErr) {
    await deleteSignatureObject(db, storagePath);
    return NextResponse.json({ error: setErr }, { status: 500 });
  }

  if (previousPath && previousPath !== storagePath) {
    await deleteSignatureObject(db, previousPath);
  }

  return NextResponse.json({ storagePath });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: userIdRaw } = await context.params;
  const userId = Number.parseInt(userIdRaw, 10);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const access = await assertUserSignatureAccess(req, userId);
  if ("error" in access && access.error) return access.error;
  const { db } = access as { db: NonNullable<ReturnType<typeof supabaseAdminClient>> };

  const { path: previousPath } = await fetchPhysicianSignaturePath(db, userId);
  if (previousPath) await deleteSignatureObject(db, previousPath);
  const { error } = await setPhysicianSignaturePath(db, userId, null);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(
  req: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId: userIdRaw } = await context.params;
  const userId = Number.parseInt(userIdRaw, 10);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const access = await assertUserSignatureAccess(req, userId);
  if ("error" in access && access.error) return access.error;
  const { db } = access as { db: NonNullable<ReturnType<typeof supabaseAdminClient>> };

  const { path, error: pathErr } = await fetchPhysicianSignaturePath(db, userId);
  if (pathErr) return NextResponse.json({ error: pathErr }, { status: 500 });
  if (!path) return NextResponse.json({ url: null });

  const { url, error } = await createSignatureSignedUrl(db, path);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ url, storagePath: path });
}
