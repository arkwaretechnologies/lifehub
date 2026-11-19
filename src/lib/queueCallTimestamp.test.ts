import { describe, expect, it } from "vitest";
import { nextQueueCalledAtIso } from "@/lib/queueCallTimestamp";

describe("nextQueueCalledAtIso", () => {
  it("returns fresh iso when no previous", () => {
    const next = nextQueueCalledAtIso(null);
    expect(next.length).toBeGreaterThan(10);
  });

  it("bumps by 1ms when same millisecond as previous", () => {
    const prev = "2026-03-30T10:00:00.000Z";
    const next = nextQueueCalledAtIso(prev);
    expect(next).not.toBe(prev);
    expect(Date.parse(next)).toBeGreaterThanOrEqual(Date.parse(prev));
  });
});