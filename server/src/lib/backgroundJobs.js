/**
 * Background jobs — runs in the same process on a timer.
 * Handles: match expiry, scheduled boosts, login streak cleanup.
 */
import crypto from "crypto";
import { prisma } from "../db.js";
import { logger } from "./logger.js";
import {
  sendDripDay1,
  sendDripDay3,
  sendDripDay7,
  sendDripDay14,
} from "../mailer.js";

const MATCH_EXPIRY_HOURS = 72;
const REPORT_AUTO_HIDE_THRESHOLD = 3;

// ── Match expiry ─────────────────────────────────────────────────────────
async function expireMatches() {
  try {
    const cutoff = new Date(Date.now() - MATCH_EXPIRY_HOURS * 60 * 60 * 1000);

    // Find mutual matches (both sides liked each other) where neither side has sent a message,
    // and both likes were created more than 72h ago with no messages exchanged.
    // We check by looking at Like records older than cutoff where a mutual match exists.
    const oldLikes = await prisma.like.findMany({
      where: { liked: true, createdAt: { lt: cutoff } },
      select: { fromId: true, toId: true, createdAt: true },
    });

    let expired = 0;
    for (const like of oldLikes) {
      // Check mutual
      const mutual = await prisma.like.findUnique({
        where: { fromId_toId: { fromId: like.toId, toId: like.fromId } },
        select: { liked: true, createdAt: true },
      });
      if (!mutual?.liked) continue;

      // Check if any message was ever exchanged between them
      const roomId = like.fromId < like.toId
        ? `${like.fromId}_${like.toId}`
        : `${like.toId}_${like.fromId}`;

      // Also check roomId = either userId (DM convention used in this app)
      const msgCount = await prisma.message.count({
        where: {
          OR: [
            { roomId: like.toId, senderId: like.fromId },
            { roomId: like.fromId, senderId: like.toId },
            { roomId },
          ],
        },
      });

      if (msgCount === 0) {
        // Expire the match — set both likes to liked: false
        await prisma.like.updateMany({
          where: {
            OR: [
              { fromId: like.fromId, toId: like.toId },
              { fromId: like.toId, toId: like.fromId },
            ],
          },
          data: { liked: false },
        });
        expired++;
      }
    }

    if (expired > 0) {
      logger.info("jobs.match_expiry.done", { expired });
    }
  } catch (err) {
    logger.error("jobs.match_expiry.error", { error: err?.message });
  }
}

// ── Report auto-hide ─────────────────────────────────────────────────────
async function autoHideReported() {
  try {
    // Find users with 3+ reports who are not yet auto-hidden
    const reported = await prisma.report.groupBy({
      by: ["reportedId"],
      _count: { reportedId: true },
      having: { reportedId: { _count: { gte: REPORT_AUTO_HIDE_THRESHOLD } } },
    });

    for (const row of reported) {
      const user = await prisma.user.findUnique({
        where: { id: row.reportedId },
        select: { autoHidden: true, paused: true },
      });
      if (user && !user.autoHidden) {
        await prisma.user.update({
          where: { id: row.reportedId },
          data: { autoHidden: true, paused: true },
        });
        logger.warn("jobs.auto_hide.applied", {
          userId: row.reportedId,
          reportCount: row._count.reportedId,
        });
      }
    }
  } catch (err) {
    logger.error("jobs.auto_hide.error", { error: err?.message });
  }
}

// ── Scheduled boosts ─────────────────────────────────────────────────────
async function fireScheduledBoosts() {
  try {
    const due = await prisma.scheduledBoost.findMany({
      where: { fired: false, scheduledAt: { lte: new Date() } },
    });

    for (const boost of due) {
      const boostedUntil = new Date(Date.now() + boost.durationMin * 60 * 1000);
      await prisma.$transaction([
        prisma.user.update({ where: { id: boost.userId }, data: { boostedUntil } }),
        prisma.scheduledBoost.update({ where: { id: boost.id }, data: { fired: true } }),
      ]);
      logger.info("jobs.boost.fired", { userId: boost.userId, durationMin: boost.durationMin });
    }
  } catch (err) {
    logger.error("jobs.boost.error", { error: err?.message });
  }
}

