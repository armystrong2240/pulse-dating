import { prisma } from "../src/db.js";

const refreshGraceDays = Number.parseInt(process.env.RETENTION_REFRESH_GRACE_DAYS || "7", 10);
const verifyTokenDays = Number.parseInt(process.env.RETENTION_VERIFY_TOKEN_DAYS || "7", 10);
const securityEventDays = Number.parseInt(process.env.RETENTION_SECURITY_EVENT_DAYS || "180", 10);

const now = new Date();
const refreshCutoff = new Date(now.getTime() - refreshGraceDays * 24 * 60 * 60 * 1000);
const verifyCutoff = new Date(now.getTime() - verifyTokenDays * 24 * 60 * 60 * 1000);
const securityCutoff = new Date(now.getTime() - securityEventDays * 24 * 60 * 60 * 1000);

const invalidPolicy =
  !Number.isFinite(refreshGraceDays) || refreshGraceDays < 0 ||
  !Number.isFinite(verifyTokenDays) || verifyTokenDays < 1 ||
  !Number.isFinite(securityEventDays) || securityEventDays < 1;

if (invalidPolicy) {
  console.error("Invalid retention policy values. Check RETENTION_* env vars.");
  process.exit(1);
}

try {
  const [refreshDeleted, verifyCleared, securityDeleted] = await prisma.$transaction([
    prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { createdAt: { lt: refreshCutoff } },
        ],
      },
    }),
    prisma.user.updateMany({
      where: {
        emailVerified: false,
        verifyToken: { not: null },
        createdAt: { lt: verifyCutoff },
      },
      data: { verifyToken: null },
    }),
    prisma.securityEvent.deleteMany({
      where: { createdAt: { lt: securityCutoff } },
    }),
  ]);

  console.log(JSON.stringify({
    ok: true,
    timestamp: now.toISOString(),
    retention: {
      refreshGraceDays,
      verifyTokenDays,
      securityEventDays,
    },
    results: {
      refreshTokensDeleted: refreshDeleted.count,
      verifyTokensCleared: verifyCleared.count,
      securityEventsDeleted: securityDeleted.count,
    },
  }, null, 2));
} catch (error) {
  console.error(`Retention maintenance failed: ${error.message}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
