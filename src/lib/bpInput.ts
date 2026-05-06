const BP_DIGITS_MAX = 3;

/** Parse BP from UI string (slash or whitespace between 1–3 digit components). */
export function parseBp(raw: string): { systolic: number | null; diastolic: number | null } {
  const t = raw.trim().toUpperCase();
  if (!t) return { systolic: null, diastolic: null };
  const m = t.match(/^(\d{1,3})\s*\/\s*(\d{1,3})$/);
  if (m) {
    const sys = Number.parseInt(m[1]!, 10);
    const dia = Number.parseInt(m[2]!, 10);
    if (Number.isFinite(sys) && Number.isFinite(dia)) return { systolic: sys, diastolic: dia };
  }
  const m2 = t.match(/^(\d{1,3})\s+(\d{1,3})$/);
  if (m2) {
    const sys = Number.parseInt(m2[1]!, 10);
    const dia = Number.parseInt(m2[2]!, 10);
    if (Number.isFinite(sys) && Number.isFinite(dia)) return { systolic: sys, diastolic: dia };
  }
  return { systolic: null, diastolic: null };
}

/** Split stored value into two numeric fields for dual BP inputs. */
export function splitBpForInputs(raw: string): { systolic: string; diastolic: string } {
  const t = raw.trim();
  if (!t) return { systolic: "", diastolic: "" };

  if (t.includes("/")) {
    const parts = t.split("/").map((p) => p.replace(/\D/g, "").slice(0, BP_DIGITS_MAX));
    return {
      systolic: parts[0] ?? "",
      diastolic: parts[1] ?? "",
    };
  }

  const space = t.match(/^(\d{1,3})\s+(\d{1,3})$/);
  if (space) {
    return { systolic: space[1]!, diastolic: space[2]! };
  }

  const digitsOnly = t.replace(/\D/g, "");
  if (digitsOnly.length <= BP_DIGITS_MAX) {
    return { systolic: digitsOnly, diastolic: "" };
  }
  return {
    systolic: digitsOnly.slice(0, BP_DIGITS_MAX),
    diastolic: digitsOnly.slice(BP_DIGITS_MAX, BP_DIGITS_MAX * 2),
  };
}

/** Combine systolic/diastolic digit strings into the canonical stored form `sys/dia`. */
export function mergeBpFromInputs(systolic: string, diastolic: string): string {
  const s = systolic.replace(/\D/g, "").slice(0, BP_DIGITS_MAX);
  const d = diastolic.replace(/\D/g, "").slice(0, BP_DIGITS_MAX);
  if (!s && !d) return "";
  if (s && d) return `${s}/${d}`;
  return s;
}
