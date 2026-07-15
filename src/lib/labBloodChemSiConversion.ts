/** Lab result panels with conventional + International System display. */

export const BLOODCHEM_SI_TEMPLATE_CODES = [
  "BLOODCHEM1",
  "BLOODCHEM2",
  "BLOODCHEM3",
  "BLOODCHEM4",
  "BLOODCHEM5",
  "BLOODCHEM6",
  "BLOODCHEM7",
  "BLOODCHEM8",
  "BLOODCHEM9",
  "BLOODCHEM10",
  "BLOODCHEM11",
  "ART",
] as const;

export const BLOODCHEM_SI_TEST_CODES = [
  "CHEM_FBS",
  "CHEM_2HRPP",
  "CHEM_RBS",
  "CHEM_HBA1C",
  "CHEM_FASTING_INSULIN",
  "CHEM_BUN",
  "CHEM_SERUM_UREA",
  "CHEM_CREATININE",
  "CHEM_UA",
  "CHEM_TC",
  "CHEM_HDL",
  "CHEM_LDL",
  "CHEM_VLDL",
  "CHEM_TG",
  "CHEM_AST",
  "CHEM_ALT",
  "CHEM_ALP",
  "CHEM_GGT",
  "CHEM_LDH",
  "CHEM_TBIL",
  "CHEM_DBIL",
  "CHEM_IBIL",
  "CHEM_AMYLASE",
  "CHEM_LIPASE",
  "CHEM_CK",
  "CHEM_CKMB",
  "CHEM_TROP_I",
  "CHEM_HSCRP",
  "CHEM_NA",
  "CHEM_K",
  "CHEM_CL",
  "CHEM_CA",
  "CHEM_CA_ION",
  "CHEM_PHOS",
  "CHEM_MG",
  "CHEM_FE",
  "CHEM_TIBC",
  "CHEM_TSAT",
  "CHEM_FERRITIN",
  "CHEM_TSH",
  "CHEM_FT4",
  "CHEM_FT3",
  "CHEM_TT4",
  "CHEM_TT3",
  "CHEM_PT",
  "CHEM_INR",
  "CHEM_APTT",
  "CHEM_BT",
  "CHEM_PROLACTIN",
  "CHEM_FSH",
  "CHEM_LH",
  "CHEM_E2",
  "CHEM_PROG",
  "CHEM_TESTO",
  "CHEM_CORTISOL",
  "CHEM_PSA",
  "CHEM_BHCG",
  "CHEM_AFP",
  "CHEM_CEA",
  "CHEM_CA199",
  "CHEM_CA125",
  "CHEM_CA153",
  "ART_PH_ART",
  "ART_PH_VEN",
  "ART_PAO2",
  "ART_PACO2",
  "ART_HCO3_ACT",
  "ART_HCO3_STD",
  "ART_SAO2",
  "ART_BASE_EXCESS",
  "ART_PO2_FIO2",
] as const;

export type BloodChemSiTestCode = (typeof BLOODCHEM_SI_TEST_CODES)[number];

type SiMultiplyConfig = {
  kind: "multiply";
  factor: number;
  siUnit: string;
  siReferenceRange: string;
  /** SI display / print decimals. */
  decimals: number;
  /** Conventional decimals when converting SI → conventional. */
  conventionalDecimals?: number;
};

type SiHba1cConfig = {
  kind: "hba1c";
  siUnit: string;
  siReferenceRange: string;
  decimals: number;
  conventionalDecimals?: number;
};

type SiConfig = SiMultiplyConfig | SiHba1cConfig;

const GLUCOSE_MG_DL_TO_MMOL_L = 1 / 18;
const MMHG_TO_KPA = 0.133322;
const UL_TO_UKAT = 1 / 60;
const MG_DL_CHOL_TO_MMOL_L = 0.02586;
const MG_DL_TG_TO_MMOL_L = 0.01129;
const MG_DL_BUN_TO_MMOL_L = 0.357;
const MG_DL_UREA_TO_MMOL_L = 0.166;
const MG_DL_CREAT_TO_UMOL_L = 88.4;
const MG_DL_UA_TO_UMOL_L = 59.48;
const MG_DL_BILI_TO_UMOL_L = 17.1;
const MG_DL_CA_TO_MMOL_L = 0.25;
const MG_DL_PHOS_TO_MMOL_L = 0.323;
const MG_DL_MG_TO_MMOL_L = 0.4114;
const UG_DL_FE_TO_UMOL_L = 0.179;
const NG_ML_PROLACTIN_TO_MIUL = 21.75;
const PG_ML_E2_TO_PMOL_L = 3.671;
const NG_ML_PROG_TO_NMOL_L = 3.18;
const NG_ML_TESTO_TO_NMOL_L = 0.0347;
const UG_DL_CORTISOL_TO_NMOL_L = 27.59;
const MG_L_HSCRP_TO_NMOL_L = 9.52;

