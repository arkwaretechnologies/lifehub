import { NextResponse } from "next/server";
import {
  fetchImagingResultSignatories,
  upsertImagingResultSignatories,
  type ImagingResultSignatoriesPayload,
} from "@/lib/imagingResultSignatories";
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

export async function GET() {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const { signatories, error } = await fetchImagingResultSignatories(db);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ signatories });
}

export async function PATCH(req: Request) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const body = (await req.json().catch(() => null)) as ImagingResultSignatoriesPayload | null;
  if (!body || (body.radtech === undefined && body.radiologist === undefined)) {
    return NextResponse.json(
      { error: "Provide radtech and/or radiologist fields to update." },
      { status: 400 },
    );
  }

  const { signatories, error } = await upsertImagingResultSignatories(db, body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ signatories });
}
