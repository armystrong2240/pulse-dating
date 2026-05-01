import { z } from "zod";

const DEV_JWT_FALLBACK = "pulsedatE_jwt_secret_dev_only_change_in_prod";
const DEV_REFRESH_FALLBACK = "pulsedatE_refresh_secret_dev_only_change_in_prod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  ADMIN_EMAILS: z.string().default(""),
  DATABASE_URL: z.string().default("file:./data/demo.db"),
  DATA_ENCRYPTION_KEY: z.string().default("dev_data_encryption_key_change_me_32_chars"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(10),
  JWT_SECRET: z.string().default(DEV_JWT_FALLBACK),
  REFRESH_SECRET: z.string().default(DEV_REFRESH_FALLBACK),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

const envData = parsed.data;
const productionMode = envData.NODE_ENV === "production";

const isPostgresUrl =
  envData.DATABASE_URL.startsWith("postgresql://") ||
  envData.DATABASE_URL.startsWith("postgres://");
const isSqliteUrl = envData.DATABASE_URL.startsWith("file:");

if (!isPostgresUrl && !isSqliteUrl) {
  throw new Error(
    "Invalid DATABASE_URL. Supported protocols are postgresql://, postgres://, or file: for SQLite.",
  );
}

if (productionMode) {
  if (envData.JWT_SECRET === DEV_JWT_FALLBACK || envData.JWT_SECRET.length < 32) {
    throw new Error("Invalid JWT_SECRET for production. Use a unique secret with at least 32 characters.");
  }
  if (
    envData.REFRESH_SECRET === DEV_REFRESH_FALLBACK ||
    envData.REFRESH_SECRET.length < 32
  ) {
    throw new Error(
      "Invalid REFRESH_SECRET for production. Use a unique secret with at least 32 characters.",
    );
  }
  if (!isPostgresUrl) {
    throw new Error(
      "Production requires PostgreSQL DATABASE_URL. SQLite is only supported for local development/test.",
    );
  }
  if (envData.DATA_ENCRYPTION_KEY.length < 32) {
    throw new Error(
      "Invalid DATA_ENCRYPTION_KEY for production. Use at least 32 characters.",
    );
  }
}

export const NODE_ENV = envData.NODE_ENV;
export const isProduction = productionMode;
export const LOG_LEVEL = envData.LOG_LEVEL;
export const PORT = envData.PORT;
export const CLIENT_URL = envData.CLIENT_URL;
export const ADMIN_EMAILS = new Set(
  envData.ADMIN_EMAILS
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
export const DATABASE_URL = envData.DATABASE_URL;
export const DATABASE_PROVIDER = isPostgresUrl ? "postgresql" : "sqlite";
export const DATA_ENCRYPTION_KEY = envData.DATA_ENCRYPTION_KEY;
export const BCRYPT_ROUNDS = productionMode
  ? Math.max(envData.BCRYPT_ROUNDS, 12)
  : envData.BCRYPT_ROUNDS;
export const JWT_SECRET = envData.JWT_SECRET;
export const REFRESH_SECRET = envData.REFRESH_SECRET;
