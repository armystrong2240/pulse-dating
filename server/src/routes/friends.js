import crypto from "crypto";
import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const userSelect = { id: true, name: true, avatar: true, city: true, age: true };

// Helper: canonical friendship row between two users
async function getFriendship(aId, bId) {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: aId, addresseeId: bId },
        { requesterId: bId, addresseeId: aId },
      ],
    },
  });
}

// ── GET /friends — list accepted friends ────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const myId = req.user.id;
  const rows = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: myId }, { addresseeId: myId }],
    },
    include: {
      requester: { select: userSelect },
      addressee: { select: userSelect },
    },
  });

  const friends = rows.map((r) =>
    r.requesterId === myId ? r.addressee : r.requester
  );
  return res.json(friends);
});

// ── GET /friends/requests — incoming pending requests ───────────────────────
router.get("/requests", requireAuth, async (req, res) => {
  const myId = req.user.id;
  const rows = await prisma.friendship.findMany({
    where: { addresseeId: myId, status: "pending" },
    include: { requester: { select: userSelect } },
  });
  return res.json(rows.map((r) => ({ friendshipId: r.id, user: r.requester, createdAt: r.createdAt })));
});

// ── GET /friends/sent — outgoing pending requests ───────────────────────────
router.get("/sent", requireAuth, async (req, res) => {
  const myId = req.user.id;
  const rows = await prisma.friendship.findMany({
    where: { requesterId: myId, status: "pending" },
    include: { addressee: { select: userSelect } },
  });
  return res.json(rows.map((r) => ({ friendshipId: r.id, user: r.addressee, createdAt: r.createdAt })));
});

// ── GET /friends/status/:userId — relationship status with a specific user ──
router.get("/status/:userId", requireAuth, async (req, res) => {
  const f = await getFriendship(req.user.id, req.params.userId);
  if (!f) return res.json({ status: "none" });
  return res.json({ status: f.status, friendshipId: f.id, isSender: f.requesterId === req.user.id });
});

// ── POST /friends/request/:userId — send friend request ─────────────────────
router.post("/request/:userId", requireAuth, async (req, res) => {
  const myId = req.user.id;
  const targetId = req.params.userId;
  if (myId === targetId) return res.status(400).json({ error: "Cannot friend yourself" });

  const existing = await getFriendship(myId, targetId);
  if (existing) return res.status(409).json({ error: "Request already exists", status: existing.status });

  const friendship = await prisma.friendship.create({
    data: { id: crypto.randomUUID(), requesterId: myId, addresseeId: targetId },
  });

  // Notify target via socket
  const { io, userSockets } = req.app.locals;
  if (io && userSockets) {
    const sender = await prisma.user.findUnique({ where: { id: myId }, select: userSelect });
    userSockets.get(targetId)?.forEach((sid) =>
      io.to(sid).emit("friend:request", { friendshipId: friendship.id, user: sender })
    );
  }

  return res.status(201).json(friendship);
});

// ── POST /friends/accept/:friendshipId ──────────────────────────────────────
router.post("/accept/:friendshipId", requireAuth, async (req, res) => {
  const myId = req.user.id;
  const f = await prisma.friendship.findUnique({ where: { id: req.params.friendshipId } });
  if (!f || f.addresseeId !== myId) return res.status(403).json({ error: "Not your request to accept" });
  if (f.status !== "pending") return res.status(409).json({ error: "Already resolved" });

  const updated = await prisma.friendship.update({
    where: { id: f.id },
    data: { status: "accepted" },
  });

  // Notify requester
  const { io, userSockets } = req.app.locals;
  if (io && userSockets) {
    const accepter = await prisma.user.findUnique({ where: { id: myId }, select: userSelect });
    userSockets.get(f.requesterId)?.forEach((sid) =>
      io.to(sid).emit("friend:accepted", { friendshipId: f.id, user: accepter })
    );
  }

  return res.json(updated);
});

// ── POST /friends/decline/:friendshipId ─────────────────────────────────────
router.post("/decline/:friendshipId", requireAuth, async (req, res) => {
  const myId = req.user.id;
  const f = await prisma.friendship.findUnique({ where: { id: req.params.friendshipId } });
  if (!f || f.addresseeId !== myId) return res.status(403).json({ error: "Not your request" });

  await prisma.friendship.update({ where: { id: f.id }, data: { status: "declined" } });
  return res.json({ ok: true });
});

// ── DELETE /friends/:userId — unfriend ──────────────────────────────────────
router.delete("/:userId", requireAuth, async (req, res) => {
  const myId = req.user.id;
  const f = await getFriendship(myId, req.params.userId);
  if (!f) return res.status(404).json({ error: "No friendship found" });

  await prisma.friendship.delete({ where: { id: f.id } });
  return res.json({ ok: true });
});

// ── DELETE /friends/cancel/:userId — cancel outgoing request ────────────────
router.delete("/cancel/:userId", requireAuth, async (req, res) => {
  const myId = req.user.id;
  const f = await prisma.friendship.findFirst({
    where: { requesterId: myId, addresseeId: req.params.userId, status: "pending" },
  });
  if (!f) return res.status(404).json({ error: "No pending request found" });

  await prisma.friendship.delete({ where: { id: f.id } });
  return res.json({ ok: true });
});

export default router;
