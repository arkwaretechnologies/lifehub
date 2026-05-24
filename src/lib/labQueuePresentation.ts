import type { QueueTicketStatus } from "@/lib/queueReception";
import type { QueueActiveDept } from "@/lib/queueActiveDept";

export type LabQueueDisplayInput = {
  status: QueueTicketStatus;
  includes_lab?: boolean | null;
  includes_imaging?: boolean | null;
  lab_all_collected?: boolean;
  lab_partial_released?: boolean;
  specimen_collected?: boolean;
  imaging_all_captured?: boolean;
  active_dept?: QueueActiveDept;
};

export function getLabQueueDisplayStatus(row: LabQueueDisplayInput): string {
  const includesImaging = row.includes_imaging === true;
  const status = row.status;
  const active = row.active_dept ?? null;

  if (status === "Called") {
    if (active === "LAB") return "Called at lab";
    if (active === "IMAG") return "Called at imaging";
    return "Called";
  }

  if (status === "Waiting") {
    if (includesImaging && row.imaging_all_captured) return "Waiting · imaging captured";
    if (row.lab_partial_released && !row.lab_all_collected) return "Waiting · partial collection";
    if (row.specimen_collected) return "Waiting · specimen collected";
    return "Waiting";
  }

  if (status === "Collected") {
    return "Collected";
  }

  return status;
}

export function labQueueDisplayChipColor(
  displayStatus: string,
  rawStatus: QueueTicketStatus,
): "default" | "warning" | "info" | "success" {
  if (
    displayStatus.startsWith("At imaging") ||
    displayStatus.startsWith("Called") ||
    rawStatus === "Called" ||
    rawStatus === "Serving"
  ) {
    return "info";
  }
  if (
    displayStatus.startsWith("Collected") ||
    rawStatus === "Collected" ||
    rawStatus === "Completed"
  ) {
    return "success";
  }
  if (rawStatus === "Waiting" || displayStatus.startsWith("Waiting")) return "warning";
  return "default";
}
