import { PrismaClient } from "../generated/postgres-client/index.js";

const dbUrl = process.env.DATABASE_URL_POSTGRES || process.env.DATABASE_PUBLIC_URL;
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

await prisma.$executeRawUnsafe(`
  ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "resetToken" TEXT,
  ADD COLUMN IF NOT EXISTS "resetTokenExpiry" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pushSubscription" TEXT
`);
console.log("Migration complete: resetToken, resetTokenExpiry, pushSubscription added");
await prisma.$disconnect();
