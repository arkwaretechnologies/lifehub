import type { QueueTicketStatus } from "@/lib/queueReception";
import type { QueueActiveDept } from "@/lib/queueActiveDept";

export type LabQueueDisplayInput = {
  status: QueueTicketStatus;
  includes_lab?: boolean | null;
  includes_imaging?: boolean | null;
  lab_any_collected?: boolean;
  lab_all_collected?: boolean;
  lab_partial_released?: boolean;
  specimen_collected?: boolean;
  imaging_all_captured?: boolean;
  active_dept?: QueueActiveDept;
};

/** All lab specimens collected (per items or ticket specimen tag). */
export function isLabCollectionComplete(row: {
  lab_all_collected?: boolean;
  specimen_collected?: boolean;
}): boolean {
  return row.lab_all_collected === true || row.specimen_collected === true;
}

/** At least one result-entry line collected, but not all. */
export function isLabPartiallyCollected(row: {
  lab_any_collected?: boolean;
  lab_all_collected?: boolean;
  specimen_collected?: boolean;
}): boolean {
  if (isLabCollectionComplete(row)) return false;
  return row.lab_any_collected === true;
}

export function getLabQueueDisplayStatus(row: LabQueueDisplayInput): string {
  const includesImaging = row.includes_imaging === true;
  const status = row.status;
  const active = row.active_dept ?? null;
  const partial = isLabPartiallyCollected(row);
  const labComplete = isLabCollectionComplete(row);
  const imagingDone = !includesImaging || row.imaging_all_captured === true;

  if (status === "Completed") return "Completed";

  if (labComplete && imagingDone) {
    if (status === "Serving") return "Serving";
    return "Collected";
  }

  if (labComplete) {
    if (status === "Collected") return "Collected";
    if (status === "Serving") return "Serving";
    return "Collected";
  }

  if (status === "Called") {
    if (active === "IMAG" || (includesImaging && active !== "LAB")) {
      return "Called at imaging";
    }
    if (active === "LAB") return partial ? "Partial · at lab" : "Called at lab";
    return "Called";
  }

  if (status === "Serving" && active === "IMAG") {
    return "Serving at imaging";
  }

  if (partial) {
    if (status === "Waiting") {
      if (row.lab_partial_released && includesImaging) return "Waiting · partial collection";
      return "Partial";
    }
    if (status === "Collected" || status === "Serving") {
      if (includesImaging && row.imaging_all_captured) return "Collected · lab pending";
      return "Partial";
    }
    return "Partial";
  }

  if (status === "Waiting") {
    if (includesImaging && row.imaging_all_captured) return "Waiting · imaging captured";
    if (row.lab_partial_released) return "Waiting · partial collection";
    if (row.specimen_collected) return "Waiting · specimen collected";
    return "Waiting";
  }

  if (status === "Collected" || status === "Serving") {
    if (!labComplete) {
      if (includesImaging && row.imaging_all_captured) return "Waiting · imaging captured";
      return "Waiting";
    }
    return "Collected";
  }

  return status;
}

export function labQueueDisplayChipColor(
  displayStatus: string,
  rawStatus: QueueTicketStatus,
): "default" | "warning" | "info" | "success" {
  const label = displayStatus.trim();

  if (label.includes("lab pending")) return "warning";
  if (label.startsWith("Collected") || label === "Completed") return "success";
  if (
    label.startsWith("Partial") ||
    label.toLowerCase().includes("partial") ||
    label.startsWith("Waiting")
  ) {
    return "warning";
  }
  if (
    label.startsWith("At imaging") ||
    label.startsWith("Called") ||
    label.startsWith("Serving")
  ) {
    return "info";
  }

  if (rawStatus === "Collected" || rawStatus === "Completed") return "success";
  if (rawStatus === "Called" || rawStatus === "Serving") return "info";
  if (rawStatus === "Waiting") return "warning";
  return "default";
}

export function labSpecimenColumnLabel(row: {
  lab_any_collected?: boolean;
  lab_all_collected?: boolean;
  specimen_collected?: boolean;
}): { label: string; color: "default" | "warning" | "success" } {
  if (isLabCollectionComplete(row)) {
    return { label: "Collected", color: "success" };
  }
  if (isLabPartiallyCollected(row)) {
    return { label: "Partial", color: "warning" };
  }
  return { label: "Pending", color: "default" };
}

/** Lab queue “Imaging” column — imaging workflow from the lab queue view. */
export function labImagingColumnLabel(row: {
  imaging_all_captured?: boolean;
  lab_partial_released?: boolean;
  active_dept?: QueueActiveDept;
  status?: QueueTicketStatus;
}): { label: string; color: "default" | "warning" | "info" | "success" } {
  if (row.imaging_all_captured) {
    return { label: "Captured", color: "success" };
  }
  const atImaging =
    row.active_dept === "IMAG" ||
    row.status === "Serving" ||
    (row.status === "Called" && row.active_dept !== "LAB");
  if (atImaging) {
    return { label: "In progress", color: "info" };
  }
  if (row.lab_partial_released) {
    return { label: "Ready", color: "warning" };
  }
  return { label: "Pending", color: "default" };
}
