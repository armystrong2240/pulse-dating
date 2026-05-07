import { Router } from "express";
import { parseInterests, prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { sendPushToUser } from "./push.js";

const router = Router();

// Tier-based limits
const LIMITS = {
  free: { dailyLikes: 20, superLikes: 1, seeWhoLikedYou: false },
  plus: { dailyLikes: Infinity, superLikes: 5, seeWhoLikedYou: true },
  gold: { dailyLikes: Infinity, superLikes: Infinity, seeWhoLikedYou: true },
};

function getLimits(tier) {
  return LIMITS[tier] || LIMITS.free;
}

const ICEBREAKERS = [
  "You both love {interest} — ask them about their favorite experience with it!",
  "You're both into {interest}. What's your best {interest} story?",
  "Fellow {interest} fan spotted! Break the ice: what got you into it?",
  "Ask them: if you could do {interest} anywhere in the world, where would it be?",
];

function getIcebreaker(meInterests, themInterests) {
  try {
    const shared = meInterests.filter((i) => themInterests.includes(i));
    if (!shared.length) return null;
    const interest = shared[Math.floor(Math.random() * shared.length)];
    const template = ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)];
    return template.replaceAll("{interest}", interest.toLowerCase());
  } catch { return null; }
}

const toPublic = (user, media = []) => {
  const { passwordHash: _, email: __, ...pub } = user;
  return { ...parseInterests(pub), media };
};

// Get today's like count for the current user
router.get("/likes/today", requireAuth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { premiumTier: true } });
  const limits = getLimits(user?.premiumTier);

  const [row, superCount] = await Promise.all([
    prisma.dailyLike.findUnique({
      where: { userId_date: { userId: req.user.id, date: today } },
    }),
    prisma.like.count({
      where: {
        fromId: req.user.id,
        superLike: true,
        createdAt: { gte: new Date(today) },
      },
    }),
  ]);
  return res.json({
    count: row?.count ?? 0,
    limit: limits.dailyLikes === Infinity ? null : limits.dailyLikes,
    superLikeCount: superCount,
    superLikeLimit: limits.superLikes === Infinity ? null : limits.superLikes,
    tier: user?.premiumTier || "free",
  });
});

