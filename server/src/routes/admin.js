import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { BCRYPT_ROUNDS } from "../config/env.js";
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

const AdminPasswordSchema = z.object({
  newPassword: z.string().min(12, "Password must be at least 12 characters"),
});

// GET /api/admin/stats — overall platform stats
router.get("/stats", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const safeCount = async (fn) => {
      try { return await fn(); } catch { return 0; }
    };

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
      safeCount(() => prisma.user.count()),
      safeCount(() => prisma.user.count({ where: { emailVerified: true } })),
      safeCount(() => prisma.user.count({ where: { isPremium: true } })),
      safeCount(() => prisma.like.count({ where: { liked: true } })),
      safeCount(() => prisma.message.count()),
      safeCount(() => prisma.report.count()),
      safeCount(() => prisma.gift.count()),
      safeCount(() => prisma.referral.count()),
      safeCount(() => prisma.user.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      })),
      safeCount(() => prisma.user.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      })),
    ]);

    let tierBreakdown = {};
    try {
      const rows = await prisma.user.groupBy({ by: ["premiumTier"], _count: { premiumTier: true } });
      tierBreakdown = Object.fromEntries(rows.map((t) => [t.premiumTier || "free", t._count.premiumTier]));
    } catch {
      tierBreakdown = {};
    }

    return res.json({
      stats: {
        users: { total: totalUsers, verified: verifiedUsers, premium: premiumUsers, newToday: newUsersToday, newThisWeek: newUsersThisWeek },
        engagement: { totalMatches, totalMessages, totalGifts, totalReferrals },
        moderation: { totalReports },
        tierBreakdown,
      },
    });
  } catch (err) {
    console.error("[admin/stats] unexpected error:", err);
    return res.status(500).json({ error: "Stats unavailable", detail: err?.message });
  }
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

// POST /api/admin/me/password — rotate currently logged-in admin password
router.post("/me/password", requireAuth, requireAdmin, async (req, res) => {
  const parsed = AdminPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS);

  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash },
  });

  // Revoke existing refresh sessions so the new password takes effect immediately.
  await prisma.refreshToken.deleteMany({ where: { userId: req.user.id } });

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
  const trialing = subscriptions.filter((s) => s.status === "trialing");
  const canceled = subscriptions.filter((s) => s.status === "canceled");
  const pastDue = subscriptions.filter((s) => s.status === "past_due");
  const pending = subscriptions.filter((s) => s.status === "pending");

  const mrr = active.reduce((acc, s) => {
    const tierPrice = s.tier === "gold" ? 19.99 : s.tier === "plus" ? 9.99 : 0;
    return acc + tierPrice;
  }, 0);

  return res.json({
    mrr: Math.round(mrr * 100) / 100,
    counts: {
      active: active.length,
      trialing: trialing.length,
      canceled: canceled.length,
      pastDue: pastDue.length,
      pending: pending.length,
    },
    subscriptions: subscriptions.slice(0, 50),
  });
});

// ── Growth dashboard ──────────────────────────────────────────────────────────

router.get("/growth", requireAuth, requireAdmin, async (_req, res) => {
  const now = new Date();
  const days30ago = new Date(now - 30 * 86400000);
  const days7ago  = new Date(now - 7  * 86400000);
  const days1ago  = new Date(now - 1  * 86400000);

  // New signups per day (last 30 days) — raw dates aggregated in JS
  const recentUsers = await prisma.user.findMany({
    where: { createdAt: { gte: days30ago } },
    select: { createdAt: true, lastSeen: true, isPremium: true, onboardingCompleted: true },
    orderBy: { createdAt: "asc" },
  });

  // Bucket by date string
  const signupsByDay = {};
  for (const u of recentUsers) {
    const d = u.createdAt.toISOString().slice(0, 10);
    signupsByDay[d] = (signupsByDay[d] || 0) + 1;
  }

  // DAU: users seen in last 24h
  const dau = await prisma.user.count({ where: { lastSeen: { gte: days1ago } } });
  // WAU: users seen in last 7 days
  const wau = await prisma.user.count({ where: { lastSeen: { gte: days7ago } } });
  // MAU: users seen in last 30 days
  const mau = await prisma.user.count({ where: { lastSeen: { gte: days30ago } } });
  // Total users
  const total = await prisma.user.count();
  // Premium users
  const premiumCount = await prisma.user.count({ where: { isPremium: true } });
  // Onboarding completion rate
  const onboardedCount = await prisma.user.count({ where: { onboardingCompleted: true } });

  // Churn signals: users who signed up 7–30 days ago and haven't been seen in 7 days
  const days30to7 = await prisma.user.count({
    where: {
      createdAt: { gte: days30ago, lt: days7ago },
      OR: [{ lastSeen: null }, { lastSeen: { lt: days7ago } }],
    },
  });

  // Retention: of users who signed up 7+ days ago, how many came back after day 1?
  const signedUp7daysAgo = await prisma.user.count({ where: { createdAt: { lt: days7ago } } });
  const retained = signedUp7daysAgo > 0
    ? await prisma.user.count({
        where: {
          createdAt: { lt: days7ago },
          lastSeen: { gte: days7ago },
        },
      })
    : 0;

  // New users last 7d vs prior 7d (growth rate)
  const days14ago = new Date(now - 14 * 86400000);
  const newLast7  = await prisma.user.count({ where: { createdAt: { gte: days7ago } } });
  const newPrev7  = await prisma.user.count({ where: { createdAt: { gte: days14ago, lt: days7ago } } });

  return res.json({
    overview: { total, dau, wau, mau, premiumCount, onboardedCount },
    signupsByDay,
    growth: { newLast7, newPrev7 },
    retention: {
      signedUp7daysAgo,
      retained,
      rate: signedUp7daysAgo > 0 ? Math.round((retained / signedUp7daysAgo) * 100) : 0,
    },
    churnSignals: { dormantLast7days: days30to7 },
  });
});

// ── Support tickets ───────────────────────────────────────────────────────────

router.get("/support", requireAuth, requireAdmin, async (req, res) => {
  const status = req.query.status || undefined;
  const tickets = await prisma.supportTicket.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return res.json(tickets);
});

export default router;
