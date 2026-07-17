export type CancellationSubscription = {
  id: string;
  migration_source: string | null;
};

export type ProviderCancellationMode = "none" | "immediate" | "cycle_end";

const terminalProviderStatuses = new Set([
  "cancelled",
  "canceled",
  "completed",
  "expired",
]);

export function providerCancellationMode(
  status?: string | null,
): ProviderCancellationMode {
  const normalized = status?.trim().toLowerCase() ?? "";
  if (terminalProviderStatuses.has(normalized)) return "none";
  return normalized === "active" ? "cycle_end" : "immediate";
}

export function replacementDescendantIds(
  subscriptions: CancellationSubscription[],
  rootSubscriptionId: string,
) {
  const descendants: string[] = [];
  const queued = [rootSubscriptionId];
  const visited = new Set(queued);

  while (queued.length) {
    const parentId = queued.shift()!;
    const migrationSource = `replacement:${parentId}`;
    for (const subscription of subscriptions) {
      if (
        subscription.migration_source !== migrationSource ||
        visited.has(subscription.id)
      ) continue;
      visited.add(subscription.id);
      descendants.push(subscription.id);
      queued.push(subscription.id);
    }
  }

  return descendants;
}

export function replacementRelatedIds(
  subscriptions: CancellationSubscription[],
  rootSubscriptionId: string,
) {
  const related = new Set([rootSubscriptionId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const subscription of subscriptions) {
      const parentId = subscription.migration_source?.startsWith("replacement:")
        ? subscription.migration_source.slice("replacement:".length)
        : null;
      if (!parentId) continue;
      if (related.has(parentId) && !related.has(subscription.id)) {
        related.add(subscription.id);
        changed = true;
      }
      if (related.has(subscription.id) && !related.has(parentId)) {
        related.add(parentId);
        changed = true;
      }
    }
  }

  return [...related];
}