// Like or pass a profile
router.post("/like/:targetId", requireAuth, async (req, res) => {
  const { liked = true, superLike = false } = req.body;
  const fromId = req.user.id;
  const toId = req.params.targetId;

  if (fromId === toId) {
    return res.status(400).json({ error: "Cannot like yourself" });
  }

  const sender = await prisma.user.findUnique({ where: { id: fromId }, select: { premiumTier: true } });
  const limits = getLimits(sender?.premiumTier);

  // Enforce daily like limit only for positive likes (free tier only)
  if (liked && limits.dailyLikes !== Infinity) {
    const today = new Date().toISOString().slice(0, 10);
    const row = await prisma.dailyLike.upsert({
      where: { userId_date: { userId: fromId, date: today } },
      update: {},
      create: { userId: fromId, date: today, count: 0 },
    });
    if (row.count >= limits.dailyLikes) {
      return res.status(429).json({
        error: `Daily like limit of ${limits.dailyLikes} reached. Upgrade to Plus for unlimited likes!`,
        limitReached: true,
        requiresUpgrade: true,
        minTier: "plus",
      });
    }
    await prisma.dailyLike.update({
      where: { userId_date: { userId: fromId, date: today } },
      data: { count: { increment: 1 } },
    });
  } else if (liked) {
    // Still track for analytics, but don't block
    const today = new Date().toISOString().slice(0, 10);
    await prisma.dailyLike.upsert({
      where: { userId_date: { userId: fromId, date: today } },
      update: { count: { increment: 1 } },
      create: { userId: fromId, date: today, count: 1 },
    });
  }

  // Enforce super like limit
  if (liked && superLike && limits.superLikes !== Infinity) {
    const today = new Date().toISOString().slice(0, 10);
    const superCount = await prisma.like.count({
      where: { fromId, superLike: true, createdAt: { gte: new Date(today) } },
    });
    if (superCount >= limits.superLikes) {
      return res.status(429).json({
        error: `Daily Super Like limit of ${limits.superLikes} reached. Upgrade to Plus for more!`,
        superLimitReached: true,
        requiresUpgrade: true,
        minTier: "plus",
      });
    }
  }

  await prisma.like.upsert({
    where: { fromId_toId: { fromId, toId } },
    update: { liked, superLike: liked ? superLike : false },
    create: { fromId, toId, liked, superLike: liked ? superLike : false },
  });

  const theirLike = liked
    ? await prisma.like.findUnique({
        where: { fromId_toId: { fromId: toId, toId: fromId } },
        select: { liked: true },
      })
    : null;

  const mutualMatch = !!(theirLike?.liked);

  // Real-time match notification to both parties
  if (mutualMatch) {
    const { io, userSockets } = req.app.locals;
    const [me, them] = await Promise.all([
      prisma.user.findUnique({ where: { id: fromId }, select: { id: true, name: true, avatar: true, interests: true } }),
      prisma.user.findUnique({ where: { id: toId }, select: { id: true, name: true, avatar: true, interests: true } }),
    ]);
    const meInts = (() => { try { return JSON.parse(me.interests); } catch { return []; } })();
    const themInts = (() => { try { return JSON.parse(them.interests); } catch { return []; } })();
    const icebreaker = getIcebreaker(meInts, themInts);
    userSockets?.get(toId)?.forEach((sid) =>
      io.to(sid).emit("match:new", { matchedUser: { id: me.id, name: me.name, avatar: me.avatar }, icebreaker })
    );
    userSockets?.get(fromId)?.forEach((sid) =>
      io.to(sid).emit("match:new", { matchedUser: { id: them.id, name: them.name, avatar: them.avatar }, icebreaker })
    );
    // Push notifications for users not currently connected
    await sendPushToUser(toId, "New Match! 💘", `You matched with ${me.name}!`, "/matches");
    await sendPushToUser(fromId, "New Match! 💘", `You matched with ${them.name}!`, "/matches");
  }

  return res.json({ liked, mutualMatch });
});

