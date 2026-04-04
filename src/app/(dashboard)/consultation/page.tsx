"use client";

import ConsultationWorkspace from "@/components/consultation/ConsultationWorkspace";
import { MOCK_CONSULTATION_PATIENT } from "@/components/consultation/consultationTypes";

export default function ConsultationPage() {
  return <ConsultationWorkspace patient={MOCK_CONSULTATION_PATIENT} />;
}
