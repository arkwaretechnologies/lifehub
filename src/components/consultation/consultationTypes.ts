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

export const CONSULTATION_BRANDING = {
  org: "LIFEHUB MEDICAL & DIAGNOSTIC CENTER",
  tagline: "Your One-Stop Healthcare Hub",
  addressLine: "Poblacion Imelda Zamboanga Sibugay, 7007",
  tel: "+63-952-476-7515",
  email: "lifehubmedical@gmail.com",
} as const;

/** Demo snapshot — replace with visit/patient fetch later. */
export const MOCK_CONSULTATION_PATIENT: ConsultationPatient = {
  name: "adham mohamed",
  date: "2026-04-03",
  time: "10:30",
  ageSex: "35 / Male",
  dob: "1991-03-15",
  civilStatus: "MARRIED",
  address: "ZAMBOANGA SIBUGAY",
  contactNo: "09171234567",
  occupation: "ENGINEER",
  referringPhysician: "DR. SAMPLE",
  patientId: "RUH01PNT12302129",
  philhealthNo: "12-345678901-2",
};
