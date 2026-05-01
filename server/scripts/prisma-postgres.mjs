import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/prisma-postgres.mjs <prisma args>");
  process.exit(1);
}

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envRaw = fs.readFileSync(envPath, "utf8");
  for (const line of envRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const postgresUrl = process.env.DATABASE_URL_POSTGRES || process.env.DATABASE_URL || "";
const isPostgres =
  postgresUrl.startsWith("postgresql://") || postgresUrl.startsWith("postgres://");

if (!isPostgres) {
  console.error(
    "Postgres Prisma command requires DATABASE_URL_POSTGRES or DATABASE_URL to be a postgres URL.",
  );
  process.exit(1);
}

const prismaArgs = ["prisma", ...args, "--schema", "prisma/postgres/schema.prisma"];
const result = process.platform === "win32"
  ? spawnSync("cmd.exe", ["/d", "/s", "/c", `npx ${prismaArgs.join(" ")}`], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL_POSTGRES: postgresUrl,
    },
  })
  : spawnSync("sh", ["-lc", `npx ${prismaArgs.join(" ")}`], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL_POSTGRES: postgresUrl,
    },
  });

if (result.error) {
  console.error(`Failed to run Prisma command: ${result.error.message}`);
  process.exit(1);
}

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.signal) {
  console.error(`Prisma command terminated by signal: ${result.signal}`);
}

process.exit(1);
