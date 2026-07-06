import assert from "node:assert/strict";
import { test } from "node:test";
import { createSmsEthiopiaProvider, smsSegments, SmsProviderError } from "../services/sms-provider";

const id = "01JZX5M8Q3T5V0X8YW9RCB2K7D";
test("SMSEthiopia v2 uses KEY header, normalized phone and validated acceptance", async () => {
  const provider = createSmsEthiopiaProvider(() => "fake-test-key", async (url, init) => {
    assert.equal(url, "https://smsethiopia.com/api/v2/sms/send");
    assert.equal((init!.headers as Record<string, string>).KEY, "fake-test-key");
    assert.equal(init!.redirect, "error");
    assert.deepEqual(JSON.parse(String(init!.body)), { msisdn: "251985620717", text: "Test" });
    return new Response(JSON.stringify({ sent: true, id, segments: 1, status: "ACCEPTED" }));
  });
  assert.deepEqual(await provider.send({ to: "+251985620717", body: "Test", idempotencyKey: "test" }), { providerMessageId: id, segments: 1, accepted: true });
});
test("Delivery lookup verifies message identity and returns delivered", async () => {
  const provider = createSmsEthiopiaProvider(() => "fake", async url => {
    assert.equal(url, `https://smsethiopia.com/api/v2/sms/${id}`);
    return new Response(JSON.stringify({ id, status: "DELIVERED" }));
  });
  assert.equal(await provider.status!(id), "delivered");
});
test("Permanent whitelist/auth errors do not retry; throttling may retry", async () => {
  for (const [status, body, kind] of [[400, { error_message: "Error Code :: 10007" }, "permanent"], [401, {}, "permanent"], [429, {}, "retryable"]] as const) {
    const provider = createSmsEthiopiaProvider(() => "fake", async () => new Response(JSON.stringify(body), { status }));
    await assert.rejects(provider.send({ to: "+251985620717", body: "Test", idempotencyKey: "test" }), (e: unknown) => e instanceof SmsProviderError && e.kind === kind);
  }
});
test("Timeouts and malformed success responses are uncertain, never blindly resent", async () => {
  for (const http of [async () => { throw new Error("timeout"); }, async () => new Response(JSON.stringify({ sent: true, id: 0 }))]) {
    const provider = createSmsEthiopiaProvider(() => "fake", http);
    await assert.rejects(provider.send({ to: "+251985620717", body: "Test", idempotencyKey: "test" }), (e: unknown) => e instanceof SmsProviderError && e.kind === "ambiguous");
  }
});
test("Quota estimates match GSM, extensions and Unicode segments", () => {
  assert.equal(smsSegments("A".repeat(160)), 1);
  assert.equal(smsSegments("A".repeat(161)), 2);
  assert.equal(smsSegments("^".repeat(81)), 2);
  assert.equal(smsSegments("\u1230".repeat(70)), 1);
  assert.equal(smsSegments("\u1230".repeat(71)), 2);
});