// People who liked me (names blurred for non-mutual on free tier)
router.get("/liked-me", requireAuth, async (req, res) => {
  const myId = req.user.id;
  const user = await prisma.user.findUnique({ where: { id: myId }, select: { premiumTier: true } });
  const limits = getLimits(user?.premiumTier);
  const canSeeAll = limits.seeWhoLikedYou;

  const rows = await prisma.like.findMany({
    where: { toId: myId, liked: true },
    include: { from: { select: { id: true, name: true, avatar: true, age: true, city: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Check which ones are mutual
  const iLiked = new Set(
    (await prisma.like.findMany({ where: { fromId: myId, liked: true } })).map((l) => l.toId)
  );

  return res.json({
    likedMe: rows.map((r) => {
      const isMutual = iLiked.has(r.from.id);
      const reveal = isMutual || canSeeAll;
      return {
        id: reveal ? r.from.id : null,
        age: r.from.age,
        city: reveal ? r.from.city : null,
        isMutual,
        name: reveal ? r.from.name : "Someone",
        avatar: reveal ? r.from.avatar : null,
        blurred: !reveal,
      };
    }),
    requiresUpgrade: !canSeeAll,
    minTier: "plus",
  });
});

router.get("/", requireAuth, async (req, res) => {
  const myId = req.user.id;

  const iLikedRows = await prisma.like.findMany({
    where: { fromId: myId, liked: true },
  });
  const iLiked = new Set(iLikedRows.map((l) => l.toId));

  const theyLikedMe = await prisma.like.findMany({
    where: {
      toId: myId,
      liked: true,
      fromId: { in: [...iLiked] },
    },
    include: { from: { include: { media: true } } },
  });

  return res.json(theyLikedMe.map((l) => toPublic(l.from, l.from.media)));
});

// Profiles I liked that haven't matched back yet
router.get("/pending", requireAuth, async (req, res) => {
  const myId = req.user.id;

  const iLikedRows = await prisma.like.findMany({
    where: { fromId: myId, liked: true },
    include: { to: { include: { media: true } } },
  });

  const matchedBack = new Set(
    (
      await prisma.like.findMany({
        where: {
          fromId: { in: iLikedRows.map((l) => l.toId) },
          toId: myId,
          liked: true,
        },
      })
    ).map((l) => l.fromId),
  );

  const pending = iLikedRows
    .filter((l) => !matchedBack.has(l.toId))
    .map((l) => toPublic(l.to, l.to.media));

  return res.json(pending);
});

// Undo last swipe (delete most recent like/pass for current user)
router.delete("/undo", requireAuth, async (req, res) => {
  const last = await prisma.like.findFirst({
    where: { fromId: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return res.status(404).json({ error: "Nothing to undo" });

  await prisma.like.delete({ where: { id: last.id } });

  // Also decrement daily count if it was a positive like from today
  const today = new Date().toISOString().slice(0, 10);
  if (last.liked && last.createdAt >= new Date(today)) {
    await prisma.dailyLike.updateMany({
      where: { userId: req.user.id, date: today },
      data: { count: { decrement: 1 } },
    });
  }

  const profile = await prisma.user.findUnique({
    where: { id: last.toId },
    include: { media: { orderBy: [{ sortOrder: "asc" }, { uploadedAt: "asc" }] } },
  });

  return res.json({ undone: true, profile: profile ? toPublic(profile, profile.media) : null });
});

// Daily curated pick — best compatibility match not yet acted on
router.get("/daily-pick", requireAuth, async (req, res) => {
  const myId = req.user.id;
  const [myLikes, me] = await Promise.all([
    prisma.like.findMany({ where: { fromId: myId } }),
    prisma.user.findUnique({ where: { id: myId } }),
  ]);
  if (!me) return res.status(404).json({ error: "User not found" });

  const alreadyActed = new Set(myLikes.map((l) => l.toId));
  alreadyActed.add(myId);

  const candidates = await prisma.user.findMany({
    where: { id: { notIn: [...alreadyActed] }, paused: false, onboardingCompleted: true },
    include: { media: { orderBy: [{ sortOrder: "asc" }, { uploadedAt: "asc" }] } },
    take: 100,
  });

  if (!candidates.length) return res.json(null);

  const myInterests = (() => { try { return JSON.parse(me.interests); } catch { return []; } })();
  const now = Date.now();

  const scored = candidates.map((u) => {
    const theirInts = (() => { try { return JSON.parse(u.interests); } catch { return []; } })();
    // Interest overlap score (Jaccard similarity)
    const shared = myInterests.filter((i) => theirInts.includes(i)).length;
    const total = new Set([...myInterests, ...theirInts]).size;
    const interestScore = total > 0 ? shared / total : 0;
    // Profile quality score (normalized)
    const qualityScore = (u.profileScore || 0) / 100;
    // Recency score — recently active users rank higher
    const lastSeenMs = u.lastSeen ? now - new Date(u.lastSeen).getTime() : now;
    const recencyScore = Math.max(0, 1 - lastSeenMs / (7 * 24 * 60 * 60 * 1000)); // decays over 7 days
    // Boosted users get a bump
    const boostScore = u.boostedUntil && new Date(u.boostedUntil) > new Date() ? 0.3 : 0;
    // Verified gets a small bump
    const verifiedScore = u.verified ? 0.1 : 0;

    const total_score = interestScore * 0.4 + qualityScore * 0.25 + recencyScore * 0.2 + boostScore + verifiedScore;
    return { u, score: total_score };
  });

  scored.sort((a, b) => b.score - a.score);
  const pick = scored[0].u;
  const meInts = myInterests;
  const themInts = (() => { try { return JSON.parse(pick.interests); } catch { return []; } })();
  const icebreaker = getIcebreaker(meInts, themInts);

  return res.json({ ...toPublic(pick, pick.media), icebreaker });
});

export default router;

