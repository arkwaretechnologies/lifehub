import { supabase } from "@/lib/supabaseClient";

export const OBSTETRIC_HISTORY_TABLE = "obstetric_history" as const;

export type EdcByValue = "UTZ" | "LMP" | "Both";

export type ObstetricHistoryRow = {
  id: string;
  trans_id: string;
  not_applicable: boolean | null;
  lmp: string | null;
  pregnant: boolean | null;
  edc: string | null;
  aog_weeks: number | string | null;
  edc_by: string | null;
  gravida: number | null;
  para: number | null;
  full_term: number | null;
  premature: number | null;
  abortion: number | null;
  living: number | null;
  fundal_height_cm: number | string | null;
  efw_grams: number | null;
  prenatal_care: boolean | null;
};

export type PregnantTri = "" | "y" | "n";
export type PncTri = "" | "yes" | "no";

export type ObstetricHistoryForm = {
  not_applicable: boolean;
  lmp: string;
  pregnant: PregnantTri;
  edc: string;
  aog: string;
  wks: string;
  edc_by_utz: boolean;
  edc_by_lmp: boolean;
  gravida: string;
  para: string;
  full_term: string;
  premature: string;
  abortion: string;
  living: string;
  fh_cm: string;
  efw_g: string;
  prenatal: PncTri;
};

export const emptyObstetricHistoryForm: ObstetricHistoryForm = {
  not_applicable: false,
  lmp: "",
  pregnant: "",
  edc: "",
  aog: "",
  wks: "",
  edc_by_utz: false,
  edc_by_lmp: false,
  gravida: "",
  para: "",
  full_term: "",
  premature: "",
  abortion: "",
  living: "",
  fh_cm: "",
  efw_g: "",
  prenatal: "",
};

function dateToInput(d: string | null | undefined): string {
  if (!d) return "";
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function intToInput(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "";
  return String(Math.trunc(Number(v)));
}

function numToInput(v: number | string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? String(v) : "";
}

function pregnantToTri(v: boolean | null | undefined): PregnantTri {
  if (v === true) return "y";
  if (v === false) return "n";
  return "";
}

function pncToTri(v: boolean | null | undefined): PncTri {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "";
}

function edcByToCheckboxes(edc_by: string | null | undefined): { utz: boolean; lmp: boolean } {
  if (edc_by === "Both") return { utz: true, lmp: true };
  if (edc_by === "UTZ") return { utz: true, lmp: false };
  if (edc_by === "LMP") return { utz: false, lmp: true };
  return { utz: false, lmp: false };
}

/** Split stored `aog_weeks` into WKS (primary) vs AOG display when only one field was used — prefer WKS string. */
function aogWeeksToFormFields(aog_weeks: number | string | null | undefined): { aog: string; wks: string } {
  if (aog_weeks == null || aog_weeks === "") return { aog: "", wks: "" };
  const n = typeof aog_weeks === "number" ? aog_weeks : Number.parseFloat(String(aog_weeks));
  if (!Number.isFinite(n)) return { aog: "", wks: "" };
  const s = String(n);
  return { aog: "", wks: s };
}

function rowToForm(row: ObstetricHistoryRow): ObstetricHistoryForm {
  const na = !!row.not_applicable;
  const { utz, lmp: lmpChk } = edcByToCheckboxes(row.edc_by);
  const { aog, wks } = aogWeeksToFormFields(row.aog_weeks);

  return {
    not_applicable: na,
    lmp: na ? "" : dateToInput(row.lmp),
    pregnant: na ? "" : pregnantToTri(row.pregnant),
    edc: na ? "" : dateToInput(row.edc),
    aog: na ? "" : aog,
    wks: na ? "" : wks,
    edc_by_utz: na ? false : utz,
    edc_by_lmp: na ? false : lmpChk,
    gravida: na ? "" : intToInput(row.gravida),
    para: na ? "" : intToInput(row.para),
    full_term: na ? "" : intToInput(row.full_term),
    premature: na ? "" : intToInput(row.premature),
    abortion: na ? "" : intToInput(row.abortion),
    living: na ? "" : intToInput(row.living),
    fh_cm: na ? "" : numToInput(row.fundal_height_cm),
    efw_g: na ? "" : intToInput(row.efw_grams),
    prenatal: na ? "" : pncToTri(row.prenatal_care),
  };
}

function parseIsoDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

function parseAogWeeks(wksRaw: string, aogRaw: string): number | null {
  const w = wksRaw.trim().replace(",", ".");
  const a = aogRaw.trim().replace(",", ".");
  const tryParse = (s: string) => {
    if (!s) return null;
    const n = Number.parseFloat(s);
    if (!Number.isFinite(n) || n < 0 || n > 999.9) return null;
    return Math.round(n * 10) / 10;
  };
  return tryParse(w) ?? tryParse(a);
}

function parseGpalDigit(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 0 || n > 99) return null;
  return n;
}

