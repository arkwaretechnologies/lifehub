/** Queue ticket notes tag: lab released patient for imaging before all specimens collected. */
export const LAB_PARTIAL_RELEASE_TAG = "[Lab]";
const PARTIAL_RELEASE_RE = /^\[Lab\]\s+partial_release_for_imaging_at=(.+)$/im;

export function parsePartialLabReleaseFromNotes(notes: string | null | undefined): boolean {
  const m = String(notes ?? "").match(PARTIAL_RELEASE_RE);
  if (!m) return false;
  const at = String(m[1] ?? "").trim();
  return at.length > 0;
}

export function applyPartialLabReleaseToNotes(
  notes: string | null | undefined,
  released: boolean,
): string {
  const now = new Date().toISOString();
  const base = String(notes ?? "").replace(/\r\n/g, "\n");
  const lines = base ? base.split("\n") : [];
  const filtered = lines.filter(
    (l) => !(l.trim().startsWith(LAB_PARTIAL_RELEASE_TAG) && l.includes("partial_release_for_imaging_at")),
  );
  if (released) {
    filtered.push(`${LAB_PARTIAL_RELEASE_TAG} partial_release_for_imaging_at=${now}`);
  }
  return filtered.join("\n").trim();
}

export type LabImagingGate = {
  includesLab: boolean;
  labAllCollected: boolean;
  labPartialReleased: boolean;
};

/** Imaging may call when lab is done or explicitly released after partial collection. */
export function isLabReadyForImaging(gate: LabImagingGate): boolean {
  if (!gate.includesLab) return true;
  return gate.labAllCollected || gate.labPartialReleased;
}
