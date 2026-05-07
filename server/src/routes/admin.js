import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ADMIN_EMAILS } from "../config/env.js";

const router = Router();

function requireAdmin(req, res, next) {
  if (!ADMIN_EMAILS.has(req.user.email.toLowerCase())) {
    return res.status(403).json({ error: "Admin access required" });
  }
  return next();
}

// GET /api/admin/stats — overall platform stats
router.get("/stats", requireAuth, requireAdmin, async (_req, res) => {
  const [
    totalUsers,
    verifiedUsers,
    premiumUsers,
    totalMatches,
    totalMessages,
    totalReports,
    totalGifts,
    totalReferrals,
    newUsersToday,
    newUsersThisWeek,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: true } }),
    prisma.user.count({ where: { isPremium: true } }),
    prisma.like.count({ where: { liked: true } }),
    prisma.message.count(),
    prisma.report.count(),
    prisma.gift.count(),
    prisma.referral.count(),
    prisma.user.count({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.user.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ]);

  const tierBreakdown = await prisma.user.groupBy({
    by: ["premiumTier"],
    _count: { premiumTier: true },
  });

  return res.json({
    stats: {
      users: { total: totalUsers, verified: verifiedUsers, premium: premiumUsers, newToday: newUsersToday, newThisWeek: newUsersThisWeek },
      engagement: { totalMatches, totalMessages, totalGifts, totalReferrals },
      moderation: { totalReports },
      tierBreakdown: Object.fromEntries(tierBreakdown.map((t) => [t.premiumTier || "free", t._count.premiumTier])),
    },
  });
});

// GET /api/admin/users — paginated user list with search
router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const search = req.query.search || "";
  const skip = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { name: { contains: search } },
          { email: { contains: search } },
          { city: { contains: search } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, age: true, city: true, state: true,
        isPremium: true, premiumTier: true, emailVerified: true, verified: true,
        paused: true, onboardingCompleted: true, profileScore: true,
        createdAt: true, lastSeen: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return res.json({ users, total, page, pages: Math.ceil(total / limit) });
});

// GET /api/admin/reports — unresolved reports for moderation
router.get("/reports", requireAuth, requireAdmin, async (req, res) => {
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      reporter: { select: { id: true, name: true, email: true } },
    },
  });

  // Enrich with reported user info
  const enriched = await Promise.all(
    reports.map(async (r) => {
      const reported = await prisma.user.findUnique({
        where: { id: r.reportedId },
        select: { id: true, name: true, email: true },
      });
      return { ...r, reported };
    }),
  );

  return res.json({ reports: enriched });
});

// POST /api/admin/users/:id/ban — ban (delete) a user
router.post("/users/:id/ban", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const user = await prisma.user.findUnique({ where: { id }, select: { email: true, name: true } });
  if (!user) return res.status(404).json({ error: "User not found" });

  // Soft-ban: pause + mark
  await prisma.user.update({
    where: { id },
    data: { paused: true },
  });

  return res.json({ ok: true, message: `User ${user.name} (${user.email}) has been banned.` });
});

// POST /api/admin/users/:id/verify — manually verify a user
router.post("/users/:id/verify", requireAuth, requireAdmin, async (req, res) => {
  await prisma.user.update({
    where: { id: req.params.id },
    data: { verified: true, verifiedStatus: "verified" },
  });
  return res.json({ ok: true });
});

// GET /api/admin/subscriptions — revenue overview
router.get("/subscriptions", requireAuth, requireAdmin, async (req, res) => {
  const subscriptions = await prisma.subscription.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const active = subscriptions.filter((s) => s.status === "active" || s.status === "trialing");
  const canceled = subscriptions.filter((s) => s.status === "canceled");
  const pastDue = subscriptions.filter((s) => s.status === "past_due");

  const mrr = active.reduce((acc, s) => {
    const tierPrice = s.tier === "gold" ? 19.99 : s.tier === "plus" ? 9.99 : 0;
    return acc + tierPrice;
  }, 0);

  return res.json({
    mrr: Math.round(mrr * 100) / 100,
    counts: { active: active.length, canceled: canceled.length, pastDue: pastDue.length },
    subscriptions: subscriptions.slice(0, 50),
  });
});

export default router;
