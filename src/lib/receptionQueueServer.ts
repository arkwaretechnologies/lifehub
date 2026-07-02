import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  searchPatientsPicker,
  sanitizePatientSearchQuery,
  type PatientPickerRow,
} from "@/lib/patientsCatalog";
import {
  parseReceptionDoctorQueueCodes,
  QUEUE_TICKET_RECEPTION_SELECT,
  type QueueCounterRow,
  type QueuePriorityRow,
  type QueueTicketRow,
  type QueueTicketStatus,
  type ReceptionDepartmentCounters,
} from "@/lib/queueReception";
import { numericIdFromUnknown } from "@/lib/sessionUserId";
import { parseBp } from "@/lib/bpInput";
import {
  clinicDateYmd,
  clinicEncounterDateTimeFields,
  clinicTimeHms,
  queueTicketTodayIsoDate,
} from "@/lib/queueTicketDate";
import { applyPartialLabReleaseToNotes } from "@/lib/labPartialCollection";
import { insertLabQueueNewRequestNotifications } from "@/lib/labQueueNotificationServer";
import { computeLabRequestQueueCollectionState } from "@/lib/labQueueTicketSync";
import { applyActiveDeptToNotes } from "@/lib/queueActiveDept";
import { validateEncounterLabCreate, validateEncounterImagingCreate } from "@/lib/encounterDiagnosticOrderState";
import { afterEncounterReportDataMutation } from "@/lib/cacheInvalidation";
import {
  fetchLabRequestPackageIdsByRequestIdMap,
  LAB_REQUEST_ITEMS_TABLE,
  LAB_REQUEST_PACKAGES_TABLE,
  LAB_REQUESTS_TABLE,
  normalizeLabRequestPackageIdList,
} from "@/lib/labRequests";
import { attachPanelLinksToCatalogItems } from "@/lib/labTestPanelLinks";
import {
  buildLabRequestItemRows,
  LAB_TEST_CATALOG_SELECT,
  LAB_TESTS_TABLE,
  mapLabTestCatalogItem,
} from "@/lib/labTests";
import { LAB_SALES_TABLE } from "@/lib/cashierPayments";
import {
  adminLabRequestIdsWithLabSales,
  adminLoadDiagnosticCounterIds,
  imagingQueueCode,
  labQueueCode,
} from "@/lib/diagnosticQueueServer";
import {
  adminCreateImagingRequestWithItems,
  ensureImagingRequestForLabPackages,
  imagingSelectionHasChecked,
  syncUnpaidImagingItemsToPackageCoverage,
} from "@/lib/imagingRequests";
import type { ImagingLineSelection } from "@/lib/imagingCatalog";
import { fetchActiveImagingCatalogForDb } from "@/lib/imagingCatalog";

const ACTIVE_STATUSES: QueueTicketStatus[] = ["Waiting", "Called", "Serving"];

