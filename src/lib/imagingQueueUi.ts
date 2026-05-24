import type { QueueTicketStatus } from "@/lib/queueReception";
import { isLabReadyForImaging } from "@/lib/labPartialCollection";
import type { ImagingQueueLabGate } from "@/lib/imagingQueueSync";
import type { QueueActiveDept } from "@/lib/queueActiveDept";

export type ImagingQueueStudyProgress = {
  allCaptured: boolean;
};

export function imagingDisplayStatusChipColor(
  displayStatus: string,
): "default" | "warning" | "info" | "success" {
  if (
    displayStatus.startsWith("At laboratory") ||
    displayStatus.startsWith("Called") ||
    displayStatus.startsWith("Serving")
  ) {
    return "info";
  }
  if (displayStatus.startsWith("Collected") || displayStatus.startsWith("Captured") || displayStatus === "Received" || displayStatus === "Completed") {
    return "success";
  }
  if (displayStatus.startsWith("Waiting") || displayStatus === "Ready for imaging") {
    return "warning";
  }
  return "default";
}

export type ImagingQueuePresentation = {
  /** Label shown on imaging queue / results (not always equal to `queue_tickets.status`). */
  displayStatus: string;
  chipColor: "default" | "warning" | "info" | "success";
  canImagingCall: boolean;
  canOpenImagingRequest: boolean;
  imagingCallTooltip: string;
  openImagingTooltip: string;
};

const BLOCKED: QueueTicketStatus[] = ["Cancelled", "Skipped", "No Show"];

export function getImagingQueuePresentation(
  ticketStatus: QueueTicketStatus,
  imagingRequestId: string | null | undefined,
  gate: ImagingQueueLabGate,
  progress?: ImagingQueueStudyProgress,
  activeDept?: QueueActiveDept,
): ImagingQueuePresentation {
  const hasImg = Boolean(String(imagingRequestId ?? "").trim());
  if (!hasImg) {
    return {
      displayStatus: "—",
      chipColor: "default",
      canImagingCall: false,
      canOpenImagingRequest: false,
      imagingCallTooltip: "No imaging request linked",
      openImagingTooltip: "No imaging request linked",
    };
  }

  if (BLOCKED.includes(ticketStatus)) {
    return {
      displayStatus: ticketStatus,
      chipColor: "default",
      canImagingCall: false,
      canOpenImagingRequest: false,
      imagingCallTooltip: "Ticket is not active",
      openImagingTooltip: "Ticket is not active",
    };
  }

  if (ticketStatus === "Completed") {
    return {
      displayStatus: "Completed",
      chipColor: "success",
      canImagingCall: false,
      canOpenImagingRequest: true,
      imagingCallTooltip: "Visit completed",
      openImagingTooltip: "Open imaging request",
    };
  }

  if (ticketStatus === "Waiting") {
    const labReady = isLabReadyForImaging(gate);
    const labPending = gate.includesLab && !labReady;
    const partialReleased = gate.includesLab && gate.labPartialReleased && !gate.labAllCollected;
    return {
      displayStatus: labPending
        ? "Waiting · lab pending"
        : partialReleased
          ? "Waiting · partial collection"
          : "Waiting",
      chipColor: "warning",
      canImagingCall: labReady,
      canOpenImagingRequest: false,
      imagingCallTooltip: labReady
        ? "Call patient to imaging"
        : "Mark specimens collected or use Partially collected on the lab request",
      openImagingTooltip: "Call the patient first",
    };
  }

  if (ticketStatus === "Called") {
    if (activeDept === "IMAG") {
      return {
        displayStatus: "Called at imaging",
        chipColor: "info",
        canImagingCall: false,
        canOpenImagingRequest: true,
        imagingCallTooltip: "Patient is at imaging",
        openImagingTooltip: "Open imaging request",
      };
    }
    if (activeDept === "LAB") {
      return {
        displayStatus: "Called at lab",
        chipColor: "info",
        canImagingCall: false,
        canOpenImagingRequest: false,
        imagingCallTooltip: "Patient is at the laboratory",
        openImagingTooltip: "Wait for laboratory collection",
      };
    }
    return {
      displayStatus: "Called",
      chipColor: "info",
      canImagingCall: false,
      canOpenImagingRequest: true,
      imagingCallTooltip: "Patient was already called",
      openImagingTooltip: "Open imaging request",
    };
  }

  if (ticketStatus === "Collected") {
    const allCaptured = progress?.allCaptured === true;
    if (allCaptured) {
      return {
        displayStatus: "Collected",
        chipColor: "success",
        canImagingCall: false,
        canOpenImagingRequest: true,
        imagingCallTooltip: "Collection complete",
        openImagingTooltip: "Open imaging request",
      };
    }
    const labReady = isLabReadyForImaging(gate);
    return {
      displayStatus:
        gate.includesLab && labReady ? "Ready for imaging" : "Collected",
      chipColor: "warning",
      canImagingCall: labReady,
      canOpenImagingRequest: false,
      imagingCallTooltip: labReady
        ? "Call patient to imaging"
        : "Complete lab collection or partial release first",
      openImagingTooltip: "Call the patient first",
    };
  }

  if (ticketStatus === "Serving") {
    return {
      displayStatus: "Serving at imaging",
      chipColor: "info",
      canImagingCall: false,
      canOpenImagingRequest: true,
      imagingCallTooltip: "Patient is being served",
      openImagingTooltip: "Open imaging request",
    };
  }

  return {
    displayStatus: ticketStatus,
    chipColor: "default",
    canImagingCall: false,
    canOpenImagingRequest: false,
    imagingCallTooltip: "Cannot call for this status",
    openImagingTooltip: "Request is not available",
  };
}
