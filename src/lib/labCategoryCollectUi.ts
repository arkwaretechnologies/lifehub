export function isLabItemCollectedFlag(collected_item: string | null | undefined): boolean {
  return String(collected_item ?? "").trim().toUpperCase() === "Y";
}

/** Category-level "Collected" checkbox state for lab results. */
export function categoryCollectState(items: Array<{ collected_item?: string | null }>): {
  allCollected: boolean;
  indeterminate: boolean;
} {
  if (items.length === 0) return { allCollected: false, indeterminate: false };

  let collectedCount = 0;
  for (const it of items) {
    if (isLabItemCollectedFlag(it.collected_item)) collectedCount += 1;
  }

  return {
    allCollected: collectedCount === items.length,
    indeterminate: collectedCount > 0 && collectedCount < items.length,
  };
}
