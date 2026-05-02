import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATABASE_PROVIDER, DATABASE_URL, NODE_ENV } from "./config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let prismaInstance;

const resolveSqliteUrl = (rawUrl) => {
  if (!rawUrl.startsWith("file:")) return rawUrl;
  const filePath = rawUrl.slice(5);
  if (!filePath) throw new Error("Invalid SQLite DATABASE_URL: missing file path after file:");
  if (filePath === ":memory:") return "file::memory:";

  // Keep runtime path semantics aligned with Prisma CLI, where SQLite paths
  // are resolved relative to server/prisma/schema.prisma.
  const prismaDir = path.resolve(__dirname, "..", "prisma");
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(prismaDir, filePath);
  const parentDir = path.dirname(absolutePath);
  if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

  return `file:${absolutePath.replace(/\\/g, "/")}`;
};

if (DATABASE_PROVIDER === "postgresql") {
  const { PrismaClient: PostgresPrismaClient } = await import("../generated/postgres-client/index.js");
  prismaInstance = new PostgresPrismaClient({
    log: NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
} else {
  const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
  const dbUrl = resolveSqliteUrl(DATABASE_URL);
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  prismaInstance = new PrismaClient({ adapter });
}

export const prisma = prismaInstance;

// Interests are stored as JSON strings in SQLite.
export const parseInterests = (user) => ({
  ...user,
  interests: (() => {
    try { return JSON.parse(user.interests); } catch { return []; }
  })(),
});

export const serializeInterests = (interests) =>
  JSON.stringify(Array.isArray(interests) ? interests : []);

export const initDb = async () => {
  await prisma.$connect();

  try {
    // Touch a known application table so startup fails fast when migrations were not deployed.
    await prisma.user.count({ where: { id: "__startup_probe__" } });
  } catch (error) {
    throw new Error(
      `Database is reachable but schema is not ready. Run migrations before startup (npm run db:migrate). Original error: ${error.message}`,
    );
  }
};



