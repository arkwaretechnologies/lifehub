import { NextResponse } from "next/server";
import { adminCreatePatient } from "@/lib/receptionQueueServer";

type Body = {
  name?: string;
  sex?: string;
  date_of_birth?: string;
  address?: string;
  contact_no?: string;
  email_address?: string | null;
  occupation?: string | null;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const sex = typeof body.sex === "string" ? body.sex.trim() : "";
  const dob = typeof body.date_of_birth === "string" ? body.date_of_birth.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const contact = typeof body.contact_no === "string" ? body.contact_no.trim() : "";

  if (!name || !sex || !dob || !address || !contact) {
    return NextResponse.json(
      { error: "name, sex, date_of_birth, address, and contact_no are required." },
      { status: 400 },
    );
  }

  const { patient, error } = await adminCreatePatient({
    name,
    sex,
    date_of_birth: dob,
    address,
    contact_no: contact,
    email_address: typeof body.email_address === "string" ? body.email_address : null,
    occupation: typeof body.occupation === "string" ? body.occupation : null,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ patient });
}

