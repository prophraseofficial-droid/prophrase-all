export function getCreditTimezone() {
  return process.env.DEFAULT_CREDIT_TIMEZONE || "Asia/Kolkata";
}

function partsAt(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function freeCreditPeriod(date = new Date(), timeZone = getCreditTimezone()) {
  const parts = partsAt(date, timeZone);
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;

  // Asia/Kolkata is the production default and has a stable UTC offset.
  if (timeZone !== "Asia/Kolkata") {
    throw new Error("Only Asia/Kolkata is supported for credit grants in this rollout.");
  }
  const nextDayUtc = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1) -
      5.5 * 60 * 60 * 1000,
  );
  return {
    periodKey: `${dateKey}@${timeZone}`,
    validFrom: new Date(
      Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) -
        5.5 * 60 * 60 * 1000,
    ).toISOString(),
    expiresAt: nextDayUtc.toISOString(),
  };
}

export function addEntitlementMonth(anchor: Date, months: number) {
  const anchorDay = anchor.getUTCDate();
  const firstOfTarget = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 1,
      anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()),
  );
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(anchorDay, lastDay));
  return firstOfTarget;
}