export function queueAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.startsWith("http") || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseCounterCodesEnv(): string[] | null {
  const raw = process.env.NEXT_PUBLIC_RECEPTION_QUEUE_COUNTER_CODES?.trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

/** Tried in order after optional `NEXT_PUBLIC_RECEPTION_ENTRANCE_COUNTER_CODE`. */
function entranceCodeCandidates(): string[] {
  const primary = (process.env.NEXT_PUBLIC_RECEPTION_ENTRANCE_COUNTER_CODE ?? "ENTRANCE").trim().toUpperCase();
  const fromList =
    process.env.NEXT_PUBLIC_RECEPTION_ENTRANCE_COUNTER_CODES?.split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean) ?? [];
  const defaults = ["ENTRANCE", "RECEPTION", "REGISTRATION", "FRONT", "KIOSK", "FRONT_DESK"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [primary, ...fromList, ...defaults]) {
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

function pickEntranceByCodes(candidates: string[], rows: QueueCounterRow[]): QueueCounterRow | null {
  const byCode = new Map(rows.map((r) => [r.code.trim().toUpperCase(), r]));
  for (const code of candidates) {
    const hit = byCode.get(code);
    if (hit) return hit;
  }
  return null;
}

function counterKey(id: string | number): string {
  return String(id);
}

function pickBusiestCounter(tickets: QueueTicketRow[], rows: QueueCounterRow[]): QueueCounterRow | null {
  const counts = new Map<string, number>();
  for (const t of tickets) {
    const k = counterKey(t.counter_id);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let bestId: string | null = null;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      bestN = n;
      bestId = id;
    }
  }
  if (!bestId) return null;
  return rows.find((r) => counterKey(r.id) === bestId) ?? null;
}

function pickEntranceByNameHint(rows: QueueCounterRow[]): QueueCounterRow | null {
  const re = /entrance|kiosk|registration|front\s*desk|ticket|queue/i;
  return rows.find((c) => re.test(`${c.name ?? ""} ${c.code ?? ""}`)) ?? null;
}

function resolveDepartmentCounters(allCounters: QueueCounterRow[]): ReceptionDepartmentCounters {
  const byCode = new Map(allCounters.map((r) => [r.code.trim().toUpperCase(), r]));
  const consultation: QueueCounterRow[] = [];
  for (const code of parseReceptionDoctorQueueCodes()) {
    const hit = byCode.get(code);
    if (hit) consultation.push(hit);
  }
  return {
    consultation,
    laboratory: byCode.get(labQueueCode()) ?? null,
    imaging: byCode.get(imagingQueueCode()) ?? null,
  };
}

export type ReceptionQueueStatePayload = {
  counters: QueueCounterRow[];
  entranceCounter: QueueCounterRow | null;
  departmentCounters: ReceptionDepartmentCounters;
  priorities: QueuePriorityRow[];
  tickets: QueueTicketRow[];
  warnings: string[];
};

export async function loadReceptionQueueState(): Promise<
  | ({ ok: true } & ReceptionQueueStatePayload)
  | { ok: false; error: string; warnings: string[] }
> {
  const admin = queueAdminClient();
  const warnings: string[] = [];

  if (!admin) {
    return {
      ok: false,
      error:
        "Server is missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL). Add the service role key to .env.local — reception uses it to read queue tables (browser anon key is often blocked by RLS).",
      warnings,
    };
  }

  const { data: counterData, error: counterErr } = await admin
    .from("queue_counters")
    .select("id, code, name, description, prefix, user_id")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (counterErr) {
    return { ok: false, error: counterErr.message, warnings };
  }

  const allCounters = (counterData ?? []) as QueueCounterRow[];

  if (allCounters.length === 0) {
    const { count, error: countErr } = await admin.from("queue_counters").select("*", { count: "exact", head: true });
    if (!countErr && count && count > 0) {
      warnings.push(
        "Found queue_counters rows, but none have is_active = true. Turn on is_active for at least your entrance counter in Supabase.",
      );
    }
  }

  let counters = allCounters;
  const filterCodes = parseCounterCodesEnv();
  if (filterCodes?.length) {
    const set = new Set(filterCodes);
    counters = allCounters.filter((c) => set.has(c.code.trim().toUpperCase()));
    const order = new Map(filterCodes.map((c, i) => [c, i]));
    counters.sort((a, b) => (order.get(a.code.toUpperCase()) ?? 99) - (order.get(b.code.toUpperCase()) ?? 99));
  }

  let allTodayTickets: QueueTicketRow[] = [];
  if (allCounters.length > 0) {
    const { data: tAll, error: tAllErr } = await admin
      .from("queue_tickets")
      .select(QUEUE_TICKET_RECEPTION_SELECT)
      .in(
        "counter_id",
        allCounters.map((c) => c.id),
      )
      .eq("ticket_date", queueTicketTodayIsoDate())
      .in("status", ACTIVE_STATUSES)
      .order("issued_at", { ascending: true });

    if (tAllErr) {
      return { ok: false, error: tAllErr.message, warnings };
    }
    allTodayTickets = (tAll ?? []) as QueueTicketRow[];
  }

  const candidates = entranceCodeCandidates();
  let entrance: QueueCounterRow | null = pickEntranceByCodes(candidates, allCounters);

  if (!entrance) {
    entrance = pickBusiestCounter(allTodayTickets, allCounters);
    if (entrance) {
      warnings.push(
        `Entrance queue is using counter “${entrance.name ?? entrance.code}” (code ${entrance.code}) because no row matched ${candidates.slice(0, 4).join(", ")}${candidates.length > 4 ? ", …" : ""}. To pin it, set NEXT_PUBLIC_RECEPTION_ENTRANCE_COUNTER_CODE=${entrance.code} in .env.local.`,
      );
    }
  }

  if (!entrance) {
    entrance = pickEntranceByNameHint(allCounters);
    if (entrance) {
      warnings.push(
        `Entrance queue is using “${entrance.name ?? entrance.code}” based on name/code. Set NEXT_PUBLIC_RECEPTION_ENTRANCE_COUNTER_CODE=${entrance.code} to make this explicit.`,
      );
    }
  }

  const departmentCounters = resolveDepartmentCounters(allCounters);

  const visibleCounterIds = new Set(counters.map((c) => counterKey(c.id)));
  if (entrance) visibleCounterIds.add(counterKey(entrance.id));
  for (const c of departmentCounters.consultation) visibleCounterIds.add(counterKey(c.id));
  if (departmentCounters.laboratory) visibleCounterIds.add(counterKey(departmentCounters.laboratory.id));
  if (departmentCounters.imaging) visibleCounterIds.add(counterKey(departmentCounters.imaging.id));
  const tickets = allTodayTickets.filter((t) => visibleCounterIds.has(counterKey(t.counter_id)));

  const { data: priData, error: priErr } = await admin
    .from("queue_priorities")
    .select("id, code, name")
    .eq("is_active", true);

  if (priErr) {
    return { ok: false, error: priErr.message, warnings };
  }
  const priorities = (priData ?? []) as QueuePriorityRow[];

  return { ok: true, counters, entranceCounter: entrance, departmentCounters, priorities, tickets, warnings };
}

export async function loadReceptionQueueTickets(): Promise<
  { ok: true; tickets: QueueTicketRow[] } | { ok: false; error: string }
> {
  const state = await loadReceptionQueueState();
  if (!state.ok) {
    return { ok: false, error: state.error };
  }
  return { ok: true, tickets: state.tickets };
}

export async function adminUpdateTicketStatus(
  ticketId: string,
  status: QueueTicketStatus,
  timestamps: { called_at?: string | null; serving_at?: string | null },
): Promise<{ error: string | null }> {
  const admin = queueAdminClient();
  if (!admin) {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    status,
    updated_at: now,
  };
  if ("called_at" in timestamps) payload.called_at = timestamps.called_at;
  if ("serving_at" in timestamps) payload.serving_at = timestamps.serving_at;
  if (status === "Completed") {
    payload.completed_at = now;
  }

  const { error } = await admin.from("queue_tickets").update(payload).eq("id", ticketId);
  return { error: error?.message ?? null };
}

/** Recall: refresh `called_at` so queue TV apps re-announce without changing status. */
export async function adminBumpTicketCalledAt(ticketId: string): Promise<{ error: string | null }> {
  const admin = queueAdminClient();
  if (!admin) {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }
  const now = new Date().toISOString();
  const { error } = await admin
    .from("queue_tickets")
    .update({ called_at: now, updated_at: now })
    .eq("id", ticketId);
  return { error: error?.message ?? null };
}

export type CallQueueForEncounterResult = {
  error: string | null;
  queueDisplay?: string;
  patientName?: string | null;
  counterName?: string | null;
};

export type CompleteQueueForEncounterResult = {
  error: string | null;
  updatedCount?: number;
};

/**
 * Appointments / physician: set today's Waiting doctor-queue ticket for this encounter to Called.
 * Authorizes via `encounters.physician_id`. Prefers tickets on counters whose `user_id` matches the physician.
 */
export async function adminCallQueueTicketForPhysicianEncounter(
  encounterTransIdRaw: string,
  physicianUserId: number,
): Promise<CallQueueForEncounterResult> {
  const admin = queueAdminClient();
  if (!admin) {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }
  if (!Number.isFinite(physicianUserId) || physicianUserId <= 0) {
    return { error: "Invalid physician user id." };
  }

  const encounterTransId = encounterTransIdRaw.trim().toLowerCase();
  if (!encounterTransId) {
    return { error: "Missing encounter id." };
  }

  const { data: enc, error: encErr } = await admin
    .from("encounters")
    .select("trans_id, physician_id")
    .eq("trans_id", encounterTransId)
    .maybeSingle();

  if (encErr) {
    return { error: encErr.message };
  }
  if (!enc) {
    return { error: "Encounter not found." };
  }
  const encPhysician = numericIdFromUnknown((enc as { physician_id?: unknown }).physician_id);
  if (encPhysician !== physicianUserId) {
    return { error: "This encounter is not assigned to your user account." };
  }

  const today = queueTicketTodayIsoDate();

  const { data: counterRows, error: cErr } = await admin.from("queue_counters").select("id, user_id").eq("is_active", true);
  if (cErr) {
    return { error: cErr.message };
  }

  const myCounterIds: (string | number)[] = [];
  for (const row of counterRows ?? []) {
    const r = row as { id: string | number; user_id?: unknown };
    if (numericIdFromUnknown(r.user_id) === physicianUserId) {
      myCounterIds.push(r.id);
    }
  }

  type TicketPick = {
    id: string;
    queue_display: string;
    patient_name: string | null;
    counter_id: string | number;
  };

  let ticket: TicketPick | null = null;

  if (myCounterIds.length > 0) {
    const { data, error } = await admin
      .from("queue_tickets")
      .select("id, queue_display, patient_name, counter_id")
      .eq("encounter_id", encounterTransId)
      .eq("ticket_date", today)
      .eq("status", "Waiting")
      .in("counter_id", myCounterIds)
      .order("issued_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      return { error: error.message };
    }
    if (data) {
      ticket = data as TicketPick;
    }
  }

  if (!ticket) {
    const { data, error } = await admin
      .from("queue_tickets")
      .select("id, queue_display, patient_name, counter_id")
      .eq("encounter_id", encounterTransId)
      .eq("ticket_date", today)
      .eq("status", "Waiting")
      .order("issued_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      return { error: error.message };
    }
    if (data) {
      ticket = data as TicketPick;
    }
  }

  if (!ticket) {
    return { error: "No waiting queue ticket for this visit today." };
  }

  const now = new Date().toISOString();
  const upd = await adminUpdateTicketStatus(String(ticket.id), "Called", { called_at: now, serving_at: null });
  if (upd.error) {
    return { error: upd.error };
  }

  const { data: ctr } = await admin.from("queue_counters").select("name, code").eq("id", ticket.counter_id).maybeSingle();
  const cn = ctr as { name?: string | null; code?: string | null } | null;
  const counterName = (cn?.name ?? cn?.code ?? "").trim() || null;

  return {
    error: null,
    queueDisplay: ticket.queue_display,
    patientName: ticket.patient_name,
    counterName,
  };
}

/**
 * Consultation: mark today's Called/Serving ticket(s) for this encounter as Completed.
 * This is best-effort; if no ticket exists we return ok with updatedCount=0.
 */
export async function adminCompleteQueueTicketsForEncounter(
  encounterTransIdRaw: string,
): Promise<CompleteQueueForEncounterResult> {
  const admin = queueAdminClient();
  if (!admin) {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  }

  const encounterId = encounterTransIdRaw.trim().toLowerCase();
  if (!encounterId) {
    return { error: "Missing encounter id." };
  }

  const today = queueTicketTodayIsoDate();
  const now = new Date().toISOString();

  const { data: tickets, error: tErr } = await admin
    .from("queue_tickets")
    .select("id")
    .eq("encounter_id", encounterId)
    .eq("ticket_date", today)
    .in("status", ["Called", "Serving"]);

  if (tErr) {
    return { error: tErr.message };
  }

  const ids = (tickets ?? []).map((r) => String((r as { id: string | number }).id)).filter(Boolean);
  if (ids.length === 0) {
    return { error: null, updatedCount: 0 };
  }

  const { error: upErr } = await admin
    .from("queue_tickets")
    .update({ status: "Completed", completed_at: now, updated_at: now })
    .in("id", ids);
  if (upErr) {
    return { error: upErr.message };
  }

  return { error: null, updatedCount: ids.length };
}

export type ReceptionTriageRoute = "consultation" | "laboratory";

type ReceptionVitalsInput = {
  bp: string;
  hr: string;
  rr: string;
  temp: string;
  o2: string;
  weight_kg: string;
  height_cm: string;
  bmi: string;
};

function parseNonNegativeInt(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

async function adminCreateEncounterForPatient(patientId: number): Promise<{ transId: string | null; error: string | null }> {
  const admin = queueAdminClient();
  if (!admin) return { transId: null, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  const { data, error } = await admin
    .from("encounters")
    .insert({
      patient_id: patientId,
      ...clinicEncounterDateTimeFields(),
    })
    .select("trans_id")
    .maybeSingle();
  if (error) return { transId: null, error: error.message };
  const transId = (data as { trans_id?: string } | null)?.trans_id ?? null;
  if (!transId) return { transId: null, error: "Encounter was not created." };
  void afterEncounterReportDataMutation();
  return { transId, error: null };
}

async function adminCreateLabRequestWithItems(input: {
  encounterId: string | null;
  patientId: number;
  referringPhysician: string | null;
  physicianId: number | null;
  priority: string;
  clinicalDiagnosis?: string | null;
  remarks: string | null;
  labTestIds: string[];
  itemPriority?: "Routine" | "STAT" | null;
  packageIds?: number[] | null;
}): Promise<{ labRequestId: string | null; imagingRequestId: string | null; error: string | null }> {
  const admin = queueAdminClient();
  if (!admin) return { labRequestId: null, imagingRequestId: null, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };

  const now = new Date();
  const request_date = clinicDateYmd(now);
  const request_time = clinicTimeHms(now);

  const clinical =
    input.clinicalDiagnosis != null && input.clinicalDiagnosis.trim() !== ""
      ? input.clinicalDiagnosis.trim()
      : null;

  const packageIds = normalizeLabRequestPackageIdList(input.packageIds ?? []);
  const testIdsRaw = [...new Set(input.labTestIds.map((x) => x.trim()).filter(Boolean))];
  const enc = input.encounterId != null ? String(input.encounterId).trim() : "";

  let packageIdsToSave = packageIds;
  let testIds = testIdsRaw;

  if (enc) {
    const { data: testRows, error: catErr } = await admin
      .from(LAB_TESTS_TABLE)
      .select(LAB_TEST_CATALOG_SELECT);
    if (catErr) return { labRequestId: null, imagingRequestId: null, error: catErr.message };
    let catalog = ((testRows ?? []) as Record<string, unknown>[]).map((raw) => mapLabTestCatalogItem(raw));
    const attached = await attachPanelLinksToCatalogItems(admin, catalog);
    if (attached.error) return { labRequestId: null, imagingRequestId: null, error: attached.error };
    catalog = attached.tests;
    const validated = await validateEncounterLabCreate(admin, enc, testIdsRaw, packageIds, catalog);
    if (validated.error) return { labRequestId: null, imagingRequestId: null, error: validated.error };
    testIds = validated.labTestIds;
    packageIdsToSave = validated.packageIds;
  }

  if (testIds.length === 0 && packageIdsToSave.length === 0) {
    return { labRequestId: null, imagingRequestId: null, error: "Select at least one lab test or package." };
  }

  const { data: row, error: insErr } = await admin
    .from(LAB_REQUESTS_TABLE)
    .insert({
      encounter_id: input.encounterId,
      patient_id: input.patientId,
      request_date,
      request_time,
      priority: input.priority || "Routine",
      referring_physician: input.referringPhysician,
      clinical_diagnosis: clinical,
      remarks: input.remarks,
      physician_id: input.physicianId,
    })
    .select("id")
    .single();

  if (insErr) return { labRequestId: null, imagingRequestId: null, error: insErr.message };
  const labRequestId = (row as { id: string }).id;

  if (packageIdsToSave.length > 0) {
    const pkgRows = packageIdsToSave.map((lab_package_id, sort_order) => ({
      lab_request_id: labRequestId,
      lab_package_id,
      sort_order,
    }));
    const { error: pkgErr } = await admin.from(LAB_REQUEST_PACKAGES_TABLE).insert(pkgRows);
    if (pkgErr) {
      await admin.from(LAB_REQUESTS_TABLE).delete().eq("id", labRequestId);
      return { labRequestId: null, imagingRequestId: null, error: pkgErr.message };
    }
  }

  const linePriority = input.itemPriority ?? "Routine";

  if (testIds.length > 0) {
    const { data: testRows, error: catErr } = await admin
      .from(LAB_TESTS_TABLE)
      .select(LAB_TEST_CATALOG_SELECT);
    if (catErr) {
      await admin.from(LAB_REQUESTS_TABLE).delete().eq("id", labRequestId);
      return { labRequestId: null, imagingRequestId: null, error: catErr.message };
    }
    let catalog = ((testRows ?? []) as Record<string, unknown>[]).map((raw) => mapLabTestCatalogItem(raw));
    const attached = await attachPanelLinksToCatalogItems(admin, catalog);
    if (attached.error) {
      await admin.from(LAB_REQUESTS_TABLE).delete().eq("id", labRequestId);
      return { labRequestId: null, imagingRequestId: null, error: attached.error };
    }
    catalog = attached.tests;

    const itemSpecs = buildLabRequestItemRows(testIds, catalog);
    const items = itemSpecs.map((row) => ({
      lab_request_id: labRequestId,
      lab_test_id: row.lab_test_id,
      notes: null,
      priority: linePriority,
      is_billable: row.is_billable,
    }));

    const { error: itemsErr } = await admin.from(LAB_REQUEST_ITEMS_TABLE).insert(items);
    if (itemsErr) {
      await admin.from(LAB_REQUESTS_TABLE).delete().eq("id", labRequestId);
      return { labRequestId: null, imagingRequestId: null, error: itemsErr.message };
    }
  }

  let imagingRequestId: string | null = null;
  if (enc && packageIdsToSave.length > 0) {
    const sync = await syncUnpaidImagingItemsToPackageCoverage(admin, enc, packageIdsToSave);
    if (sync.error) {
      await admin.from(LAB_REQUESTS_TABLE).delete().eq("id", labRequestId);
      return { labRequestId: null, imagingRequestId: null, error: sync.error };
    }
    const ensured = await ensureImagingRequestForLabPackages(admin, {
      encounterId: enc,
      patientId: input.patientId,
      packageIds: packageIdsToSave,
      remarks: "Laboratory package imaging",
    });
    if (ensured.error) {
      await admin.from(LAB_REQUESTS_TABLE).delete().eq("id", labRequestId);
      return { labRequestId: null, imagingRequestId: null, error: ensured.error };
    }
    imagingRequestId = ensured.imagingRequestId ?? null;
  }

  void afterEncounterReportDataMutation();

  return { labRequestId, imagingRequestId, error: null };
}

function parseCounterId(row: QueueCounterRow): number | null {
  const n = typeof row.id === "number" ? row.id : Number.parseInt(String(row.id), 10);
  return Number.isFinite(n) ? n : null;
}

/** `queue_counters.user_id` → `encounters.physician_id` (app users PK). */
function parseQueueCounterPhysicianUserId(row: QueueCounterRow): number | null {
  return numericIdFromUnknown(row.user_id);
}

async function adminResolveCounterByCode(admin: SupabaseClient, code: string): Promise<{ row: QueueCounterRow | null; numericId: number | null; error: string | null }> {
  const want = code.trim().toUpperCase();
  const { data, error } = await admin.from("queue_counters").select("id, code, name, description, prefix, user_id").eq("is_active", true);
  if (error) return { row: null, numericId: null, error: error.message };
  const rows = (data ?? []) as QueueCounterRow[];
  const hit = rows.find((c) => c.code.trim().toUpperCase() === want) ?? null;
  if (!hit) return { row: null, numericId: null, error: `No active queue counter with code “${code}”.` };
  const numericId = parseCounterId(hit);
  if (numericId == null) return { row: null, numericId: null, error: "Invalid counter id." };
  return { row: hit, numericId, error: null };
}

async function adminDefaultPriorityId(admin: SupabaseClient): Promise<{
  id: number;
  code: string;
  name: string | null;
  error: string | null;
}> {
  const { data, error } = await admin
    .from("queue_priorities")
    .select("id, code, name")
    .eq("is_active", true)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return { id: 0, code: "", name: null, error: error.message };
  const row = data as { id?: number; code?: string; name?: string | null } | null;
  if (row?.id == null) return { id: 0, code: "", name: null, error: "No active queue_priorities row." };
  return { id: row.id, code: String(row.code ?? "Q"), name: row.name ?? null, error: null };
}

async function adminPriorityForEntranceTicket(
  admin: SupabaseClient,
  entranceTicketId: string,
): Promise<{ id: number; code: string; name: string | null; error: string | null }> {
  const { data: t, error: tErr } = await admin.from("queue_tickets").select("priority_id").eq("id", entranceTicketId).maybeSingle();
  if (tErr) return { id: 0, code: "", name: null, error: tErr.message };
  const pid = (t as { priority_id?: number | null } | null)?.priority_id;
  if (pid == null || !Number.isFinite(Number(pid))) {
    return adminDefaultPriorityId(admin);
  }
  const { data: p, error: pErr } = await admin
    .from("queue_priorities")
    .select("id, code, name")
    .eq("id", pid)
    .eq("is_active", true)
    .maybeSingle();
  if (pErr) return { id: 0, code: "", name: null, error: pErr.message };
  const row = p as { id?: number; code?: string; name?: string | null } | null;
  if (row?.id == null) {
    return adminDefaultPriorityId(admin);
  }
  return { id: row.id, code: String(row.code ?? "Q"), name: row.name ?? null, error: null };
}

/** First segment of destination `queue_display` (Regular vs Priority lane). Mirrors lifehub-queuing `issue_queue_ticket`. */
function receptionPriorityLaneLetter(priorityCode: string | null | undefined, priorityName: string | null | undefined): string {
  const c = (priorityCode ?? "").trim().toUpperCase();
  const n = (priorityName ?? "").trim().toUpperCase();
  if (c.startsWith("REG") || n.includes("REGULAR")) return "R";
  if (c.startsWith("PRI") || n.includes("PRIORITY")) return "P";
  const head = c.slice(0, 1);
  if (head && /[A-Z0-9]/i.test(head)) return head.toUpperCase();
  return "R";
}

/** Second segment: `queue_counters.prefix` (e.g. C1, L). */
function counterQueueDisplayPrefix(counter: QueueCounterRow): string {
  const raw = (counter.prefix ?? "").trim();
  if (raw) return raw.replace(/\s+/g, "").toUpperCase();
  const code = (counter.code ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const clinic = code.match(/^CLINIC(\d+)$/);
  if (clinic) return `C${clinic[1]}`;
  return code.slice(0, 6) || "Q";
}

/**
 * Resolves an open queue_sessions row for counter + date, or creates one.
 * Tries `session_date`; if the column is missing, falls back to any session row for the counter (last resort).
 */
async function adminGetOrCreateQueueSessionId(
  admin: SupabaseClient,
  counterId: number,
  ticketDate: string,
): Promise<{ sessionId: string | null; error: string | null }> {
  const { data: reuseTicket } = await admin
    .from("queue_tickets")
    .select("queue_session_id")
    .eq("counter_id", counterId)
    .eq("ticket_date", ticketDate)
    .not("queue_session_id", "is", null)
    .limit(1)
    .maybeSingle();

  const sidFromTicket = (reuseTicket as { queue_session_id?: string } | null)?.queue_session_id;
  if (sidFromTicket) return { sessionId: String(sidFromTicket), error: null };

  const sel = await admin
    .from("queue_sessions")
    .select("id")
    .eq("counter_id", counterId)
    .eq("session_date", ticketDate)
    .limit(1)
    .maybeSingle();

  if (!sel.error && sel.data) {
    const id = (sel.data as { id?: string }).id;
    if (id) return { sessionId: String(id), error: null };
  }

  const openedAt = new Date().toISOString();
  const sessionOpen = { status: "Open" as const, opened_at: openedAt };

  const ins = await admin
    .from("queue_sessions")
    .insert({ counter_id: counterId, session_date: ticketDate, ...sessionOpen })
    .select("id")
    .single();
  if (!ins.error && ins.data) {
    const id = (ins.data as { id?: string }).id;
    if (id) return { sessionId: String(id), error: null };
  }

  const ins2 = await admin.from("queue_sessions").insert({ counter_id: counterId, ...sessionOpen }).select("id").single();
  if (!ins2.error && ins2.data) {
    const id = (ins2.data as { id?: string }).id;
    if (id) return { sessionId: String(id), error: null };
  }

  return {
    sessionId: null,
    error:
      ins.error?.message ??
      ins2.error?.message ??
      sel.error?.message ??
      "Could not resolve or create queue_sessions for this counter. Check table columns (counter_id, session_date, status).",
  };
}

export type ReceptionDestinationTicketResult = {
  queueDisplay: string;
  queueTicketId: string;
  counterCode: string;
};

async function adminIssueDestinationQueueTicket(input: {
  counterCode: string;
  ticketDate: string;
  patient: { id: number; name: string; contact_no: string | null };
  encounterId: string;
  labRequestId: string | null;
  imagingRequestId?: string | null;
  includesLab?: boolean;
  includesImaging?: boolean;
  priorityId: number;
  priorityCode: string;
  priorityName: string | null;
  registrationType: "Walk-in" | "Online";
  reason: string | null;
  notesTail: string | null;
  /** Reuse consultation queue display (e.g. R-C1003) on LAB/IMAG counter tickets. */
  queueDisplayOverride?: string | null;
  /** When set, must match `counterCode` (avoids a second DB round-trip). */
  counterRowResolved?: QueueCounterRow | null;
}): Promise<{ result: ReceptionDestinationTicketResult | null; error: string | null }> {
  const admin = queueAdminClient();
  if (!admin) return { result: null, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };

  const pre = input.counterRowResolved;
  const wantCode = input.counterCode.trim().toUpperCase();
  const usePre =
    pre &&
    pre.code.trim().toUpperCase() === wantCode &&
    parseCounterId(pre) != null;

  const { row: counterRow, numericId: counterId, error: cErr } = usePre
    ? { row: pre, numericId: parseCounterId(pre), error: null as string | null }
    : await adminResolveCounterByCode(admin, input.counterCode);
  if (cErr || counterId == null || !counterRow) return { result: null, error: cErr ?? "Counter not found." };

  const { sessionId, error: sErr } = await adminGetOrCreateQueueSessionId(admin, counterId, input.ticketDate);
  if (sErr || !sessionId) return { result: null, error: sErr ?? "No queue session." };

  const { data: maxRow, error: maxErr } = await admin
    .from("queue_tickets")
    .select("queue_number")
    .eq("queue_session_id", sessionId)
    .order("queue_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxErr) return { result: null, error: maxErr.message };
  const lastNum = (maxRow as { queue_number?: number } | null)?.queue_number ?? 0;
  const queue_number = lastNum + 1;
  const lane = receptionPriorityLaneLetter(input.priorityCode, input.priorityName);
  const counterPrefix = counterQueueDisplayPrefix(counterRow);
  const override = (input.queueDisplayOverride ?? "").trim();
  const queue_display =
    override || `${lane}-${counterPrefix}${String(queue_number).padStart(3, "0")}`;

  const now = new Date().toISOString();
  const notes = input.notesTail?.trim() ? input.notesTail.trim() : null;
  const includesLab = input.includesLab ?? Boolean(String(input.labRequestId ?? "").trim());
  const includesImaging =
    input.includesImaging ?? Boolean(String(input.imagingRequestId ?? "").trim());
  const imagingRequestId = String(input.imagingRequestId ?? "").trim() || null;

  const { data: inserted, error: insErr } = await admin
    .from("queue_tickets")
    .insert({
      queue_session_id: sessionId,
      counter_id: counterId,
      priority_id: input.priorityId,
      queue_number,
      queue_display,
      ticket_date: input.ticketDate,
      status: "Waiting",
      registration_type: input.registrationType,
      patient_id: input.patient.id,
      patient_name: input.patient.name,
      contact_no: input.patient.contact_no,
      encounter_id: input.encounterId,
      lab_request_id: input.labRequestId,
      imaging_request_id: imagingRequestId,
      includes_lab: includesLab,
      includes_imaging: includesImaging,
      reason: input.reason,
      notes,
      issued_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (insErr) return { result: null, error: insErr.message };
  const id = (inserted as { id?: string } | null)?.id;
  if (!id) return { result: null, error: "Ticket insert returned no id." };

  return {
    result: {
      queueDisplay: queue_display,
      queueTicketId: id,
      counterCode: counterRow.code,
    },
    error: null,
  };
}

async function adminPickEntranceCounterRow(admin: SupabaseClient): Promise<QueueCounterRow | null> {
  const { data: counterData, error: counterErr } = await admin
    .from("queue_counters")
    .select("id, code, name, description, prefix, user_id")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (counterErr || !counterData?.length) return null;
  const allCounters = counterData as QueueCounterRow[];
  const { data: tAll, error: tAllErr } = await admin
    .from("queue_tickets")
    .select(QUEUE_TICKET_RECEPTION_SELECT)
    .in(
      "counter_id",
      allCounters.map((c) => c.id),
    )
    .eq("ticket_date", queueTicketTodayIsoDate())
    .in("status", ACTIVE_STATUSES)
    .order("issued_at", { ascending: true });
  if (tAllErr) return null;
  const allTodayTickets = (tAll ?? []) as QueueTicketRow[];
  const candidates = entranceCodeCandidates();
  let entrance: QueueCounterRow | null = pickEntranceByCodes(candidates, allCounters);
  if (!entrance) entrance = pickBusiestCounter(allTodayTickets, allCounters);
  if (!entrance) entrance = pickEntranceByNameHint(allCounters);
  return entrance;
}

async function adminLatestEntranceQueueTicketForEncounter(
  admin: SupabaseClient,
  encounterTransId: string,
  entranceCounterId: number,
  ticketDate: string,
): Promise<{ priority_id: number } | null> {
  const { data, error } = await admin
    .from("queue_tickets")
    .select("priority_id")
    .eq("encounter_id", encounterTransId)
    .eq("ticket_date", ticketDate)
    .eq("counter_id", entranceCounterId)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const pid = (data as { priority_id?: number | null }).priority_id;
  if (pid == null || !Number.isFinite(Number(pid))) return null;
  return { priority_id: Number(pid) };
}

async function adminResolveActiveQueuePriorityById(
  admin: SupabaseClient,
  priorityId: number,
): Promise<{ id: number; code: string; name: string | null; error: string | null }> {
  const { data: p, error: pErr } = await admin
    .from("queue_priorities")
    .select("id, code, name")
    .eq("id", priorityId)
    .eq("is_active", true)
    .maybeSingle();
  if (pErr) return { id: 0, code: "", name: null, error: pErr.message };
  const row = p as { id?: number; code?: string; name?: string | null } | null;
  if (row?.id == null) return { id: 0, code: "", name: null, error: "Invalid or inactive queue priority." };
  return { id: row.id, code: String(row.code ?? "Q"), name: row.name ?? null, error: null };
}

function isDiagnosticQueueCounterCode(code: string): boolean {
  const c = code.trim().toUpperCase();
  return c === labQueueCode() || c === imagingQueueCode();
}

/**
 * Consultation / doctor queue number for this visit (e.g. R-C1003 from reception).
 * Used to reuse the same display on lab/imaging tickets instead of issuing R-L… / R-I….
 */
async function adminGetEncounterConsultationQueueDisplay(
  admin: SupabaseClient,
  encounterTransId: string,
): Promise<string | null> {
  const tid = encounterTransId.trim();
  if (!tid) return null;

  const { data: enc, error: encErr } = await admin.from("encounters").select("queue_no").eq("trans_id", tid).maybeSingle();
  if (encErr) return null;
  const fromEncounter = ((enc as { queue_no?: string | null } | null)?.queue_no ?? "").trim();
  if (fromEncounter) return fromEncounter;

  const ticketDate = queueTicketTodayIsoDate();
  const entranceCodes = new Set(entranceCodeCandidates());

  const { data: tickets, error: tErr } = await admin
    .from("queue_tickets")
    .select("queue_display, counter_id")
    .eq("encounter_id", tid)
    .eq("ticket_date", ticketDate)
    .order("issued_at", { ascending: false });
  if (tErr || !tickets?.length) return null;

  for (const row of tickets) {
    const qd = ((row as { queue_display?: string | null }).queue_display ?? "").trim();
    if (!qd) continue;
    const counterId = (row as { counter_id?: string | number }).counter_id;
    if (counterId == null) continue;
    const { data: cnt } = await admin.from("queue_counters").select("code").eq("id", counterId).maybeSingle();
    const code = String((cnt as { code?: string } | null)?.code ?? "").trim().toUpperCase();
    if (!code || isDiagnosticQueueCounterCode(code) || entranceCodes.has(code)) continue;
    return qd;
  }

  return null;
}

async function adminPatchEncounterQueueNoIfEmpty(
  admin: SupabaseClient,
  encounterTransId: string,
  queueDisplay: string,
): Promise<{ error: string | null }> {
  const { data: enc, error: e0 } = await admin.from("encounters").select("queue_no").eq("trans_id", encounterTransId).maybeSingle();
  if (e0) return { error: e0.message };
  const existing = ((enc as { queue_no?: string | null } | null)?.queue_no ?? "").trim();
  if (existing) return { error: null };
  const now = new Date().toISOString();
  const { error } = await admin
    .from("encounters")
    .update({ queue_no: queueDisplay, updated_at: now })
    .eq("trans_id", encounterTransId);
  return { error: error?.message ?? null };
}

async function adminFindExistingActiveDiagnosticTicket(
  admin: SupabaseClient,
  args: {
    encounterTransId: string;
    ticketDate: string;
    labRequestId?: string | null;
    imagingRequestId?: string | null;
  },
): Promise<{ queueTicketId: string; queueDisplay: string; counterCode: string } | null> {
  const encounterTransId = args.encounterTransId.trim();
  if (!encounterTransId) return null;

  const { ids: diagnosticCounterIds, error: cntErr } = await adminLoadDiagnosticCounterIds(admin);
  if (cntErr || diagnosticCounterIds.size === 0) return null;

  const { data: rows, error } = await admin
    .from("queue_tickets")
    .select("id, queue_display, counter_id, lab_request_id, imaging_request_id")
    .eq("encounter_id", encounterTransId)
    .eq("ticket_date", args.ticketDate)
    .in("status", ACTIVE_STATUSES)
    .order("issued_at", { ascending: false });

  if (error || !rows?.length) return null;

  const labId = String(args.labRequestId ?? "").trim();
  const imgId = String(args.imagingRequestId ?? "").trim();

  type PickRow = {
    id?: string;
    queue_display?: string | null;
    counter_id?: string | number | null;
    lab_request_id?: string | null;
    imaging_request_id?: string | null;
  };

  const diagnosticRows = (rows as PickRow[]).filter((r) => {
    const n = Number(r.counter_id);
    return Number.isFinite(n) && diagnosticCounterIds.has(n);
  });
  if (diagnosticRows.length === 0) return null;

  let pick =
    (labId ? diagnosticRows.find((r) => String(r.lab_request_id ?? "").trim() === labId) : null) ??
    (imgId ? diagnosticRows.find((r) => String(r.imaging_request_id ?? "").trim() === imgId) : null) ??
    diagnosticRows[0];

  const id = String(pick?.id ?? "").trim();
  const qd = String(pick?.queue_display ?? "").trim();
  if (!id || !qd) return null;

  const counterId = pick?.counter_id;
  const { data: cnt } = await admin.from("queue_counters").select("code").eq("id", counterId).maybeSingle();
  const code = String((cnt as { code?: string } | null)?.code ?? labQueueCode()).trim().toUpperCase();
  return { queueTicketId: id, queueDisplay: qd, counterCode: code };
}

async function adminPatchDiagnosticTicketFlags(
  admin: SupabaseClient,
  ticketId: string,
  patch: {
    includesLab?: boolean;
    includesImaging?: boolean;
    imagingRequestId?: string | null;
    labRequestId?: string | null;
    queueDisplay?: string | null;
  },
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.includesLab != null) payload.includes_lab = patch.includesLab;
  if (patch.includesImaging != null) payload.includes_imaging = patch.includesImaging;
  if (patch.imagingRequestId !== undefined) {
    payload.imaging_request_id = patch.imagingRequestId ? patch.imagingRequestId.trim() : null;
  }
  if (patch.labRequestId !== undefined) {
    payload.lab_request_id = patch.labRequestId ? patch.labRequestId.trim() : null;
  }
  if (patch.queueDisplay !== undefined) {
    const qd = (patch.queueDisplay ?? "").trim();
    if (qd) payload.queue_display = qd;
  }
  const { error } = await admin.from("queue_tickets").update(payload).eq("id", ticketId);
  return { error: error?.message ?? null };
}

export type DiagnosticQueueIssueInput = {
  encounterTransId: string;
  patient: { id: number; name: string; contact_no: string | null };
  labRequestId?: string | null;
  imagingRequestId?: string | null;
  includesLab: boolean;
  includesImaging: boolean;
  priorityId: number;
  priorityCode: string;
  priorityName: string | null;
  registrationType?: "Walk-in" | "Online";
  reason?: string | null;
  notesTail?: string | null;
};

/** One queue number per visit; LAB counter when lab included, else IMAG. */
export async function adminIssueDiagnosticQueueTicket(
  input: DiagnosticQueueIssueInput,
): Promise<{ error: string | null; result?: ReceptionDestinationTicketResult & { reused: boolean } }> {
  const admin = queueAdminClient();
  if (!admin) return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };

  if (!input.includesLab && !input.includesImaging) {
    return { error: "At least one of lab or imaging must be included." };
  }

  const encounterTransId = input.encounterTransId.trim();
  const ticketDate = queueTicketTodayIsoDate();
  const labRequestId = String(input.labRequestId ?? "").trim() || null;
  const imagingRequestId = String(input.imagingRequestId ?? "").trim() || null;
  const consultationQueueDisplay = await adminGetEncounterConsultationQueueDisplay(admin, encounterTransId);

  const counterCode = input.includesLab ? labQueueCode() : imagingQueueCode();
  const { row: counterRow, numericId: counterId, error: cErr } = await adminResolveCounterByCode(admin, counterCode);
  if (cErr || counterId == null || !counterRow) {
    return { error: cErr ?? `Queue counter “${counterCode}” not found.` };
  }

  const existing = await adminFindExistingActiveDiagnosticTicket(admin, {
    encounterTransId,
    ticketDate,
    labRequestId,
    imagingRequestId,
  });

  if (existing) {
    const displayForVisit = consultationQueueDisplay ?? existing.queueDisplay;
    const needsImagingPatch = Boolean(input.includesImaging && imagingRequestId);
    const needsDisplayPatch = Boolean(
      consultationQueueDisplay && consultationQueueDisplay !== existing.queueDisplay,
    );
    if (needsImagingPatch || needsDisplayPatch) {
      const patchErr = await adminPatchDiagnosticTicketFlags(admin, existing.queueTicketId, {
        ...(needsImagingPatch
          ? {
              includesImaging: true,
              includesLab: input.includesLab,
              imagingRequestId,
              labRequestId,
            }
          : {}),
        ...(needsDisplayPatch ? { queueDisplay: consultationQueueDisplay } : {}),
      });
      if (patchErr.error) return { error: patchErr.error };
    }
    const qnErr = await adminPatchEncounterQueueNoIfEmpty(admin, encounterTransId, displayForVisit);
    if (qnErr.error) return { error: qnErr.error };
    return {
      error: null,
      result: {
        queueDisplay: displayForVisit,
        queueTicketId: existing.queueTicketId,
        counterCode: existing.counterCode,
        reused: true,
      },
    };
  }

  const reason =
    input.reason ??
    (input.includesLab && input.includesImaging
      ? "Laboratory & Imaging"
      : input.includesLab
        ? "Laboratory"
        : "Imaging");

  const issued = await adminIssueDestinationQueueTicket({
    counterCode,
    ticketDate,
    patient: input.patient,
    encounterId: encounterTransId,
    labRequestId,
    imagingRequestId,
    includesLab: input.includesLab,
    includesImaging: input.includesImaging,
    priorityId: input.priorityId,
    priorityCode: input.priorityCode,
    priorityName: input.priorityName,
    registrationType: input.registrationType ?? "Walk-in",
    reason,
    notesTail: input.notesTail ?? null,
    queueDisplayOverride: consultationQueueDisplay,
    counterRowResolved: counterRow,
  });

  if (issued.error || !issued.result) {
    return { error: issued.error ?? "Could not issue queue ticket." };
  }

  const qnErr = await adminPatchEncounterQueueNoIfEmpty(
    admin,
    encounterTransId,
    consultationQueueDisplay ?? issued.result.queueDisplay,
  );
  if (qnErr.error) return { error: qnErr.error };

  return { error: null, result: { ...issued.result, reused: false } };
}

export type CashierLabQueueTicketResult = ReceptionDestinationTicketResult & { reused: boolean };

/**
 * After cashier payment: one diagnostic queue ticket (lab and/or imaging).
 */
export async function adminIssueCashierLaboratoryQueueTicket(input: {
  encounterTransId: string;
  patient: { id: number; name: string; contact_no: string | null };
  labRequestIds: string[];
  imagingRequestIds?: string[];
  /** Used when this encounter has no reception entrance ticket today to copy priority from. */
  cashierPriorityId: number | null;
}): Promise<{ error: string | null; result?: CashierLabQueueTicketResult }> {
  const admin = queueAdminClient();
  if (!admin) return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };

  const encounterTransId = input.encounterTransId.trim();
  const labUniq = [...new Set(input.labRequestIds.map((x) => String(x).trim()).filter(Boolean))].sort();
  let imgUniq = [...new Set((input.imagingRequestIds ?? []).map((x) => String(x).trim()).filter(Boolean))].sort();
  if (!encounterTransId || (labUniq.length === 0 && imgUniq.length === 0)) {
    return { error: "encounterTransId and at least one lab or imaging request id are required." };
  }

  if (labUniq.length > 0) {
    const { map: pkgByLab, error: pkgMapErr } = await fetchLabRequestPackageIdsByRequestIdMap(admin, labUniq);
    if (pkgMapErr) return { error: pkgMapErr };
    const packageIds = [
      ...new Set([...pkgByLab.values()].flat().filter((n) => Number.isFinite(n) && n > 0)),
    ];
    if (packageIds.length > 0) {
      const ensured = await ensureImagingRequestForLabPackages(admin, {
        encounterId: encounterTransId,
        patientId: input.patient.id,
        packageIds,
        remarks: "Laboratory package imaging (cashier queue)",
      });
      if (ensured.error) return { error: ensured.error };
      if (ensured.imagingRequestId) {
        imgUniq = [...new Set([...imgUniq, ensured.imagingRequestId])].sort();
      }
    }
  }

  if (labUniq.length === 0 && imgUniq.length === 0) {
    return { error: "encounterTransId and at least one lab or imaging request id are required." };
  }

  const ticketDate = queueTicketTodayIsoDate();
  const primaryLabRequestId = labUniq[0] ?? null;
  const primaryImagingRequestId = imgUniq[0] ?? null;

  let priorityId = 0;
  let priorityCode = "";
  let priorityName: string | null = null;

  const entrance = await adminPickEntranceCounterRow(admin);
  const entranceNum = entrance ? parseCounterId(entrance) : null;
  if (entrance && entranceNum != null) {
    const entT = await adminLatestEntranceQueueTicketForEncounter(admin, encounterTransId, entranceNum, ticketDate);
    if (entT) {
      const pr = await adminResolveActiveQueuePriorityById(admin, entT.priority_id);
      if (!pr.error) {
        priorityId = pr.id;
        priorityCode = pr.code;
        priorityName = pr.name;
      }
    }
  }

  if (priorityId <= 0) {
    const pick = input.cashierPriorityId;
    if (pick != null && Number.isFinite(pick)) {
      const pr = await adminResolveActiveQueuePriorityById(admin, pick);
      if (pr.error) return { error: pr.error };
      priorityId = pr.id;
      priorityCode = pr.code;
      priorityName = pr.name;
    } else {
      const def = await adminDefaultPriorityId(admin);
      if (def.error || def.id <= 0) {
        return {
          error:
            def.error ??
            "Could not resolve queue priority. Configure active rows in queue_priorities, link a reception entrance ticket for this visit, or pass cashierPriorityId.",
        };
      }
      priorityId = def.id;
      priorityCode = def.code;
      priorityName = def.name;
    }
  }

  const issued = await adminIssueDiagnosticQueueTicket({
    encounterTransId,
    patient: input.patient,
    labRequestId: primaryLabRequestId,
    imagingRequestId: primaryImagingRequestId,
    includesLab: labUniq.length > 0,
    includesImaging: imgUniq.length > 0,
    priorityId,
    priorityCode,
    priorityName,
    registrationType: "Walk-in",
    reason:
      labUniq.length > 0 && imgUniq.length > 0
        ? "Laboratory & Imaging"
        : labUniq.length > 0
          ? labUniq.length > 1
            ? "Laboratory (multiple orders)"
            : "Laboratory"
          : "Imaging",
    notesTail: "Cashier",
  });

  if (issued.error || !issued.result) {
    return { error: issued.error ?? "Could not issue diagnostic queue ticket." };
  }

  if (labUniq.length > 0 && !issued.result.reused) {
    void insertLabQueueNewRequestNotifications(admin, {
      queueDisplay: issued.result.queueDisplay,
      patientName: input.patient.name,
      queueTicketId: issued.result.queueTicketId,
      labRequestId: primaryLabRequestId,
    });
  }

  return {
    error: null,
    result: {
      queueDisplay: issued.result.queueDisplay,
      queueTicketId: issued.result.queueTicketId,
      counterCode: issued.result.counterCode,
      reused: issued.result.reused,
    },
  };
}

/** After cashier settles a paid-order amendment, put the ticket back in the lab/imaging queue. */
const REACTIVATE_QUEUE_STATUSES: QueueTicketStatus[] = [
  "Waiting",
  "Called",
  "Collected",
  "Serving",
  "Completed",
];

function clearSpecimenCollectedTagFromNotes(notes: string | null | undefined): string {
  const lines = String(notes ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => !/^\[Specimen\]/i.test(l.trim()));
  return lines.join("\n").trim();
}

/**
 * After a paid order amendment is settled, put the patient back on the lab/imaging queue
 * with the same queue number when possible.
 */
export async function adminReactivateDiagnosticQueueAfterAmendment(input: {
  encounterTransId: string;
  patient: { id: number; name: string; contact_no: string | null };
  labRequestId?: string | null;
  imagingRequestId?: string | null;
  includesLab: boolean;
  includesImaging: boolean;
  cashierPriorityId?: number | null;
}): Promise<{ error: string | null; queueDisplay?: string }> {
  const admin = queueAdminClient();
  if (!admin) return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };

  const encounterTransId = input.encounterTransId.trim();
  const labRequestId = String(input.labRequestId ?? "").trim() || null;
  const imagingRequestId = String(input.imagingRequestId ?? "").trim() || null;
  if (!encounterTransId) return { error: "encounterTransId is required." };

  const ticketDate = queueTicketTodayIsoDate();

  const { data: ticket, error: tErr } = await admin
    .from("queue_tickets")
    .select("id, status, notes, queue_display, includes_lab, includes_imaging, lab_request_id, imaging_request_id")
    .eq("encounter_id", encounterTransId)
    .eq("ticket_date", ticketDate)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tErr) return { error: tErr.message };

  if (ticket) {
    const row = ticket as {
      id: string;
      status: QueueTicketStatus;
      notes: string | null;
      queue_display: string;
      includes_lab?: boolean | null;
      includes_imaging?: boolean | null;
      lab_request_id?: string | null;
      imaging_request_id?: string | null;
    };
    if (REACTIVATE_QUEUE_STATUSES.includes(row.status)) {
      const consultationDisplay = await adminGetEncounterConsultationQueueDisplay(admin, encounterTransId);
      const displayForVisit = consultationDisplay ?? row.queue_display;
      const cleared = clearSpecimenCollectedTagFromNotes(row.notes);
      let notes = applyActiveDeptToNotes(cleared, null);
      if (input.includesLab) {
        notes = applyPartialLabReleaseToNotes(notes, false);
      }
      const patchLabReqId = labRequestId || String(row.lab_request_id ?? "").trim() || null;
      const patchImgReqId = imagingRequestId || String(row.imaging_request_id ?? "").trim() || null;

      let nextStatus: QueueTicketStatus = "Waiting";
      if (patchLabReqId) {
        const labState = await computeLabRequestQueueCollectionState(admin, patchLabReqId);
        if (!labState.error) {
          if (labState.anyCollected && !labState.allCollected) {
            nextStatus = "Called";
            notes = applyActiveDeptToNotes(notes, "LAB");
          } else if (labState.allCollected) {
            nextStatus = labState.allHasResults ? "Completed" : "Collected";
          } else if (
            row.status === "Called" ||
            row.status === "Collected" ||
            row.status === "Serving"
          ) {
            nextStatus = row.status;
            notes = applyActiveDeptToNotes(notes, input.includesLab ? "LAB" : null);
          }
        }
      }

      const { error: upErr } = await admin
        .from("queue_tickets")
        .update({
          status: nextStatus,
          queue_display: displayForVisit,
          notes,
          // Keep both flags when visit has lab + imaging; each amendment settle only touches one modality.
          includes_lab: input.includesLab || row.includes_lab === true,
          includes_imaging: input.includesImaging || row.includes_imaging === true,
          ...(patchLabReqId ? { lab_request_id: patchLabReqId } : {}),
          ...(patchImgReqId ? { imaging_request_id: patchImgReqId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (upErr) return { error: upErr.message };
      if (consultationDisplay) {
        const qnErr = await adminPatchEncounterQueueNoIfEmpty(admin, encounterTransId, consultationDisplay);
        if (qnErr.error) return { error: qnErr.error };
      }
      return { error: null, queueDisplay: displayForVisit };
    }
  }

  const issued = await adminIssueCashierLaboratoryQueueTicket({
    encounterTransId,
    patient: input.patient,
    labRequestIds: labRequestId ? [labRequestId] : [],
    imagingRequestIds: imagingRequestId ? [imagingRequestId] : [],
    cashierPriorityId: input.cashierPriorityId ?? null,
  });
  if (issued.error) return { error: issued.error };
  return { error: null, queueDisplay: issued.result?.queueDisplay };
}

export async function adminGetQueueTicketReceiptPayload(ticketId: string): Promise<{
  error: string | null;
  patientName?: string;
  queueDisplay?: string;
  transId?: string;
  destinationLabel?: string;
}> {
  const admin = queueAdminClient();
  if (!admin) return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  const tid = ticketId.trim();
  if (!tid) return { error: "ticketId is required." };

  const { data: t, error: tErr } = await admin
    .from("queue_tickets")
    .select("queue_display, patient_name, encounter_id, counter_id")
    .eq("id", tid)
    .maybeSingle();
  if (tErr) return { error: tErr.message };
  if (!t) return { error: "Queue ticket not found." };

  const row = t as {
    queue_display?: string | null;
    patient_name?: string | null;
    encounter_id?: string | null;
    counter_id?: string | number;
  };
  const counterId = row.counter_id;
  let destinationLabel = "Laboratory";
  if (counterId != null) {
    const { data: c } = await admin.from("queue_counters").select("name, code").eq("id", counterId).maybeSingle();
    const cr = c as { name?: string | null; code?: string | null } | null;
    if (cr?.name?.trim()) destinationLabel = cr.name.trim();
    else if (cr?.code?.trim()) destinationLabel = cr.code.trim();
  }

  const transId = (row.encounter_id ?? "").trim();
  if (!transId) return { error: "Ticket is not linked to a visit." };

  const ticketDisplay = (row.queue_display ?? "").trim();
  const consultationDisplay = (await adminGetEncounterConsultationQueueDisplay(admin, transId)) ?? "";
  const queueDisplay = consultationDisplay || ticketDisplay || "—";

  return {
    error: null,
    patientName: (row.patient_name ?? "").trim() || "Patient",
    queueDisplay,
    transId,
    destinationLabel,
  };
}

export type ReceptionConsultationCheckinResult = {
  transId: string;
  destinationQueueDisplay: string;
  destinationCounterCode: string;
};

export type ReceptionPrepareLabResult = {
  transId: string;
  labRequestId: string | null;
  imagingRequestId: string | null;
  includesLab: boolean;
  includesImaging: boolean;
};

export type ReceptionFinalizeLabResult = {
  transId: string;
  destinationQueueDisplay: string;
  destinationCounterCode: string;
};

function buildTriageNotesBlock(route: ReceptionTriageRoute, extra?: string | null): string {
  const now = new Date().toISOString();
  const routeLabel = route === "consultation" ? "Doctor consultation" : "Laboratory only";
  const triageBlock = [extra?.trim() || null, "---", `Reception route: ${routeLabel}`, `Recorded: ${now}`]
    .filter((line) => line != null && line !== "")
    .join("\n");
  return triageBlock;
}

async function adminUpsertVitalSigns(transId: string, vitals: ReceptionVitalsInput): Promise<{ error: string | null }> {
  const admin = queueAdminClient();
  if (!admin) return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  const now = new Date().toISOString();
  const { systolic, diastolic } = parseBp(vitals.bp);
  const payload = {
    trans_id: transId,
    bp_systolic: systolic,
    bp_diastolic: diastolic,
    heart_rate: parseNonNegativeInt(vitals.hr),
    respiratory_rate: parseNonNegativeInt(vitals.rr),
    temperature: parseDecimal(vitals.temp),
    o2_saturation: parseDecimal(vitals.o2),
    pain_scale: null as number | null,
    weight_kg: parseDecimal(vitals.weight_kg),
    height_cm: parseDecimal(vitals.height_cm),
    bmi: parseDecimal(vitals.bmi),
    recorded_at: now,
  };

  const { data: existing, error: lookErr } = await admin
    .from("vital_signs")
    .select("id")
    .eq("trans_id", transId)
    .limit(1)
    .maybeSingle();
  if (lookErr) return { error: lookErr.message };

  const existingId = (existing as { id?: string } | null)?.id ?? null;
  if (existingId) {
    // Match `persistVitalSigns` in vitalSigns.ts — this table may not have created_at/updated_at.
    const { error } = await admin.from("vital_signs").update(payload).eq("id", existingId);
    return { error: error?.message ?? null };
  }

  const { error } = await admin.from("vital_signs").insert(payload);
  return { error: error?.message ?? null };
}

async function adminEnsureEncounterForEntranceTicket(
  admin: SupabaseClient,
  ticketId: string,
  patientId: number,
  nowIso: string,
): Promise<{ encounterId: string | null; error: string | null }> {
  const { data: tRow, error: tErr } = await admin.from("queue_tickets").select("encounter_id").eq("id", ticketId).maybeSingle();
  if (tErr) return { encounterId: null, error: tErr.message };
  let encounterId = ((tRow as { encounter_id?: string | null } | null)?.encounter_id ?? null) as string | null;
  if (!encounterId) {
    const created = await adminCreateEncounterForPatient(patientId);
    if (created.error || !created.transId) return { encounterId: null, error: created.error ?? "Failed to create encounter." };
    encounterId = created.transId;
    const { error: updErr } = await admin.from("queue_tickets").update({ encounter_id: encounterId, updated_at: nowIso }).eq("id", ticketId);
    if (updErr) return { encounterId: null, error: updErr.message };
  }
  return { encounterId, error: null };
}

/** Consultation: encounter + vitals + CC, destination doctor queue ticket, encounter.queue_no, entrance ticket completed. */
export async function adminCompleteConsultationCheckin(
  ticketId: string,
  input: {
    complaint: string | null;
    triageNotes: string | null;
    priorNotes: string | null;
    patient: { id: number; name: string; contact_no: string | null };
    vitals: ReceptionVitalsInput | null;
    doctorCounterCode: string;
  },
): Promise<{ error: string | null; result?: ReceptionConsultationCheckinResult }> {
  const admin = queueAdminClient();
  if (!admin) return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };

  const docCode = input.doctorCounterCode.trim();
  if (!docCode) return { error: "Select a doctor counter (doctorCounterCode)." };

  const now = new Date().toISOString();
  const ticketDate = queueTicketTodayIsoDate();
  const triageBlock = buildTriageNotesBlock("consultation", input.triageNotes);
  const prior = input.priorNotes?.trim();
  const notes = prior ? `${prior}\n\n${triageBlock}` : triageBlock;

  const { encounterId, error: encErr } = await adminEnsureEncounterForEntranceTicket(admin, ticketId, input.patient.id, now);
  if (encErr || !encounterId) return { error: encErr ?? "No encounter." };

  if (input.vitals) {
    const { error: vitErr } = await adminUpsertVitalSigns(encounterId, input.vitals);
    if (vitErr) return { error: vitErr };
  }

  const { row: doctorCounter, error: docCntErr } = await adminResolveCounterByCode(admin, docCode);
  if (docCntErr || !doctorCounter) return { error: docCntErr ?? "Doctor queue counter not found." };
  const physicianUserId = parseQueueCounterPhysicianUserId(doctorCounter);

  const chief = input.complaint?.trim() || null;
  const encounterPatch: Record<string, unknown> = { chief_complaint: chief };
  if (physicianUserId != null) {
    encounterPatch.physician_id = physicianUserId;
  }
  const { error: ccErr } = await admin.from("encounters").update(encounterPatch).eq("trans_id", encounterId);
  if (ccErr) return { error: ccErr.message };

  const { id: priorityId, code: priorityCode, name: priorityName, error: pErr } = await adminPriorityForEntranceTicket(admin, ticketId);
  if (pErr) return { error: pErr };

  const issued = await adminIssueDestinationQueueTicket({
    counterCode: docCode,
    ticketDate,
    patient: input.patient,
    encounterId,
    labRequestId: null,
    priorityId,
    priorityCode,
    priorityName,
    registrationType: "Walk-in",
    reason: chief,
    notesTail: `Reception → ${docCode}`,
    counterRowResolved: doctorCounter,
  });
  if (issued.error || !issued.result) return { error: issued.error ?? "Could not issue doctor queue ticket." };

  const { error: qnErr } = await admin.from("encounters").update({ queue_no: issued.result.queueDisplay, updated_at: now }).eq("trans_id", encounterId);
  if (qnErr) return { error: qnErr.message };

  const { error: upErr } = await admin
    .from("queue_tickets")
    .update({
      status: "Completed",
      completed_at: now,
      updated_at: now,
      serving_at: now,
      reason: chief,
      patient_id: input.patient.id,
      patient_name: input.patient.name,
      contact_no: input.patient.contact_no,
      encounter_id: encounterId,
      notes,
    })
    .eq("id", ticketId);
  if (upErr) return { error: upErr.message };

  return {
    error: null,
    result: {
      transId: encounterId,
      destinationQueueDisplay: issued.result.queueDisplay,
      destinationCounterCode: issued.result.counterCode,
    },
  };
}

/** Lab / imaging intake phase A: encounter + requests; entrance stays Serving until payment. */
export async function adminPrepareLaboratoryCheckin(
  ticketId: string,
  input: {
    triageNotes: string | null;
    priorNotes: string | null;
    patient: { id: number; name: string; contact_no: string | null };
    labTestIds: string[];
    packageIds?: number[] | null;
    imagingSelection?: Record<string, ImagingLineSelection>;
  },
): Promise<{ error: string | null; result?: ReceptionPrepareLabResult }> {
  const admin = queueAdminClient();
  if (!admin) return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };

  const ids = [...new Set(input.labTestIds.map((x) => x.trim()).filter(Boolean))];
  const packageIds = normalizeLabRequestPackageIdList(input.packageIds ?? []);
  const hasImaging = imagingSelectionHasChecked(input.imagingSelection ?? {});
  if (ids.length === 0 && !hasImaging && packageIds.length === 0) {
    return { error: "Select at least one laboratory test, package, or imaging study." };
  }

  const now = new Date().toISOString();
  const triageBlock = buildTriageNotesBlock("laboratory", input.triageNotes);
  const prior = input.priorNotes?.trim();
  const pendingLine =
    "Status: pending payment — queue number reserved; pay at cashier before laboratory/imaging queue display.";
  const notes = prior ? `${prior}\n\n${triageBlock}\n${pendingLine}` : `${triageBlock}\n${pendingLine}`;

  const { encounterId, error: encErr } = await adminEnsureEncounterForEntranceTicket(admin, ticketId, input.patient.id, now);
  if (encErr || !encounterId) return { error: encErr ?? "No encounter." };

  let labRequestId: string | null = null;
  let imagingRequestId: string | null = null;
  if (ids.length > 0 || packageIds.length > 0) {
    const lab = await adminCreateLabRequestWithItems({
      encounterId,
      patientId: input.patient.id,
      referringPhysician: null,
      physicianId: null,
      priority: "Routine",
      clinicalDiagnosis: null,
      remarks: "Reception diagnostic intake (pending payment)",
      labTestIds: ids,
      packageIds,
    });
    if (lab.error || !lab.labRequestId) return { error: lab.error ?? "Could not create lab request." };
    labRequestId = lab.labRequestId;
    imagingRequestId = lab.imagingRequestId ?? null;
  }

  if (hasImaging) {
    const { rows: catalog, error: catErr } = await fetchActiveImagingCatalogForDb(admin);
    if (catErr) return { error: catErr };
    const validated = await validateEncounterImagingCreate(
      admin,
      encounterId,
      input.imagingSelection ?? {},
      catalog,
    );
    if (validated.error && !imagingRequestId) {
      return { error: validated.error };
    }
    const hasRemaining = Object.values(validated.selection).some((r) => r?.checked);
    if (hasRemaining) {
      const img = await adminCreateImagingRequestWithItems(admin, {
        encounterId,
        patientId: input.patient.id,
        priority: "Routine",
        remarks: "Reception imaging intake (pending payment)",
        selection: validated.selection,
        packageIds,
        catalog,
      });
      if (img.error || !img.imagingRequestId) {
        return { error: img.error ?? "Could not create imaging request." };
      }
      imagingRequestId = img.imagingRequestId ?? imagingRequestId;
    }
  }

  const { error: upErr } = await admin
    .from("queue_tickets")
    .update({
      status: "Serving",
      serving_at: now,
      updated_at: now,
      patient_id: input.patient.id,
      patient_name: input.patient.name,
      contact_no: input.patient.contact_no,
      encounter_id: encounterId,
      notes,
    })
    .eq("id", ticketId);
  if (upErr) return { error: upErr.message };

  return {
    error: null,
    result: {
      transId: encounterId,
      labRequestId,
      imagingRequestId,
      includesLab: Boolean(labRequestId),
      includesImaging: Boolean(imagingRequestId),
    },
  };
}

export type ReceptionCompleteLabIntakeResult = {
  transId: string;
  labQueueDisplay: string;
  labQueueTicketId: string;
};

export { adminLabRequestIdsWithLabSales } from "@/lib/diagnosticQueueServer";

/**
 * Laboratory queue UI: hide LAB tickets for visit-linked lab orders until `lab_sales` exists.
 */
export async function adminFilterLabQueueTicketsForLabDisplay<
  T extends {
    lab_request_id?: string | null;
    includes_lab?: boolean | null;
    encounter_id?: string | null;
  },
>(admin: SupabaseClient, rows: T[]): Promise<{ rows: T[]; error: string | null }> {
  const out: T[] = [];
  for (const row of rows) {
    const includesLab = row.includes_lab === true || Boolean(String(row.lab_request_id ?? "").trim());
    if (!includesLab) continue;
    const labReqId = String(row.lab_request_id ?? "").trim();
    if (!labReqId) {
      out.push(row);
      continue;
    }
    const { ids: paidIds, error } = await adminLabRequestIdsWithLabSales(admin, [labReqId]);
    if (error) return { rows: [], error };
    if (paidIds.has(labReqId)) out.push(row);
  }
  return { rows: out, error: null };
}

/**
 * After `prepare_lab_checkin`: reserve one diagnostic queue number (hidden until paid).
 */
export async function adminCompleteEntranceAfterLabIntake(input: {
  entranceTicketId: string;
  transId: string;
  labRequestId?: string | null;
  imagingRequestId?: string | null;
  includesLab?: boolean;
  includesImaging?: boolean;
  patient: { id: number; name: string; contact_no: string | null };
}): Promise<{ error: string | null; result?: ReceptionCompleteLabIntakeResult }> {
  const admin = queueAdminClient();
  if (!admin) return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };

  const entranceTicketId = input.entranceTicketId.trim();
  const transId = input.transId.trim();
  const labRequestId = String(input.labRequestId ?? "").trim() || null;
  const imagingRequestId = String(input.imagingRequestId ?? "").trim() || null;
  const includesLab = input.includesLab ?? Boolean(labRequestId);
  const includesImaging = input.includesImaging ?? Boolean(imagingRequestId);

  if (!entranceTicketId || !transId || (!includesLab && !includesImaging)) {
    return { error: "entranceTicketId, transId, and at least one request id are required." };
  }

  if (includesLab && labRequestId) {
    const { data: sale, error: saleErr } = await admin
      .from(LAB_SALES_TABLE)
      .select("id")
      .eq("lab_request_id", labRequestId)
      .limit(1)
      .maybeSingle();
    if (saleErr) return { error: saleErr.message };
    if (sale) return { error: "This order is already paid. Use cashier to print the queue slip if needed." };
  }

  const { data: entT, error: entTErr } = await admin
    .from("queue_tickets")
    .select("id, encounter_id, status, notes, patient_id, patient_name, contact_no")
    .eq("id", entranceTicketId)
    .maybeSingle();
  if (entTErr) return { error: entTErr.message };
  if (!entT) return { error: "Entrance queue ticket not found." };

  const entRow = entT as {
    encounter_id?: string | null;
    status?: string | null;
    notes?: string | null;
    patient_id?: number | null;
    patient_name?: string | null;
    contact_no?: string | null;
  };
  if ((entRow.encounter_id ?? "").trim() !== transId) {
    return { error: "Entrance ticket is not linked to this visit (trans_id)." };
  }

  const patient = {
    id: input.patient.id,
    name: input.patient.name.trim() || (entRow.patient_name ?? "").trim() || "Patient",
    contact_no: input.patient.contact_no ?? entRow.contact_no ?? null,
  };

  const { id: priorityId, code: priorityCode, name: priorityName, error: pErr } = await adminPriorityForEntranceTicket(
    admin,
    entranceTicketId,
  );
  if (pErr) return { error: pErr };

  const reqNote = [
    labRequestId ? `Lab request ${labRequestId}` : null,
    imagingRequestId ? `Imaging request ${imagingRequestId}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const issued = await adminIssueDiagnosticQueueTicket({
    encounterTransId: transId,
    patient,
    labRequestId,
    imagingRequestId,
    includesLab,
    includesImaging,
    priorityId,
    priorityCode,
    priorityName,
    registrationType: "Walk-in",
    reason: includesLab && includesImaging ? "Laboratory & Imaging" : includesLab ? "Laboratory" : "Imaging",
    notesTail: "Reception diagnostic intake · reserved until cashier payment",
  });

  if (issued.error || !issued.result) {
    return { error: issued.error ?? "Could not reserve queue number." };
  }

  const labQueueDisplay = issued.result.queueDisplay;
  const labQueueTicketId = issued.result.queueTicketId;
  const now = new Date().toISOString();

  const qnErr = await adminPatchEncounterQueueNoIfEmpty(admin, transId, labQueueDisplay);
  if (qnErr.error) return { error: qnErr.error };

  const status = (entRow.status ?? "").trim();
  if (status !== "Completed") {
    const prevNotes = (entRow.notes ?? "").trim();
    const dept =
      includesLab && includesImaging
        ? "laboratory and imaging"
        : includesLab
          ? "laboratory"
          : "imaging";
    const tail = `---\nAwaiting cashier payment · Queue ${labQueueDisplay} (hidden on ${dept} screen until paid).\n${reqNote}\nRecorded: ${now}`;
    const notes = prevNotes ? `${prevNotes}\n\n${tail}` : tail;

    const { error: upErr } = await admin
      .from("queue_tickets")
      .update({ status: "Completed", completed_at: now, updated_at: now, notes })
      .eq("id", entranceTicketId);
    if (upErr) return { error: upErr.message };
  }

  return { error: null, result: { transId, labQueueDisplay, labQueueTicketId } };
}

/** After payment: ensure diagnostic queue ticket, encounter.queue_no, complete entrance. */
export async function adminFinalizeLaboratoryCheckin(input: {
  entranceTicketId: string;
  transId: string;
  labRequestId?: string | null;
  imagingRequestId?: string | null;
  includesLab?: boolean;
  includesImaging?: boolean;
  patient: { id: number; name: string; contact_no: string | null };
}): Promise<{ error: string | null; result?: ReceptionFinalizeLabResult }> {
  const admin = queueAdminClient();
  if (!admin) return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };

  const transId = input.transId.trim();
  const labRequestId = String(input.labRequestId ?? "").trim() || null;
  const imagingRequestId = String(input.imagingRequestId ?? "").trim() || null;
  const includesLab = input.includesLab ?? Boolean(labRequestId);
  const includesImaging = input.includesImaging ?? Boolean(imagingRequestId);

  if (!transId || (!includesLab && !includesImaging)) {
    return { error: "transId and at least one request id are required." };
  }

  if (includesLab && labRequestId) {
    const { data: sale, error: saleErr } = await admin
      .from("lab_sales")
      .select("id")
      .eq("lab_request_id", labRequestId)
      .limit(1)
      .maybeSingle();
    if (saleErr) return { error: saleErr.message };
    if (!sale) return { error: "No payment recorded for this lab order. Complete payment first." };
  }

  const now = new Date().toISOString();

  const { id: priorityId, code: priorityCode, name: priorityName, error: pErr } = await adminPriorityForEntranceTicket(
    admin,
    input.entranceTicketId,
  );
  if (pErr) return { error: pErr };

  const issued = await adminIssueDiagnosticQueueTicket({
    encounterTransId: transId,
    patient: input.patient,
    labRequestId,
    imagingRequestId,
    includesLab,
    includesImaging,
    priorityId,
    priorityCode,
    priorityName,
    registrationType: "Walk-in",
    reason: includesLab && includesImaging ? "Laboratory & Imaging" : includesLab ? "Laboratory" : "Imaging",
    notesTail: "Reception diagnostic check-in finalized (paid)",
  });

  if (issued.error || !issued.result) {
    return { error: issued.error ?? "Could not issue diagnostic queue ticket." };
  }

  const destinationQueueDisplay = issued.result.queueDisplay;
  const destinationCounterCode = issued.result.counterCode;

  const qnErr = await adminPatchEncounterQueueNoIfEmpty(admin, transId, destinationQueueDisplay);
  if (qnErr.error) return { error: qnErr.error };

  const { data: entRow, error: entErr } = await admin.from("queue_tickets").select("notes").eq("id", input.entranceTicketId).maybeSingle();
  if (entErr) return { error: entErr.message };
  const prevNotes = (entRow as { notes?: string | null } | null)?.notes?.trim() ?? "";
  const doneTail = `---\nReception diagnostic check-in finalized (paid): ${now}`;
  const doneNotes = prevNotes ? `${prevNotes}\n\n${doneTail}` : doneTail;

  const { error: upErr } = await admin
    .from("queue_tickets")
    .update({ status: "Completed", completed_at: now, updated_at: now, notes: doneNotes })
    .eq("id", input.entranceTicketId);
  if (upErr) return { error: upErr.message };

  return {
    error: null,
    result: { transId, destinationQueueDisplay, destinationCounterCode },
  };
}

export type ReceptionPatientSearchRow = {
  id: number;
  name: string | null;
  contact_no: string | null;
  date_of_birth: string | null;
  sex: string | null;
  address: string | null;
};

function toReceptionPatientSearchRow(r: PatientPickerRow): ReceptionPatientSearchRow {
  const idRaw = r.id;
  const idNum = typeof idRaw === "number" ? idRaw : Number.parseInt(String(idRaw), 10);
  return {
    id: Number.isFinite(idNum) ? idNum : 0,
    name: r.name,
    contact_no: r.contact_no,
    date_of_birth: r.date_of_birth,
    sex: r.sex,
    address: r.address,
  };
}

/** Server-side search; requires ≥2 sanitized characters (caller may also enforce). */
export async function adminSearchPatients(q: string): Promise<{ rows: ReceptionPatientSearchRow[]; error: string | null }> {
  const admin = queueAdminClient();
  if (!admin) return { rows: [], error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };
  const safe = sanitizePatientSearchQuery(q);
  if (safe.length < 2) return { rows: [], error: null };

  const { rows, error } = await searchPatientsPicker(admin, safe, 80);
  if (error) return { rows: [], error };
  return { rows: rows.map(toReceptionPatientSearchRow), error: null };
}

export async function adminCreatePatient(input: {
  name: string;
  sex: string;
  date_of_birth: string;
  civil_status: string;
  address: string;
  contact_no: string;
  email_address?: string | null;
  occupation?: string | null;
  referring_physician?: string | number | null;
  philhealth_no?: number | null;
}): Promise<{ patient: ReceptionPatientSearchRow | null; error: string | null }> {
  const admin = queueAdminClient();
  if (!admin) return { patient: null, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." };

  const payload = {
    name: input.name.trim().toUpperCase(),
    sex: input.sex.trim().toUpperCase(),
    date_of_birth: input.date_of_birth || null,
    civil_status: input.civil_status.trim().toUpperCase() || null,
    address: input.address.trim().toUpperCase() || null,
    contact_no: input.contact_no.trim() || null,
    email_address: input.email_address?.trim() ? input.email_address.trim().toLowerCase() : null,
    occupation: input.occupation?.trim() ? input.occupation.trim().toUpperCase() : "N/A",
    referring_physician: input.referring_physician ?? null,
    philhealth_no: input.philhealth_no ?? null,
  };

  const { data, error } = await admin
    .from("patients")
    .insert(payload)
    .select("id, name, contact_no, date_of_birth, sex, address")
    .single();

  if (error) return { patient: null, error: error.message };
  return { patient: data as ReceptionPatientSearchRow, error: null };
}
