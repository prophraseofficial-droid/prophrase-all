export type AllocatableBucket = {
  id: string;
  remaining: number;
  expiresAt: string;
  createdAt: string;
};

export function allocateByEarliestExpiry(
  buckets: AllocatableBucket[],
  creditCost: number,
) {
  if (!Number.isSafeInteger(creditCost) || creditCost < 0) {
    throw new Error("INVALID_CREDIT_COST");
  }
  const ordered = [...buckets].sort((left, right) =>
    left.expiresAt.localeCompare(right.expiresAt) ||
    left.createdAt.localeCompare(right.createdAt),
  );
  let remaining = creditCost;
  const allocations: Array<{ bucketId: string; amount: number }> = [];
  for (const bucket of ordered) {
    if (remaining === 0) break;
    if (bucket.remaining <= 0) continue;
    const amount = Math.min(remaining, bucket.remaining);
    allocations.push({ bucketId: bucket.id, amount });
    remaining -= amount;
  }
  if (remaining > 0) throw new Error("INSUFFICIENT_CREDITS");
  return allocations;
}

export function remainingAfterDuplicateGrantRepair(
  buckets: Array<{ original_amount: number; remaining_amount: number }>,
  allowance: number,
) {
  const consumed = buckets.reduce(
    (total, bucket) =>
      total + Math.max(0, bucket.original_amount - bucket.remaining_amount),
    0,
  );
  return Math.max(0, allowance - consumed);
}
