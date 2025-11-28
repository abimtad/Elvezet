import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export function customerPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("251")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[79]\d{8}$/.test(digits)) throw new Error("Enter a valid Ethiopian phone number");
  return `+251${digits}`;
}
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashCustomerPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function checkCustomerPassword(password: string, encoded?: string) {
  const [salt, hash] = (encoded || "").split(":");
  // Always perform the expensive derivation, including unknown accounts.
  const actual = await derive(password, salt || "00000000000000000000000000000000");
  const expected = Buffer.from(hash || "00".repeat(64), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual) && !!encoded;
}
