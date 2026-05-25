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

function imagingCapturedPresentation(
  gate: ImagingQueueLabGate,
  progress?: ImagingQueueStudyProgress,
): ImagingQueuePresentation | null {
  if (progress?.allCaptured !== true) return null;
  const labStillPending = gate.includesLab && !gate.labAllCollected;
  return {
    displayStatus: labStillPending ? "Captured · lab pending" : "Captured",
    chipColor: "success",
    canImagingCall: false,
    canOpenImagingRequest: true,
    imagingCallTooltip: "Imaging studies already captured",
    openImagingTooltip: "Open imaging request",
  };
}

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
    const capturedPres = imagingCapturedPresentation(gate, progress);
    if (capturedPres) return capturedPres;

    const labReady = isLabReadyForImaging(gate);
    const partialReleased = gate.includesLab && gate.labPartialReleased && !gate.labAllCollected;
    return {
      displayStatus: partialReleased
        ? "Waiting · partial collection"
        : "Waiting",
      chipColor: "warning",
      canImagingCall: true,
      canOpenImagingRequest: false,
      imagingCallTooltip: gate.includesLab && !labReady
        ? "Call patient to imaging (lab may still be pending)"
        : "Call patient to imaging",
      openImagingTooltip: "Call the patient first",
    };
  }

  if (ticketStatus === "Called") {
    const capturedPres = imagingCapturedPresentation(gate, progress);
    if (capturedPres) return capturedPres;

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
      const labReady = isLabReadyForImaging(gate);
      if (gate.labPartialReleased && labReady) {
        return {
          displayStatus: "Ready for imaging",
          chipColor: "warning",
          canImagingCall: true,
          canOpenImagingRequest: false,
          imagingCallTooltip: "Call patient to imaging (released from lab)",
          openImagingTooltip: "Call the patient first",
        };
      }
      return {
        displayStatus: "At laboratory",
        chipColor: "info",
        canImagingCall: false,
        canOpenImagingRequest: false,
        imagingCallTooltip:
          "Patient is at the laboratory — use Partially collected on the lab request first",
        openImagingTooltip: "Wait for laboratory partial release",
      };
    }
    const labReady = isLabReadyForImaging(gate);
    if (gate.includesLab && gate.labPartialReleased && labReady) {
      return {
        displayStatus: "Ready for imaging",
        chipColor: "warning",
        canImagingCall: true,
        canOpenImagingRequest: false,
        imagingCallTooltip: "Call patient to imaging (released from lab)",
        openImagingTooltip: "Call the patient first",
      };
    }
    return {
      displayStatus: "Called at imaging",
      chipColor: "info",
      canImagingCall: false,
      canOpenImagingRequest: true,
      imagingCallTooltip: "Patient is at imaging",
      openImagingTooltip: "Open imaging request",
    };
  }

  if (ticketStatus === "Collected") {
    const capturedPres = imagingCapturedPresentation(gate, progress);
    if (capturedPres) return capturedPres;

    const labReady = isLabReadyForImaging(gate);
    return {
      displayStatus:
        gate.includesLab && labReady ? "Ready for imaging" : "Collected",
      chipColor: "warning",
      canImagingCall: true,
      canOpenImagingRequest: false,
      imagingCallTooltip: "Call patient to imaging",
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
