type Result = { success: boolean; error?: { code?: string } };
type Sender = (tokens: string[]) => Promise<{ responses: Result[] }>;

export async function deliverPushBatches(tokens: string[], send: Sender) {
  let successCount = 0, failureCount = 0;
  const retryTokens: string[] = [], invalidTokens: string[] = [];
  for (let offset = 0; offset < tokens.length; offset += 500) {
    const batch = tokens.slice(offset, offset + 500);
    try {
      const response = await send(batch);
      batch.forEach((token, index) => {
        const result = response.responses[index];
        if (result?.success) { successCount++; return; }
        failureCount++;
        const code = result?.error?.code || "";
        if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(code)) invalidTokens.push(token);
        else retryTokens.push(token);
      });
    } catch {
      failureCount += batch.length;
      retryTokens.push(...batch);
    }
  }
  return { successCount, failureCount, retryTokens, invalidTokens };
}
