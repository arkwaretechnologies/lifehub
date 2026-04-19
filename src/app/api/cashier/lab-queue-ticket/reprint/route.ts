import { NextResponse } from "next/server";
import { adminGetQueueTicketReceiptPayload } from "@/lib/receptionQueueServer";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticketId = (url.searchParams.get("ticketId") ?? "").trim();
  if (!ticketId) {
    return NextResponse.json({ error: "ticketId query parameter is required." }, { status: 400 });
  }

  const { error, patientName, queueDisplay, transId, destinationLabel } = await adminGetQueueTicketReceiptPayload(ticketId);
  if (error) {
    return NextResponse.json({ error }, { status: error === "Queue ticket not found." ? 404 : 500 });
  }
  return NextResponse.json({
    ok: true,
    patientName,
    queueDisplay,
    transId,
    destinationLabel,
    queueTicketId: ticketId,
  });
}
