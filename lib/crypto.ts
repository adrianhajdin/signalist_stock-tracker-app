/**
 * AES-256-GCM encryption for API keys at rest.
 * Uses ENCRYPTION_KEY env var (32-byte hex string = 64 hex chars).
 * Each encrypt() call generates a random IV — safe to store alongside ciphertext.
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export interface EncryptedValue {
  ciphertext: string; // base64
  iv: string; // base64
  tag: string; // base64
}

/** Encrypt a plaintext string. Returns base64-encoded components. */
export function encrypt(plaintext: string): EncryptedValue {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/** Decrypt a previously encrypted value. Returns plaintext string. */
export function decrypt(encrypted: EncryptedValue): string {
  const key = getKey();
  const iv = Buffer.from(encrypted.iv, "base64");
  const tag = Buffer.from(encrypted.tag, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted.ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Pack encrypted value into a single string for DB storage.
 * Format: base64(iv):base64(tag):base64(ciphertext)
 */
export function packEncrypted(value: EncryptedValue): string {
  return `${value.iv}:${value.tag}:${value.ciphertext}`;
}

/** Unpack a stored encrypted string back into components. */
export function unpackEncrypted(stored: string): EncryptedValue {
  const [iv, tag, ciphertext] = stored.split(":");
  if (!iv || !tag || !ciphertext) {
    throw new Error("Invalid encrypted value format");
  }
  return { iv, tag, ciphertext };
}

/** Encrypt and pack into a single storable string. */
export function encryptAndPack(plaintext: string): string {
  return packEncrypted(encrypt(plaintext));
}

/** Unpack and decrypt a stored string back to plaintext. */
export function unpackAndDecrypt(stored: string): string {
  return decrypt(unpackEncrypted(stored));
}
