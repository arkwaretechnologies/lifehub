import { NextResponse } from "next/server";
import type { ImagingSignatureRole } from "@/lib/imagingResultSignatures";
import {
  fetchImagingSignatorySignaturePath,
  setImagingSignatorySignaturePath,
} from "@/lib/imagingResultSignatories";
import { getBearerSessionUserId } from "@/lib/requireSession";
import {
  buildImagingSignatoryStoragePath,
  parseImagingSignatoryRole,
  validateSignatureUploadFile,
} from "@/lib/signatureImageShared";
import {
  createSignatureSignedUrl,
  deleteSignatureObject,
  optimizeSignatureBuffer,
  uploadSignatureBuffer,
} from "@/lib/signatureImageServer";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export const runtime = "nodejs";

function adminOr401(roleRaw: string) {
  const db = supabaseAdminClient();
  if (!db) {
    return {
      error: NextResponse.json(
        { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
        { status: 500 },
      ),
    };
  }
  const role = parseImagingSignatoryRole(roleRaw);
  if (!role) {
    return { error: NextResponse.json({ error: "Invalid signatory role." }, { status: 400 }) };
  }
  return { db, role };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ role: string }> },
) {
  if ((await getBearerSessionUserId(req)) == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { role: roleRaw } = await context.params;
  const ctx = adminOr401(roleRaw);
  if ("error" in ctx && ctx.error) return ctx.error;
  const { db, role } = ctx as {
    db: NonNullable<ReturnType<typeof supabaseAdminClient>>;
    role: ImagingSignatureRole;
  };

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

  const { path: previousPath } = await fetchImagingSignatorySignaturePath(db, role);
  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const optimized = await optimizeSignatureBuffer(inputBuffer, file.name);
  const storagePath = buildImagingSignatoryStoragePath(role, optimized.ext);

  const { error: upErr } = await uploadSignatureBuffer(
    db,
    storagePath,
    optimized.buffer,
    optimized.contentType,
  );
  if (upErr) return NextResponse.json({ error: upErr }, { status: 500 });

  const { signatories, error } = await setImagingSignatorySignaturePath(db, role, storagePath);
  if (error) {
    await deleteSignatureObject(db, storagePath);
    return NextResponse.json({ error }, { status: 500 });
  }

  if (previousPath && previousPath !== storagePath) {
    await deleteSignatureObject(db, previousPath);
  }

  return NextResponse.json({ signatories, storagePath });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ role: string }> },
) {
  if ((await getBearerSessionUserId(req)) == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { role: roleRaw } = await context.params;
  const ctx = adminOr401(roleRaw);
  if ("error" in ctx && ctx.error) return ctx.error;
  const { db, role } = ctx as {
    db: NonNullable<ReturnType<typeof supabaseAdminClient>>;
    role: ImagingSignatureRole;
  };

  const { path: previousPath } = await fetchImagingSignatorySignaturePath(db, role);
  if (previousPath) await deleteSignatureObject(db, previousPath);
  const { signatories, error } = await setImagingSignatorySignaturePath(db, role, null);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ signatories });
}

export async function GET(
  req: Request,
  context: { params: Promise<{ role: string }> },
) {
  if ((await getBearerSessionUserId(req)) == null) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { role: roleRaw } = await context.params;
  const ctx = adminOr401(roleRaw);
  if ("error" in ctx && ctx.error) return ctx.error;
  const { db, role } = ctx as {
    db: NonNullable<ReturnType<typeof supabaseAdminClient>>;
    role: ImagingSignatureRole;
  };

  const { path, error: pathErr } = await fetchImagingSignatorySignaturePath(db, role);
  if (pathErr) return NextResponse.json({ error: pathErr }, { status: 500 });
  if (!path) return NextResponse.json({ url: null });

  const { url, error } = await createSignatureSignedUrl(db, path);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ url, storagePath: path });
}
