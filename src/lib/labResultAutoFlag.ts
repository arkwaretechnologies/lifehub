/**
 * Derive lab result flags (Normal / High / Low) from numeric results and reference text.
 * When reference range encodes separate male and female ranges (M / F labels), the
 * effective range is chosen from `patientSex`.
 */

export type LabAutoFlag = "Normal" | "High" | "Low";

/** Normalize DB / UI sex to M or F when clearly identifiable. */
export function normalizeLabPatientSex(raw: string | null | undefined): "M" | "F" | null {
  const t = (raw ?? "").trim().toUpperCase();
  if (t === "M" || t === "MALE") return "M";
  if (t === "F" || t === "FEMALE") return "F";
  return null;
}

export type MaleFemaleReferenceParts = { male: string; female: string };

/**
 * Detects paired male/female reference segments, e.g.:
 * - `M: 13-17, F: 12-15`
 * - `Male: 4.5-5.5 | Female: 4.0-5.0`
 * - `F: 12-15; M: 13-17`
 */
export function parseMaleFemaleReferenceParts(referenceRange: string): MaleFemaleReferenceParts | null {
  const s = referenceRange.trim();
  if (!s) return null;

  const reMF =
    /\bM(?:ALE)?\s*[:=]\s*([\s\S]+?)\s*(?:[,;|/]|\s{2,})\s*F(?:EMALE)?\s*[:=]\s*([\s\S]+)$/i;
  const mMF = s.match(reMF);
  if (mMF) {
    const male = mMF[1]?.trim() ?? "";
    const female = mMF[2]?.trim() ?? "";
    if (male && female) return { male, female };
  }

  const reFM =
    /\bF(?:EMALE)?\s*[:=]\s*([\s\S]+?)\s*(?:[,;|/]|\s{2,})\s*M(?:ALE)?\s*[:=]\s*([\s\S]+)$/i;
  const mFM = s.match(reFM);
  if (mFM) {
    const female = mFM[1]?.trim() ?? "";
    const male = mFM[2]?.trim() ?? "";
    if (male && female) return { male, female };
  }

  return null;
}

/** Pick the reference substring for this patient when M/F ranges are present. */
export function effectiveReferenceRangeForSex(
  referenceRange: string | null | undefined,
  patientSex: string | null | undefined,
): string {
  const full = (referenceRange ?? "").trim();
  if (!full) return "";
  const dual = parseMaleFemaleReferenceParts(full);
  if (!dual) return full;
  const sex = normalizeLabPatientSex(patientSex);
  if (sex === "M") return dual.male || full;
  if (sex === "F") return dual.female || full;
  return full;
}

function parseLeadingNumber(value: string): number | null {
  const t = value.trim().replace(/,/g, "");
  const m = t.match(/^-?\d*\.?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

type Bounds =
  | { kind: "interval"; low: number; high: number }
  | { kind: "max"; high: number; inclusive: boolean }
  | { kind: "min"; low: number; inclusive: boolean };

function parseBoundsFromRangeText(rangeText: string): Bounds | null {
  const s = rangeText.replace(/\u2013|\u2014/g, "-").trim();
  if (!s) return null;

  const between = s.match(
    /^([0-9]*\.?[0-9]+)\s*(?:-|–|—|~|to)\s*([0-9]*\.?[0-9]+)$/i,
  );
  if (between) {
    const low = Number(between[1]);
    const high = Number(between[2]);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
    return low <= high ? { kind: "interval", low, high } : { kind: "interval", low: high, high: low };
  }

  const lt = s.match(/^<\s*([0-9]*\.?[0-9]+)\s*$/i);
  if (lt) {
    const high = Number(lt[1]);
    if (!Number.isFinite(high)) return null;
    return { kind: "max", high, inclusive: false };
  }

  const le = s.match(/^<=\s*([0-9]*\.?[0-9]+)\s*$/i) || s.match(/^≤\s*([0-9]*\.?[0-9]+)\s*$/i);
  if (le) {
    const high = Number(le[1]);
    if (!Number.isFinite(high)) return null;
    return { kind: "max", high, inclusive: true };
  }

  const gt = s.match(/^>\s*([0-9]*\.?[0-9]+)\s*$/i);
  if (gt) {
    const low = Number(gt[1]);
    if (!Number.isFinite(low)) return null;
    return { kind: "min", low, inclusive: false };
  }

  const ge = s.match(/^>=\s*([0-9]*\.?[0-9]+)\s*$/i) || s.match(/^≥\s*([0-9]*\.?[0-9]+)\s*$/i);
  if (ge) {
    const low = Number(ge[1]);
    if (!Number.isFinite(low)) return null;
    return { kind: "min", low, inclusive: true };
  }

  return null;
}

/**
 * Returns Normal / High / Low when the result is numeric and the (sex-adjusted) range parses.
 * Otherwise returns `null` (caller should keep the existing flag).
 */
export function computeLabResultAutoFlag(
  resultValue: string | null | undefined,
  referenceRange: string | null | undefined,
  patientSex: string | null | undefined,
): LabAutoFlag | null {
  const n = parseLeadingNumber(String(resultValue ?? ""));
  if (n == null) return null;

  const effective = effectiveReferenceRangeForSex(referenceRange, patientSex);
  const bounds = parseBoundsFromRangeText(effective);
  if (!bounds) return null;

  if (bounds.kind === "interval") {
    if (n < bounds.low) return "Low";
    if (n > bounds.high) return "High";
    return "Normal";
  }
  if (bounds.kind === "max") {
    if (bounds.inclusive) {
      if (n > bounds.high) return "High";
      return "Normal";
    }
    if (n >= bounds.high) return "High";
    return "Normal";
  }
  if (bounds.kind === "min") {
    if (bounds.inclusive) {
      if (n < bounds.low) return "Low";
      return "Normal";
    }
    if (n <= bounds.low) return "Low";
    return "Normal";
  }
  return null;
}

export function mergeAutoFlagIntoLabResultRow<T extends { result_value?: string | null; reference_range?: string | null; flag?: string | null }>(
  row: T,
  patientSex: string | null | undefined,
): T {
  const auto = computeLabResultAutoFlag(row.result_value, row.reference_range, patientSex);
  if (auto == null) return row;
  return { ...row, flag: auto };
}
