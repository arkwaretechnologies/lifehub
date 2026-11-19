import { describe, expect, it } from "vitest";
import {
  announcementSpeakKey,
  calledAtTimestampChanged,
  ticketNeedsAnnouncement,
  ticketSnapshotFromTicket,
} from "@/lib/queueRecall";

const CALLED_AT = "2026-03-30T10:00:00.000Z";
const CALLED_AT_2 = "2026-03-30T10:01:00.000Z";

describe("calledAtTimestampChanged", () => {
  it("detects 1ms recall bump", () => {
    const prev = "2026-03-30T10:00:00.000Z";
    const next = "2026-03-30T10:00:00.001Z";
    expect(calledAtTimestampChanged(prev, next)).toBe(true);
  });
});

describe("ticketNeedsAnnouncement", () => {
  it("announces when active dept changes LAB to IMAG with same called_at", () => {
    const prev = ticketSnapshotFromTicket({
      status: "Called",
      called_at: CALLED_AT,
      notes: "[Active] dept=LAB",
    });
    const next = {
      status: "Called" as const,
      called_at: CALLED_AT,
      notes: "[Active] dept=IMAG",
    };
    expect(ticketNeedsAnnouncement(next, prev, { fromRealtime: true })).toBe(true);
  });

  it("announces when called_at changes", () => {
    const prev = ticketSnapshotFromTicket({
      status: "Called",
      called_at: CALLED_AT,
      notes: "[Active] dept=IMAG",
    });
    const next = {
      status: "Called" as const,
      called_at: CALLED_AT_2,
      notes: "[Active] dept=IMAG",
    };
    expect(ticketNeedsAnnouncement(next, prev)).toBe(true);
  });

  it("announces first call Waiting to Called", () => {
    const prev = ticketSnapshotFromTicket({
      status: "Waiting",
      called_at: null,
      notes: null,
    });
    const next = {
      status: "Called" as const,
      called_at: CALLED_AT,
      notes: null,
    };
    expect(ticketNeedsAnnouncement(next, prev)).toBe(true);
  });

  it("does not repeat when neither dept nor called_at changed", () => {
    const notes = "[Active] dept=IMAG";
    const prev = ticketSnapshotFromTicket({ status: "Called", called_at: CALLED_AT, notes });
    const next = { status: "Called" as const, called_at: CALLED_AT, notes };
    expect(ticketNeedsAnnouncement(next, prev)).toBe(false);
  });
});

describe("announcementSpeakKey", () => {
  it("includes active dept", () => {
    expect(announcementSpeakKey("t1", CALLED_AT, "IMAG")).toBe(`t1:${CALLED_AT}:IMAG`);
    expect(announcementSpeakKey("t1", CALLED_AT, "LAB")).not.toBe(announcementSpeakKey("t1", CALLED_AT, "IMAG"));
  });
});