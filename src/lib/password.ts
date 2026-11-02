import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const DUMMY_HASH = `00000000000000000000000000000000:${scryptSync(
  "not-a-real-password",
  Buffer.alloc(16).toString("hex"),
  KEY_LENGTH,
).toString("hex")}`;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash?: string | null): boolean {
  const [salt, encodedHash] = (storedHash ?? DUMMY_HASH).split(":");
  const expected = Buffer.from(encodedHash, "hex");
  const actual = scryptSync(password, salt, KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
