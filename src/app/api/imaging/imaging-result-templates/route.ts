import { NextResponse } from "next/server";
import { fetchImagingResultTemplates } from "@/lib/imagingResultTemplates";
import { supabaseAdminClient } from "@/lib/supabaseAdminClient";

export async function GET(req: Request) {
  const admin = supabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const activeOnly = new URL(req.url).searchParams.get("activeOnly") !== "false";
  const { templates, error } = await fetchImagingResultTemplates(admin, { activeOnly });
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      file_name: t.file_name,
      sort_order: t.sort_order,
      is_active: t.is_active,
      result_layout: t.result_layout,
      signature_layout: t.signature_layout,
    })),
  });
}
