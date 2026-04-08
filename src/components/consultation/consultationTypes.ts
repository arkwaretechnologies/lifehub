/**
 * Patient header fields aligned with `docs/LifeHub_Lab_Template_Improved.docx`
 * (“PATIENT INFORMATION” block).
 */
export type ConsultationPatient = {
  name: string;
  date: string;
  time: string;
  ageSex: string;
  dob: string;
  civilStatus: string;
  address: string;
  contactNo: string;
  occupation: string;
  referringPhysician: string;
  patientId: string;
  philhealthNo: string;
};

/** Stable patient row for directory search (visit date/time live on each encounter). */
export type ConsultationPatientProfile = {
  patientId: string;
  name: string;
  ageSex: string;
  dob: string;
  civilStatus: string;
  address: string;
  contactNo: string;
  occupation: string;
  referringPhysician: string;
  philhealthNo: string;
};

export type ConsultationEncounterSummary = {
  id: string;
  patientId: string;
  date: string;
  time: string;
  chiefComplaint?: string;
  queueNo?: string;
};

export const CONSULTATION_BRANDING = {
  org: "LIFEHUB MEDICAL & DIAGNOSTIC CENTER",
  tagline: "Your One-Stop Healthcare Hub",
  addressLine: "Poblacion Imelda Zamboanga Sibugay, 7007",
  tel: "+63-952-476-7515",
  email: "lifehubmedical@gmail.com",
} as const;

export function buildConsultationPatient(
  profile: ConsultationPatientProfile,
  encounter: Pick<ConsultationEncounterSummary, "date" | "time">
): ConsultationPatient {
  return {
    name: profile.name,
    date: encounter.date,
    time: encounter.time,
    ageSex: profile.ageSex,
    dob: profile.dob,
    civilStatus: profile.civilStatus,
    address: profile.address,
    contactNo: profile.contactNo,
    occupation: profile.occupation,
    referringPhysician: profile.referringPhysician,
    patientId: profile.patientId,
    philhealthNo: profile.philhealthNo,
  };
}
