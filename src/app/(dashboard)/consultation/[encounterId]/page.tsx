import { notFound } from "next/navigation";
import ConsultationWorkspace from "@/components/consultation/ConsultationWorkspace";
import { fetchEncounterWorkspacePatient } from "@/lib/consultationData";

export default async function ConsultationEncounterPage({
  params,
  searchParams,
}: {
  params: Promise<{ encounterId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { encounterId } = await params;
  const sp = ((await searchParams?.catch(() => ({}))) ?? {}) as Record<
    string,
    string | string[] | undefined
  >;
  const newParam = sp["new"];
  const isNew =
    newParam === "1" ||
    newParam === "true" ||
    (Array.isArray(newParam) && (newParam.includes("1") || newParam.includes("true")));
  const patient = await fetchEncounterWorkspacePatient(encounterId);
  if (!patient) notFound();

  return <ConsultationWorkspace patient={patient} transId={encounterId} isNew={isNew} />;
}
