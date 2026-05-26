import { NextResponse } from "next/server";
import {
  fetchLabResultSignatories,
  upsertLabResultSignatories,
  type LabResultSignatoriesPayload,
} from "@/lib/labResultSignatories";
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

  const { signatories, error } = await fetchLabResultSignatories(db);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ signatories });
}

export async function PATCH(req: Request) {
  const { db, res } = adminOr500();
  if (!db || res) return res!;

  const body = (await req.json().catch(() => null)) as LabResultSignatoriesPayload | null;
  if (!body || (body.medtech === undefined && body.pathologist === undefined)) {
    return NextResponse.json(
      { error: "Provide medtech and/or pathologist fields to update." },
      { status: 400 },
    );
  }

  const { signatories, error } = await upsertLabResultSignatories(db, body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ signatories });
}
