import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverPushBatches } from "../services/push-delivery";

test("Push retries only transient failed devices and removes invalid tokens", async () => {
  const result = await deliverPushBatches(["success", "invalid", "retry"], async () => ({ responses: [{ success: true }, { success: false, error: { code: "messaging/registration-token-not-registered" } }, { success: false, error: { code: "messaging/server-unavailable" } }] }));
  assert.deepEqual(result.retryTokens, ["retry"]);
  assert.deepEqual(result.invalidTokens, ["invalid"]);
  assert.equal(result.successCount, 1);
});
test("Push respects FCM's 500-token batch limit and preserves earlier successes", async () => {
  const sizes: number[] = [];
  const result = await deliverPushBatches(Array.from({ length: 501 }, (_, i) => String(i)), async tokens => {
    sizes.push(tokens.length);
    if (tokens.length === 1) throw new Error("transport down");
    return { responses: tokens.map(() => ({ success: true })) };
  });
  assert.deepEqual(sizes, [500, 1]);
  assert.equal(result.successCount, 500);
  assert.deepEqual(result.retryTokens, ["500"]);
});
