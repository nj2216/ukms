import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const DUMMY_HASH = `00000000000000000000000000000000:${scryptSync(
  "not-a-real-password",
  Buffer.alloc(16).toString("hex"),
  KEY_LENGTH,
).toString("hex")}`;

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await deriveKey(password, salt)).toString("hex");
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, storedHash?: string | null): Promise<boolean> {
  const [salt, encodedHash] = (storedHash ?? DUMMY_HASH).split(":");
  const expected = Buffer.from(encodedHash, "hex");
  const actual = await deriveKey(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