function parseFundalHeight(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0 || n > 999.99) return null;
  return Math.round(n * 100) / 100;
}

function parseEfw(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 0 || n > 999999) return null;
  return n;
}

function pregnantToBool(v: PregnantTri): boolean | null {
  if (v === "y") return true;
  if (v === "n") return false;
  return null;
}

function pncToBool(v: PncTri): boolean | null {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}

function edcByFromForm(utz: boolean, lmp: boolean): EdcByValue | null {
  if (utz && lmp) return "Both";
  if (utz) return "UTZ";
  if (lmp) return "LMP";
  return null;
}

function formToPayload(form: ObstetricHistoryForm) {
  if (form.not_applicable) {
    return {
      not_applicable: true,
      lmp: null as string | null,
      pregnant: null as boolean | null,
      edc: null as string | null,
      aog_weeks: null as number | null,
      edc_by: null as string | null,
      gravida: null as number | null,
      para: null as number | null,
      full_term: null as number | null,
      premature: null as number | null,
      abortion: null as number | null,
      living: null as number | null,
      fundal_height_cm: null as number | null,
      efw_grams: null as number | null,
      prenatal_care: null as boolean | null,
    };
  }

  return {
    not_applicable: false,
    lmp: parseIsoDate(form.lmp),
    pregnant: pregnantToBool(form.pregnant),
    edc: parseIsoDate(form.edc),
    aog_weeks: parseAogWeeks(form.wks, form.aog),
    edc_by: edcByFromForm(form.edc_by_utz, form.edc_by_lmp),
    gravida: parseGpalDigit(form.gravida),
    para: parseGpalDigit(form.para),
    full_term: parseGpalDigit(form.full_term),
    premature: parseGpalDigit(form.premature),
    abortion: parseGpalDigit(form.abortion),
    living: parseGpalDigit(form.living),
    fundal_height_cm: parseFundalHeight(form.fh_cm),
    efw_grams: parseEfw(form.efw_g),
    prenatal_care: pncToBool(form.prenatal),
  };
}

export async function fetchObstetricHistory(transId: string): Promise<{
  row: ObstetricHistoryRow | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(OBSTETRIC_HISTORY_TABLE)
    .select("*")
    .eq("trans_id", transId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }
  return { row: (data as ObstetricHistoryRow) ?? null, error: null };
}

export async function persistObstetricHistory(
  transId: string,
  existingRowId: string | null,
  form: ObstetricHistoryForm
): Promise<{ rowId: string | null; error: string | null }> {
  const payload = formToPayload(form);

  if (existingRowId) {
    const { error } = await supabase.from(OBSTETRIC_HISTORY_TABLE).update(payload).eq("id", existingRowId);
    return { rowId: existingRowId, error: error?.message ?? null };
  }

  const { data, error } = await supabase
    .from(OBSTETRIC_HISTORY_TABLE)
    .insert({ trans_id: transId, ...payload })
    .select("id")
    .single();

  if (error) {
    return { rowId: null, error: error.message };
  }
  const id = (data as { id?: string } | null)?.id ?? null;
  return { rowId: id, error: null };
}

export function formFromObstetricHistoryRowOrDefault(row: ObstetricHistoryRow | null): ObstetricHistoryForm {
  if (!row) return { ...emptyObstetricHistoryForm };
  return rowToForm(row);
}
