import { notFound } from "next/navigation";
import ConsultationWorkspace from "@/components/consultation/ConsultationWorkspace";
import { fetchEncounterWorkspacePatient } from "@/lib/consultationData";

export default async function ConsultationEncounterPage({
  params,
}: {
  params: Promise<{ encounterId: string }>;
}) {
  const { encounterId } = await params;
  const patient = await fetchEncounterWorkspacePatient(encounterId);
  if (!patient) notFound();

  return <ConsultationWorkspace patient={patient} />;
}
