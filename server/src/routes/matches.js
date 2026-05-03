import { Router } from "express";
import { parseInterests, prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { sendPushToUser } from "./push.js";

const router = Router();
const DAILY_LIKE_LIMIT = 20;
const DAILY_SUPER_LIKE_LIMIT = 3;

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
    limit: DAILY_LIKE_LIMIT,
    superLikeCount: superCount,
    superLikeLimit: DAILY_SUPER_LIKE_LIMIT,
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

  // Enforce daily like limit only for positive likes
  if (liked) {
    const today = new Date().toISOString().slice(0, 10);
    const row = await prisma.dailyLike.upsert({
      where: { userId_date: { userId: fromId, date: today } },
      update: {},
      create: { userId: fromId, date: today, count: 0 },
    });
    if (row.count >= DAILY_LIKE_LIMIT) {
      return res.status(429).json({
        error: `Daily like limit of ${DAILY_LIKE_LIMIT} reached. Come back tomorrow!`,
        limitReached: true,
      });
    }
    await prisma.dailyLike.update({
      where: { userId_date: { userId: fromId, date: today } },
      data: { count: { increment: 1 } },
    });

    // Enforce super like limit
    if (superLike) {
      const superCount = await prisma.like.count({
        where: { fromId, superLike: true, createdAt: { gte: new Date(today) } },
      });
      if (superCount >= DAILY_SUPER_LIKE_LIMIT) {
        return res.status(429).json({
          error: `Daily Pulse limit of ${DAILY_SUPER_LIKE_LIMIT} reached. Come back tomorrow!`,
          superLimitReached: true,
        });
      }
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

// People who liked me (names blurred for non-mutual)
router.get("/liked-me", requireAuth, async (req, res) => {
  const myId = req.user.id;

  const rows = await prisma.like.findMany({
    where: { toId: myId, liked: true },
    include: { from: { select: { id: true, name: true, avatar: true, age: true, city: true } } },
  });

  // Check which ones are mutual
  const iLiked = new Set(
    (await prisma.like.findMany({ where: { fromId: myId, liked: true } })).map((l) => l.toId)
  );

  return res.json(rows.map((r) => ({
    id: r.from.id,
    age: r.from.age,
    city: r.from.city,
    isMutual: iLiked.has(r.from.id),
    // Blur identity unless mutual
    name: iLiked.has(r.from.id) ? r.from.name : "Someone",
    avatar: iLiked.has(r.from.id) ? r.from.avatar : null,
  })));
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
    where: { id: { notIn: [...alreadyActed] }, paused: false },
    include: { media: { orderBy: [{ sortOrder: "asc" }, { uploadedAt: "asc" }] } },
    take: 50,
  });

  if (!candidates.length) return res.json(null);

  const myInterests = (() => { try { return JSON.parse(me.interests); } catch { return []; } })();

  const scored = candidates.map((u) => {
    const theirInts = (() => { try { return JSON.parse(u.interests); } catch { return []; } })();
    const shared = myInterests.filter((i) => theirInts.includes(i)).length;
    const total = new Set([...myInterests, ...theirInts]).size;
    const score = total > 0 ? shared / total : 0;
    return { u, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const pick = scored[0].u;

  return res.json(toPublic(pick, pick.media));
});

export default router;

