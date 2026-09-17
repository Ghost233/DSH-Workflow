// A DSH provider guarantees only its documented managed range. In particular,
// macOS fallback does not guarantee termination of escaped descendants.
// Source tool authority and workflow delivery require separate evidence.
export const MANAGED_RANGE_SCOPE = 'dsh-managed-range'

export function isManagedRangeStopped(receipt) {
  return receipt?.managedRangeStopped === true
    && receipt.terminationScope === MANAGED_RANGE_SCOPE
    && typeof receipt.terminationId === 'string' && receipt.terminationId.length > 0
}
