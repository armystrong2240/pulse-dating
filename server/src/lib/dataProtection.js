import crypto from "crypto";
import { DATA_ENCRYPTION_KEY } from "../config/env.js";

const ENCRYPTION_PREFIX = "enc:v1:";
const SENSITIVE_USER_FIELDS = [
  "state",
  "zipCode",
  "pronouns",
  "genderIdentity",
  "sexualOrientation",
  "polyPreference",
];

const key = crypto.createHash("sha256").update(DATA_ENCRYPTION_KEY).digest();

const isEncrypted = (value) =>
  typeof value === "string" && value.startsWith(ENCRYPTION_PREFIX);

export function encryptText(value) {
  if (typeof value !== "string") return value;
  if (!value || isEncrypted(value)) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptText(value) {
  if (typeof value !== "string") return value;
  if (!isEncrypted(value)) return value;

  try {
    const payload = value.slice(ENCRYPTION_PREFIX.length);
    const [ivHex, tagHex, dataHex] = payload.split(":");
    if (!ivHex || !tagHex || !dataHex) return "";

    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encrypted = Buffer.from(dataHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return "";
  }
}

export function encryptSensitiveUserFields(input) {
  if (!input || typeof input !== "object") return input;
  const next = { ...input };

  for (const field of SENSITIVE_USER_FIELDS) {
    if (typeof next[field] === "string") {
      next[field] = encryptText(next[field]);
    }
  }

  return next;
}

export function decryptSensitiveUserFields(input) {
  if (!input || typeof input !== "object") return input;
  const next = { ...input };

  for (const field of SENSITIVE_USER_FIELDS) {
    if (typeof next[field] === "string") {
      next[field] = decryptText(next[field]);
    }
  }

  return next;
}
