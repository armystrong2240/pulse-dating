import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEV_JWT_FALLBACK = "pulsedatE_jwt_secret_dev_only_change_in_prod";
const DEV_REFRESH_FALLBACK = "pulsedatE_refresh_secret_dev_only_change_in_prod";

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envRaw = fs.readFileSync(envPath, "utf8");
  for (const line of envRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^['\"]|['\"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

const nodeEnv = process.env.NODE_ENV || "development";
const jwtSecret = process.env.JWT_SECRET || "";
const refreshSecret = process.env.REFRESH_SECRET || "";
const dataEncryptionKey = process.env.DATA_ENCRYPTION_KEY || "";
const bcryptRounds = Number.parseInt(process.env.BCRYPT_ROUNDS || "12", 10);
const postgresUrl = process.env.DATABASE_URL_POSTGRES || process.env.DATABASE_URL || "";
const isPostgres =
  postgresUrl.startsWith("postgresql://") || postgresUrl.startsWith("postgres://");

if (!isPostgres) {
  console.error("Preflight failed: DATABASE_URL_POSTGRES or DATABASE_URL must be a postgres URL.");
  process.exit(1);
}

if (nodeEnv !== "production") {
  console.warn(`Preflight warning: NODE_ENV is ${nodeEnv}. Expected production for release checks.`);
}

if (jwtSecret.length < 32 || jwtSecret === DEV_JWT_FALLBACK) {
  console.error("Preflight failed: JWT_SECRET must be unique and at least 32 characters.");
  process.exit(1);
}

if (refreshSecret.length < 32 || refreshSecret === DEV_REFRESH_FALLBACK) {
  console.error("Preflight failed: REFRESH_SECRET must be unique and at least 32 characters.");
  process.exit(1);
}

if (dataEncryptionKey.length < 32) {
  console.error("Preflight failed: DATA_ENCRYPTION_KEY must be at least 32 characters.");
  process.exit(1);
}

if (!Number.isFinite(bcryptRounds) || bcryptRounds < 12 || bcryptRounds > 15) {
  console.error("Preflight failed: BCRYPT_ROUNDS must be an integer between 12 and 15 in production.");
  process.exit(1);
}

const runPrismaPostgres = (...args) => {
  const command = `node scripts/prisma-postgres.mjs ${args.join(" ")}`;
  const result = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", command], {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL_POSTGRES: postgresUrl,
      },
    })
    : spawnSync("sh", ["-lc", command], {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL_POSTGRES: postgresUrl,
      },
    });

  if (result.error) {
    console.error(`Preflight failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

runPrismaPostgres("generate");
runPrismaPostgres("migrate", "status");

process.env.DATABASE_URL_POSTGRES = postgresUrl;
const { PrismaClient } = await import("../generated/postgres-client/index.js");
const prisma = new PrismaClient();

try {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  console.log("Preflight passed: postgres client generated, migration status checked, and DB connectivity verified.");
} catch (error) {
  console.error(`Preflight failed: unable to query postgres (${error.message}).`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