const BLOODCHEM_SI_CONFIG: Record<BloodChemSiTestCode, SiConfig> = {
  CHEM_FBS: {
    kind: "multiply",
    factor: GLUCOSE_MG_DL_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "3.9-5.5",
    decimals: 1,
  },
  CHEM_2HRPP: {
    kind: "multiply",
    factor: GLUCOSE_MG_DL_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "<7.8",
    decimals: 1,
  },
  CHEM_RBS: {
    kind: "multiply",
    factor: GLUCOSE_MG_DL_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "<11.1",
    decimals: 1,
  },
  CHEM_HBA1C: {
    kind: "hba1c",
    siUnit: "mmol/mol",
    siReferenceRange: "<39",
    decimals: 0,
    conventionalDecimals: 1,
  },
  CHEM_FASTING_INSULIN: {
    kind: "multiply",
    factor: 6.945,
    siUnit: "pmol/L",
    siReferenceRange: "14-174",
    decimals: 0,
    conventionalDecimals: 1,
  },
  CHEM_BUN: {
    kind: "multiply",
    factor: MG_DL_BUN_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "2.5-7.1",
    decimals: 1,
    conventionalDecimals: 0,
  },
  CHEM_SERUM_UREA: {
    kind: "multiply",
    factor: MG_DL_UREA_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "2.5-7.5",
    decimals: 1,
    conventionalDecimals: 0,
  },
  CHEM_CREATININE: {
    kind: "multiply",
    factor: MG_DL_CREAT_TO_UMOL_L,
    siUnit: "μmol/L",
    siReferenceRange: "M: 65-120 | F: 52-92",
    decimals: 0,
    conventionalDecimals: 2,
  },
  CHEM_UA: {
    kind: "multiply",
    factor: MG_DL_UA_TO_UMOL_L,
    siUnit: "μmol/L",
    siReferenceRange: "M: 208-428 | F: 155-357",
    decimals: 0,
    conventionalDecimals: 1,
  },
  CHEM_TC: {
    kind: "multiply",
    factor: MG_DL_CHOL_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "<5.18",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_HDL: {
    kind: "multiply",
    factor: MG_DL_CHOL_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "See report",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_LDL: {
    kind: "multiply",
    factor: MG_DL_CHOL_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "See report",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_VLDL: {
    kind: "multiply",
    factor: MG_DL_CHOL_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "See report",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_TG: {
    kind: "multiply",
    factor: MG_DL_TG_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "<1.70",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_AST: {
    kind: "multiply",
    factor: UL_TO_UKAT,
    siUnit: "μkat/L",
    siReferenceRange: "0.17-0.67",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_ALT: {
    kind: "multiply",
    factor: UL_TO_UKAT,
    siUnit: "μkat/L",
    siReferenceRange: "0.12-0.93",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_ALP: {
    kind: "multiply",
    factor: UL_TO_UKAT,
    siUnit: "μkat/L",
    siReferenceRange: "0.73-2.45",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_GGT: {
    kind: "multiply",
    factor: UL_TO_UKAT,
    siUnit: "μkat/L",
    siReferenceRange: "M: 0.15-0.80 | F: 0.08-0.48",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_LDH: {
    kind: "multiply",
    factor: UL_TO_UKAT,
    siUnit: "μkat/L",
    siReferenceRange: "2.34-4.68",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_TBIL: {
    kind: "multiply",
    factor: MG_DL_BILI_TO_UMOL_L,
    siUnit: "μmol/L",
    siReferenceRange: "3.4-20.5",
    decimals: 1,
    conventionalDecimals: 1,
  },
  CHEM_DBIL: {
    kind: "multiply",
    factor: MG_DL_BILI_TO_UMOL_L,
    siUnit: "μmol/L",
    siReferenceRange: "0-5.1",
    decimals: 1,
    conventionalDecimals: 1,
  },
  CHEM_IBIL: {
    kind: "multiply",
    factor: MG_DL_BILI_TO_UMOL_L,
    siUnit: "μmol/L",
    siReferenceRange: "3.4-15.4",
    decimals: 1,
    conventionalDecimals: 1,
  },
  CHEM_AMYLASE: {
    kind: "multiply",
    factor: UL_TO_UKAT,
    siUnit: "μkat/L",
    siReferenceRange: "0.50-1.83",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_LIPASE: {
    kind: "multiply",
    factor: UL_TO_UKAT,
    siUnit: "μkat/L",
    siReferenceRange: "0-2.67",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_CK: {
    kind: "multiply",
    factor: UL_TO_UKAT,
    siUnit: "μkat/L",
    siReferenceRange: "M: 0.87-5.60 | F: 0.63-2.93",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_CKMB: {
    kind: "multiply",
    factor: UL_TO_UKAT,
    siUnit: "μkat/L",
    siReferenceRange: "<0.42",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_TROP_I: {
    kind: "multiply",
    factor: 1,
    siUnit: "μg/L",
    siReferenceRange: "<0.04",
    decimals: 2,
  },
  CHEM_HSCRP: {
    kind: "multiply",
    factor: MG_L_HSCRP_TO_NMOL_L,
    siUnit: "nmol/L",
    siReferenceRange: "<9.52",
    decimals: 2,
    conventionalDecimals: 1,
  },
  CHEM_NA: {
    kind: "multiply",
    factor: 1,
    siUnit: "mmol/L",
    siReferenceRange: "136-145",
    decimals: 0,
  },
  CHEM_K: {
    kind: "multiply",
    factor: 1,
    siUnit: "mmol/L",
    siReferenceRange: "3.5-5.1",
    decimals: 1,
  },
  CHEM_CL: {
    kind: "multiply",
    factor: 1,
    siUnit: "mmol/L",
    siReferenceRange: "98-107",
    decimals: 0,
  },
  CHEM_CA: {
    kind: "multiply",
    factor: MG_DL_CA_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "2.12-2.62",
    decimals: 2,
    conventionalDecimals: 1,
  },
  CHEM_CA_ION: {
    kind: "multiply",
    factor: MG_DL_CA_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "1.15-1.32",
    decimals: 2,
    conventionalDecimals: 1,
  },
  CHEM_PHOS: {
    kind: "multiply",
    factor: MG_DL_PHOS_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "0.81-1.45",
    decimals: 2,
    conventionalDecimals: 1,
  },
  CHEM_MG: {
    kind: "multiply",
    factor: MG_DL_MG_TO_MMOL_L,
    siUnit: "mmol/L",
    siReferenceRange: "0.70-0.91",
    decimals: 2,
    conventionalDecimals: 1,
  },
  CHEM_FE: {
    kind: "multiply",
    factor: UG_DL_FE_TO_UMOL_L,
    siUnit: "μmol/L",
    siReferenceRange: "M: 11.6-31.3 | F: 9.0-30.4",
    decimals: 1,
    conventionalDecimals: 0,
  },
  CHEM_TIBC: {
    kind: "multiply",
    factor: UG_DL_FE_TO_UMOL_L,
    siUnit: "μmol/L",
    siReferenceRange: "44.8-66.2",
    decimals: 1,
    conventionalDecimals: 0,
  },
  CHEM_TSAT: {
    kind: "multiply",
    factor: 0.01,
    siUnit: "mmol/L",
    siReferenceRange: "0.20-0.50",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_FERRITIN: {
    kind: "multiply",
    factor: 1,
    siUnit: "ng/mL",
    siReferenceRange: "M: 12-300 | F: 12-150",
    decimals: 0,
  },
  CHEM_TSH: { kind: "multiply", factor: 1, siUnit: "mIU/L", siReferenceRange: "0.4-4.0", decimals: 1 },
  CHEM_FT4: {
    kind: "multiply",
    factor: 12.87,
    siUnit: "pmol/L",
    siReferenceRange: "10.3-23.2",
    decimals: 1,
    conventionalDecimals: 2,
  },
  CHEM_FT3: {
    kind: "multiply",
    factor: 1.536,
    siUnit: "pmol/L",
    siReferenceRange: "3.5-6.5",
    decimals: 1,
    conventionalDecimals: 1,
  },
  CHEM_TT4: {
    kind: "multiply",
    factor: 12.87,
    siUnit: "nmol/L",
    siReferenceRange: "64.4-154.4",
    decimals: 1,
    conventionalDecimals: 1,
  },
  CHEM_TT3: {
    kind: "multiply",
    factor: 0.0154,
    siUnit: "nmol/L",
    siReferenceRange: "1.23-3.08",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_PT: {
    kind: "multiply",
    factor: 1,
    siUnit: "seconds",
    siReferenceRange: "11-13.5",
    decimals: 1,
  },
  CHEM_INR: {
    kind: "multiply",
    factor: 1,
    siUnit: "ratio",
    siReferenceRange: "0.8-1.1",
    decimals: 2,
  },
  CHEM_APTT: {
    kind: "multiply",
    factor: 1,
    siUnit: "seconds",
    siReferenceRange: "25-35",
    decimals: 0,
  },
  CHEM_BT: {
    kind: "multiply",
    factor: 1,
    siUnit: "minutes",
    siReferenceRange: "2-7",
    decimals: 0,
  },
  CHEM_PROLACTIN: {
    kind: "multiply",
    factor: NG_ML_PROLACTIN_TO_MIUL,
    siUnit: "mIU/L",
    siReferenceRange: "M: 43.5-391 | F: 43.5-630",
    decimals: 0,
    conventionalDecimals: 1,
  },
  CHEM_FSH: {
    kind: "multiply",
    factor: 1,
    siUnit: "IU/L",
    siReferenceRange: "3.5-12.5",
    decimals: 1,
  },
  CHEM_LH: {
    kind: "multiply",
    factor: 1,
    siUnit: "IU/L",
    siReferenceRange: "2.4-12.6",
    decimals: 1,
  },
  CHEM_E2: {
    kind: "multiply",
    factor: PG_ML_E2_TO_PMOL_L,
    siUnit: "pmol/L",
    siReferenceRange: "99-591",
    decimals: 0,
    conventionalDecimals: 0,
  },
  CHEM_PROG: {
    kind: "multiply",
    factor: NG_ML_PROG_TO_NMOL_L,
    siUnit: "nmol/L",
    siReferenceRange: "5.4-85.9",
    decimals: 1,
    conventionalDecimals: 1,
  },
  CHEM_TESTO: {
    kind: "multiply",
    factor: NG_ML_TESTO_TO_NMOL_L,
    siUnit: "nmol/L",
    siReferenceRange: "M: 9.7-37.5 | F: 0.52-2.43",
    decimals: 2,
    conventionalDecimals: 0,
  },
  CHEM_CORTISOL: {
    kind: "multiply",
    factor: UG_DL_CORTISOL_TO_NMOL_L,
    siUnit: "nmol/L",
    siReferenceRange: "165.6-634.6",
    decimals: 1,
    conventionalDecimals: 1,
  },
  CHEM_PSA: {
    kind: "multiply",
    factor: 1,
    siUnit: "μg/L",
    siReferenceRange: "<4.0",
    decimals: 1,
  },
  CHEM_BHCG: {
    kind: "multiply",
    factor: 1,
    siUnit: "IU/L",
    siReferenceRange: "<5",
    decimals: 0,
  },
  CHEM_AFP: {
    kind: "multiply",
    factor: 1,
    siUnit: "μg/L",
    siReferenceRange: "<10",
    decimals: 1,
  },
  CHEM_CEA: {
    kind: "multiply",
    factor: 1,
    siUnit: "μg/L",
    siReferenceRange: "<3.0",
    decimals: 1,
  },
  CHEM_CA199: {
    kind: "multiply",
    factor: 1,
    siUnit: "kU/L",
    siReferenceRange: "<37",
    decimals: 0,
  },
  CHEM_CA125: {
    kind: "multiply",
    factor: 1,
    siUnit: "kU/L",
    siReferenceRange: "<35",
    decimals: 0,
  },
  CHEM_CA153: {
    kind: "multiply",
    factor: 1,
    siUnit: "kU/L",
    siReferenceRange: "<30",
    decimals: 0,
  },
  ART_PH_ART: { kind: "multiply", factor: 1, siUnit: "", siReferenceRange: "7.35-7.45", decimals: 2 },
  ART_PH_VEN: { kind: "multiply", factor: 1, siUnit: "", siReferenceRange: "7.31-7.41", decimals: 2 },
  ART_PAO2: {
    kind: "multiply",
    factor: MMHG_TO_KPA,
    siUnit: "kPa",
    siReferenceRange: "10.7-13.3",
    decimals: 1,
    conventionalDecimals: 0,
  },
  ART_PACO2: {
    kind: "multiply",
    factor: MMHG_TO_KPA,
    siUnit: "kPa",
    siReferenceRange: "4.7-6.0",
    decimals: 1,
    conventionalDecimals: 0,
  },
  ART_HCO3_ACT: { kind: "multiply", factor: 1, siUnit: "mmol/L", siReferenceRange: "22-26", decimals: 1 },
  ART_HCO3_STD: { kind: "multiply", factor: 1, siUnit: "mmol/L", siReferenceRange: "23-28", decimals: 1 },
  ART_SAO2: { kind: "multiply", factor: 1, siUnit: "%", siReferenceRange: "", decimals: 0 },
  ART_BASE_EXCESS: { kind: "multiply", factor: 1, siUnit: "mmol/L", siReferenceRange: "(2.4)+(-2.3)", decimals: 1 },
  ART_PO2_FIO2: {
    kind: "multiply",
    factor: MMHG_TO_KPA,
    siUnit: "kPa/%",
    siReferenceRange: "",
    decimals: 0,
    conventionalDecimals: 0,
  },
};

function normalizeTestCode(code: string | null | undefined): string {
  return String(code ?? "").trim().toUpperCase();
}

export function isBloodChemSiTemplateCode(code: string | null | undefined): boolean {
  return (BLOODCHEM_SI_TEMPLATE_CODES as readonly string[]).includes(normalizeTestCode(code));
}

export function isBloodChemSiTestCode(code: string | null | undefined): code is BloodChemSiTestCode {
  return (BLOODCHEM_SI_TEST_CODES as readonly string[]).includes(normalizeTestCode(code));
}

function configFor(code: string | null | undefined): SiConfig | null {
  const c = normalizeTestCode(code);
  if (!isBloodChemSiTestCode(c)) return null;
  return BLOODCHEM_SI_CONFIG[c];
}

function convertNumeric(cfg: SiConfig, n: number): number {
  if (cfg.kind === "hba1c") return 10.929 * n - 23.5;
  return n * cfg.factor;
}

function convertNumericSiToConventional(cfg: SiConfig, n: number): number {
  if (cfg.kind === "hba1c") return (n + 23.5) / 10.929;
  if (cfg.factor === 0) return n;
  return n / cfg.factor;
}

function conventionalDecimalsFor(cfg: SiConfig): number {
  if (cfg.conventionalDecimals != null) return cfg.conventionalDecimals;
  if (cfg.kind === "multiply" && cfg.factor === 1) return cfg.decimals;
  if (cfg.kind === "hba1c") return 1;
  return 1;
}

export function getSiUnit(testCode: string | null | undefined): string | null {
  return configFor(testCode)?.siUnit ?? null;
}

export function getSiReferenceRange(testCode: string | null | undefined): string | null {
  return configFor(testCode)?.siReferenceRange ?? null;
}

function parseNumericResult(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Convert conventional result to SI numeric string; empty when not applicable. */
export function convertConventionalToSi(
  testCode: string | null | undefined,
  conventionalValue: string | null | undefined,
): string {
  const cfg = configFor(testCode);
  if (!cfg) return "";
  const n = parseNumericResult(String(conventionalValue ?? ""));
  if (n == null) return "";
  return convertNumeric(cfg, n).toFixed(cfg.decimals);
}

/** Convert SI result to conventional numeric string; empty when blank/non-numeric. */
export function convertSiToConventional(
  testCode: string | null | undefined,
  siValue: string | null | undefined,
): string {
  const cfg = configFor(testCode);
  if (!cfg) return "";
  const n = parseNumericResult(String(siValue ?? ""));
  if (n == null) return "";
  return convertNumericSiToConventional(cfg, n).toFixed(conventionalDecimalsFor(cfg));
}

/** Uppercase SI value for PDF print overlay; "—" when blank. */
export function formatPrintedSiResult(
  testCode: string | null | undefined,
  conventionalValue: string | null | undefined,
): string {
  const converted = convertConventionalToSi(testCode, conventionalValue);
  return converted ? converted.toUpperCase() : "—";
}