// ── Login streak awards ──────────────────────────────────────────────────
// Called from auth route on successful login, not on a timer
export async function awardLoginStreak(userId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { loginStreak: true, lastLoginDate: true, roseBalance: true },
    });
    if (!user) return;

    const lastDate = user.lastLoginDate || "";
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    let newStreak = 1;
    if (lastDate === yesterday) {
      newStreak = (user.loginStreak || 0) + 1;
    } else if (lastDate === today) {
      return; // already logged in today
    }

    // Milestone bonuses: 5, 7, 14, 30 days
    const MILESTONES = { 5: 2, 7: 5, 14: 10, 30: 25 };
    const bonus = MILESTONES[newStreak] || 0;

    const updates = [
      prisma.user.update({
        where: { id: userId },
        data: {
          loginStreak: newStreak,
          lastLoginDate: today,
          roseBalance: bonus > 0 ? { increment: bonus } : undefined,
        },
      }),
    ];

    if (bonus > 0) {
      updates.push(
        prisma.roseLedger.create({
          data: {
            id: crypto.randomUUID(),
            userId,
            delta: bonus,
            reason: "streak_bonus",
            refId: String(newStreak),
          },
        })
      );
    }

    await prisma.$transaction(updates);
    return { streak: newStreak, bonus };
  } catch (err) {
    logger.error("jobs.streak.error", { error: err?.message });
  }
}

// ── Drip email campaign ───────────────────────────────────────────────────────
// We track which drip emails have been sent via SecurityEvent log to avoid resending.
// Day buckets: 1d, 3d, 7d, 14d since createdAt — only for users who verified email.
const DRIP_SCHEDULE = [
  { dayMin: 1,  dayMax: 2,  eventType: "drip_day1",  fn: sendDripDay1 },
  { dayMin: 3,  dayMax: 4,  eventType: "drip_day3",  fn: sendDripDay3 },
  { dayMin: 7,  dayMax: 9,  eventType: "drip_day7",  fn: sendDripDay7 },
  { dayMin: 14, dayMax: 17, eventType: "drip_day14", fn: sendDripDay14 },
];

async function sendDripEmails() {
  try {
    const now = Date.now();
    let sent = 0;
    for (const drip of DRIP_SCHEDULE) {
      const minAge = new Date(now - drip.dayMin * 86400000);
      const maxAge = new Date(now - drip.dayMax * 86400000);
      // Users in the age window who have verified email and have not opted out
      const candidates = await prisma.user.findMany({
        where: {
          createdAt: { gte: maxAge, lte: minAge },
          emailVerified: true,
          email: { not: { endsWith: "@phone.noreply" } },
          paused: false,
          autoHidden: false,
        },
        select: { id: true, email: true, name: true },
      });
      for (const u of candidates) {
        // Check if we already sent this drip
        const already = await prisma.securityEvent.findFirst({
          where: { userId: u.id, eventType: drip.eventType },
          select: { id: true },
        });
        if (already) continue;
        try {
          await drip.fn(u.email, u.name || "there");
          await prisma.securityEvent.create({
            data: {
              id: crypto.randomUUID(),
              userId: u.id,
              email: u.email,
              eventType: drip.eventType,
              severity: "info",
            },
          });
          sent++;
        } catch (err) {
          logger.warn("jobs.drip.send_error", { userId: u.id, drip: drip.eventType, error: err?.message });
        }
      }
    }
    if (sent > 0) logger.info("jobs.drip.done", { sent });
  } catch (err) {
    logger.error("jobs.drip.error", { error: err?.message });
  }
}

// ── Start all background jobs ─────────────────────────────────────────────
export function startBackgroundJobs() {
  // Run every hour
  setInterval(async () => {
    await expireMatches();
    await autoHideReported();
    await fireScheduledBoosts();
  }, 60 * 60 * 1000);

  // Drip emails — run every 6 hours
  setInterval(async () => {
    await sendDripEmails();
  }, 6 * 60 * 60 * 1000);

  // Fire once on startup after a short delay
  setTimeout(async () => {
    await autoHideReported();
    await fireScheduledBoosts();
  }, 10_000);

  logger.info("jobs.started", { jobs: ["match_expiry", "auto_hide", "scheduled_boosts", "drip_emails"] });
}
