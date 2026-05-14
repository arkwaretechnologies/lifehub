import type { EncounterPlansTreatmentForm } from "@/lib/consultationData";
import {
  labRequestPackagesDisplayNames,
  type EncounterLabRequestSummary,
  type LabRequestItemDetailRow,
} from "@/lib/labRequests";

import { IMAGING_NOTES_END, IMAGING_NOTES_START } from "@/lib/imagingCatalog";

/** Remove embedded imaging request block so it is not duplicated when IMAGING is printed separately. */
export function stripImagingRequestBlock(planNotes: string): string {
  const notes = planNotes ?? "";
  const start = notes.indexOf(IMAGING_NOTES_START);
  const end = notes.indexOf(IMAGING_NOTES_END);
  if (start === -1 || end === -1 || end < start) return notes;
  const before = notes.slice(0, start).trimEnd();
  const after = notes.slice(end + IMAGING_NOTES_END.length).trimStart();
  return [before, after].filter(Boolean).join("\n\n");
}

/** Human-readable imaging lines from plan_notes (without marker lines). */
export function extractImagingRequestLinesForPrint(planNotes: string): string {
  const start = planNotes.indexOf(IMAGING_NOTES_START);
  const end = planNotes.indexOf(IMAGING_NOTES_END);
  if (start === -1 || end === -1 || end < start) return "";
  const inner = planNotes.slice(start + IMAGING_NOTES_START.length, end);
  return inner
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== "IMAGING REQUEST:")
    .join("\n");
}

function formatReqTime(t: string | null | undefined): string {
  if (t == null || String(t).trim() === "") return "";
  const s = String(t).trim();
  if (s.length >= 5 && s[2] === ":") return s.slice(0, 5);
  const m = s.match(/(\d{1,2}:\d{2})/);
  return m?.[1] ?? "";
}

function itemHasResult(it: LabRequestItemDetailRow): boolean {
  if ((it.result_value ?? "").trim() !== "") return true;
  if ((it.result_status ?? "").trim() !== "") return true;
  return false;
}

function formatLabItemLine(it: LabRequestItemDetailRow): string {
  const tid = String(it.lab_test_id ?? "").trim();
  const name =
    (it.test_name ?? "").trim() ||
    (tid ? `Test ${tid.length > 10 ? `${tid.slice(0, 8)}…` : tid}` : "Test");
  if (!itemHasResult(it)) {
    return `- ${name}: (pending / no result recorded)`;
  }
  const val = (it.result_value ?? "").trim();
  const unit = (it.result_unit ?? "").trim();
  const ref = (it.reference_range ?? "").trim();
  const flag = (it.flag ?? "").trim();
  const st = (it.result_status ?? "").trim();
  const mid = [val || "—", unit].filter(Boolean).join(" ");
  const tail = [ref ? `Ref: ${ref}` : null, flag ? `Flag: ${flag}` : null, st ? `Status: ${st}` : null]
    .filter(Boolean)
    .join(" · ");
  return tail ? `- ${name}: ${mid} (${tail})` : `- ${name}: ${mid}`;
}

/**
 * Printable laboratory section: grouped by order, with result values when present.
 */
export function formatLaboratorySectionForPrint(
  requests: EncounterLabRequestSummary[],
  items: LabRequestItemDetailRow[],
): string {
  if (requests.length === 0 && items.length === 0) return "";
  const byReq = new Map<string, LabRequestItemDetailRow[]>();
  for (const it of items) {
    const list = byReq.get(it.lab_request_id) ?? [];
    list.push(it);
    byReq.set(it.lab_request_id, list);
  }

  const sortedReqs = [...requests].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const chunks: string[] = ["LABORATORY:"];

  if (sortedReqs.length > 0) {
    for (const r of sortedReqs) {
      const lines = byReq.get(r.id) ?? [];
      const when = [r.request_date, formatReqTime(r.request_time)].filter(Boolean).join(" ");
      const pkgNames = labRequestPackagesDisplayNames(r);
      const title = `Order ${when} · ${r.priority ?? "—"}${pkgNames ? ` · ${pkgNames}` : ""}`;
      chunks.push(title);
      if (lines.length === 0) {
        chunks.push(`- (No line items loaded — request id: ${r.id})`);
        continue;
      }
      const sortedLines = [...lines].sort((a, b) => a.id.localeCompare(b.id));
      for (const it of sortedLines) {
        chunks.push(formatLabItemLine(it));
      }
    }
    return chunks.join("\n");
  }

  if (items.length > 0) {
    const sortedLines = [...items].sort((a, b) => a.id.localeCompare(b.id));
    for (const it of sortedLines) {
      chunks.push(formatLabItemLine(it));
    }
    return chunks.join("\n");
  }

  return "";
}

export type PlanPrintBuildArgs = {
  plan: EncounterPlansTreatmentForm;
  labRequests: EncounterLabRequestSummary[];
  labItems: LabRequestItemDetailRow[];
  /** One line per medication (e.g. "Name | dose | frequency"). */
  medicationLines: string[];
};

/**
 * Plan/treatment area for the consultation PDF: structured labs / imaging / meds / referral,
 * then remaining free-text notes (imaging block stripped to avoid duplication).
 */
export function buildConsultationPlanNotesForPrint(args: PlanPrintBuildArgs): string {
  const { plan, labRequests, labItems, medicationLines } = args;
  const parts: string[] = [];

  /** Print lab summary whenever this encounter has orders (checkbox can be false if not re-saved). */
  if (labRequests.length > 0 || labItems.length > 0) {
    const labTxt = formatLaboratorySectionForPrint(labRequests, labItems).trim();
    if (labTxt) parts.push(labTxt);
  }

  const imgForPrint = extractImagingRequestLinesForPrint(plan.plan_notes).trim();
  if ((plan.plan_imaging || imgForPrint.length > 0) && imgForPrint.length > 0) {
    parts.push(`IMAGING:\n${imgForPrint}`);
  }

  /** Print meds whenever the encounter has medication lines (checkbox can be false if not re-saved). */
  if (medicationLines.length > 0) {
    parts.push(`MEDICATIONS:\n${medicationLines.map((l) => `- ${l}`).join("\n")}`);
  }

  const notesBody = stripImagingRequestBlock(plan.plan_notes).trim();

  if (plan.plan_referral && notesBody) {
    parts.push(`REFERRAL / PLAN NOTES:\n${notesBody}`);
  } else if (plan.plan_referral) {
    parts.push("REFERRAL: Indicated (no additional free-text notes on file).");
  } else if (notesBody) {
    parts.push(`PLAN NOTES:\n${notesBody}`);
  }

  const composed = parts.filter(Boolean).join("\n\n").trim();
  if (composed) return composed;
  const rawFallback = stripImagingRequestBlock(plan.plan_notes).trim() || (plan.plan_notes ?? "").trim();
  return rawFallback ? `PLAN NOTES:\n${rawFallback}` : "";
}
