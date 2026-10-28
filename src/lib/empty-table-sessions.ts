// Server-clock policy: browsing/refreshing does not extend an empty visit.
export const EMPTY_TABLE_SESSION_TIMEOUT_MINUTES = 120;
export const EMPTY_TABLE_SESSION_BATCH_SIZE = 25;

export function emptySessionFilter(now: Date) {
  const cutoff = new Date(now.getTime() - EMPTY_TABLE_SESSION_TIMEOUT_MINUTES * 60_000);
  return {
    status: 'ACTIVE' as const,
    createdAt: { $lte: cutoff },
    // A positive allocation counter is an additional conservative safeguard.
    // Actual Order existence is always checked, including legacy documents.
    nextOrderNumber: { $in: [0, null] },
    $or: [{ lastActivityAt: { $lte: cutoff } }, { lastActivityAt: null }],
  };
}
