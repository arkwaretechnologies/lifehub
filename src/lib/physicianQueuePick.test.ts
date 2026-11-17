import { describe, expect, it } from "vitest";
import { pickPhysicianWaitingTicket } from "@/lib/physicianQueuePick";

describe("pickPhysicianWaitingTicket", () => {
  const physicianCounters = new Set(["10"]);
  const diagnosticCounters = new Set(["20", "21"]);

  it("prefers physician counter over earlier diagnostic ticket", () => {
    const picked = pickPhysicianWaitingTicket(
      [
        { id: "lab", counter_id: "20", issued_at: "2026-03-30T08:00:00Z" },
        { id: "clinic", counter_id: "10", issued_at: "2026-03-30T09:00:00Z" },
      ],
      physicianCounters,
      diagnosticCounters,
    );
    expect(picked?.id).toBe("clinic");
  });

  it("picks earliest non-diagnostic when no physician counter ticket", () => {
    const picked = pickPhysicianWaitingTicket(
      [
        { id: "entrance", counter_id: "5", issued_at: "2026-03-30T10:00:00Z" },
        { id: "lab", counter_id: "20", issued_at: "2026-03-30T08:00:00Z" },
      ],
      physicianCounters,
      diagnosticCounters,
    );
    expect(picked?.id).toBe("entrance");
  });

  it("returns null when only diagnostic waiting tickets exist", () => {
    const picked = pickPhysicianWaitingTicket(
      [{ id: "lab", counter_id: "20", issued_at: "2026-03-30T08:00:00Z" }],
      physicianCounters,
      diagnosticCounters,
    );
    expect(picked).toBeNull();
  });
});