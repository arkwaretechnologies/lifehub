import { NextResponse } from "next/server";
import { adminCreatePatient } from "@/lib/receptionQueueServer";

type Body = {
  name?: string;
  sex?: string;
  date_of_birth?: string;
  civil_status?: string | null;
  address?: string;
  contact_no?: string;
  email_address?: string | null;
  occupation?: string | null;
  referring_physician?: string | number | null;
  philhealth_no?: number | null;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sex = typeof body.sex === "string" ? body.sex.trim() : "";
  const dob = typeof body.date_of_birth === "string" ? body.date_of_birth.trim() : "";
  const civilStatus =
    body.civil_status == null
      ? ""
      : typeof body.civil_status === "string"
        ? body.civil_status.trim()
        : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const contact = typeof body.contact_no === "string" ? body.contact_no.trim() : "";

  if (!name || !sex || !dob || !civilStatus || !address || !contact) {
    return NextResponse.json(
      { error: "name, sex, date_of_birth, civil_status, address, and contact_no are required." },
      { status: 400 },
    );
  }

  const referringRaw = body.referring_physician;
  let referring_physician: string | number | null = null;
  if (referringRaw != null && referringRaw !== "") {
    if (typeof referringRaw === "number" && Number.isFinite(referringRaw)) {
      referring_physician = Math.trunc(referringRaw);
    } else {
      const v = String(referringRaw).trim();
      if (v) {
        referring_physician = /^\d+$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : v.toUpperCase();
      }
    }
  }

  const philRaw = body.philhealth_no;
  const philhealth_no =
    philRaw != null && typeof philRaw === "number" && Number.isFinite(philRaw) ? Math.trunc(philRaw) : null;

  const { patient, error } = await adminCreatePatient({
    name,
    sex,
    date_of_birth: dob,
    civil_status: civilStatus,
    address,
    contact_no: contact,
    email_address: typeof body.email_address === "string" ? body.email_address : null,
    occupation: typeof body.occupation === "string" ? body.occupation : null,
    referring_physician,
    philhealth_no,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ patient });
}

