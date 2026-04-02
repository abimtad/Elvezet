export function moneyMinor(value: number) {
  const minor = Math.round(value * 100);
  if (!Number.isFinite(value) || !Number.isSafeInteger(minor) || Math.abs(minor) > 1_000_000_000 || Math.abs(value * 100 - minor) > 0.000001) throw new Error("Use an amount with at most two decimal places");
  return minor;
}
export function eligibleEarning(booking: any) {
  return booking.paymentStatus === "paid" && !!booking.completedAt && !["cancelled", "expired", "no-show", "no_show"].includes(booking.status);
}
export function earningsTotals(entries: Array<{ type: string; amountMinor: number }>) {
  const sum = (types: string[]) => entries.filter(e => types.includes(e.type)).reduce((n, e) => n + e.amountMinor, 0) / 100;
  return { earned: sum(["earned", "reversal"]), adjustments: sum(["adjustment"]), paidOut: -sum(["payout", "payout_reversal"]), balance: sum(["earned", "reversal", "adjustment", "payout", "payout_reversal"]) };
}
