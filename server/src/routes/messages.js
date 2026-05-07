import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { sendPushToUser } from "./push.js";
import { moderateText } from "../lib/aiServices.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "..", "..", "uploads");

const router = Router();

// ── GET /conversations — list all DM threads for the current user ──────────
router.get("/conversations", requireAuth, async (req, res) => {
  const myId = req.user.id;

  // Get all roomIds where this user has sent or received a message
  const sent = await prisma.message.findMany({
    where: { senderId: myId },
    select: { roomId: true },
    distinct: ["roomId"],
  });

  // For DM rooms, roomId is the OTHER user's id (convention used throughout)
  // Also check rooms where my id IS the roomId (other user messaged me)
  const myRooms = new Set(sent.map((m) => m.roomId));
  // Find rooms where roomId === myId (i.e. other users DMed me)
  const received = await prisma.message.findMany({
    where: { roomId: myId },
    select: { senderId: true },
    distinct: ["senderId"],
  });
  received.forEach((m) => myRooms.add(m.senderId));

  // For each room, get the other user's profile + last message + unread count
  const conversations = await Promise.all(
    [...myRooms]
      .filter((id) => id !== "global" && id !== myId)
      .map(async (otherId) => {
        // roomId is always the OTHER person's id (the one being visited)
        const roomId = otherId;

        const [otherUser, lastMsg, unreadCount] = await Promise.all([
          prisma.user.findUnique({
            where: { id: otherId },
            select: { id: true, name: true, avatar: true },
          }),
          prisma.message.findFirst({
            where: { roomId },
            orderBy: { createdAt: "desc" },
            include: { reactions: { select: { userId: true, emoji: true } } },
          }),
          prisma.message.count({
            where: { roomId, senderId: { not: myId }, readAt: null },
          }),
        ]);

        if (!otherUser || !lastMsg) return null;
        return { user: otherUser, lastMessage: lastMsg, unreadCount };
      })
  );

  const sorted = conversations
    .filter(Boolean)
    .sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));

  return res.json(sorted);
});

router.get("/", requireAuth, async (req, res) => {
  const roomId = (req.query.roomId || "global").toString();
  const search = (req.query.search || "").toString().trim();

  const where = { roomId };
  if (search) {
    where.text = { contains: search };
  }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: { reactions: { select: { userId: true, emoji: true } } },
  });
  return res.json(messages);
});

router.post("/", requireAuth, async (req, res) => {
  const { roomId = "global", text } = req.body;
  if (!text && !req.body.imageUrl) return res.status(400).json({ error: "text or imageUrl is required" });

  // AI content moderation (non-blocking — if AI is down, message still sends)
  if (text) {
    const mod = await moderateText(text);
    if (!mod.safe) {
      return res.status(422).json({
        error: "Your message was flagged by our content filter. Please keep conversations respectful.",
        flaggedCategories: mod.flaggedCategories,
      });
    }
  }

  const sender = await prisma.user.findUnique({ where: { id: req.user.id } });
  const message = await prisma.message.create({
    data: {
      id: crypto.randomUUID(),
      senderId: req.user.id,
      senderName: sender?.name || "Unknown",
      roomId,
      text: text || "",
      imageUrl: req.body.imageUrl || null,
    },
    include: { reactions: true },
  });

  // Real-time: broadcast to room via socket
  const { io, userSockets } = req.app.locals;
  io?.to(roomId).emit("chat:new_message", message);

  // Push notification to the other user in a DM room (roomId format: "dm-<userId1>-<userId2>")
  if (roomId.startsWith("dm-")) {
    const parts = roomId.split("-");
    const otherUserId = parts.find((p) => p !== "dm" && p !== req.user.id);
    if (otherUserId) {
      const isConnected = userSockets?.get(otherUserId)?.size > 0;
      if (!isConnected) {
        await sendPushToUser(
          otherUserId,
          `New message from ${sender?.name || "Someone"}`,
          text ? text.slice(0, 80) : "Sent you an image",
          `/chat/${req.user.id}`
        );
      }
    }
  }

  return res.status(201).json(message);
});

// ── POST /upload-image — upload an inline chat image ──────────────────────
router.post("/upload-image", requireAuth, async (req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    try {
      const buf = Buffer.concat(chunks);
      const contentType = req.headers["content-type"] || "";
      const ext = contentType.includes("png") ? "png"
        : contentType.includes("gif") ? "gif"
        : contentType.includes("webp") ? "webp"
        : "jpg";
      const filename = `chat_${crypto.randomUUID()}.${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(filePath, buf);
      return res.json({ url: `/uploads/${filename}` });
    } catch (e) {
      return res.status(500).json({ error: "Upload failed" });
    }
  });
});

// Mark room messages as read
router.post("/read", requireAuth, async (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: "roomId required" });
  const now = new Date();
  await prisma.message.updateMany({
    where: { roomId, senderId: { not: req.user.id }, readAt: null },
    data: { readAt: now },
  });
  // Notify sender(s) their messages were read
  const { io, userSockets } = req.app.locals;
  if (io && userSockets) {
    // Notify the other user in the room (roomId === their userId for DMs)
    userSockets.get(roomId)?.forEach((sid) =>
      io.to(sid).emit("chat:read", { roomId, readAt: now })
    );
  }
  return res.json({ ok: true });
});

// Add/change emoji reaction to a message
router.post("/react", requireAuth, async (req, res) => {
  const { messageId, emoji } = req.body;
  if (!messageId || !emoji) return res.status(400).json({ error: "messageId and emoji required" });

  const reaction = await prisma.messageReaction.upsert({
    where: { messageId_userId: { messageId, userId: req.user.id } },
    update: { emoji },
    create: { id: crypto.randomUUID(), messageId, userId: req.user.id, emoji },
  });

  // Get roomId to broadcast
  const msg = await prisma.message.findUnique({ where: { id: messageId }, select: { roomId: true } });
  if (msg) {
    const { io } = req.app.locals;
    io?.to(msg.roomId).emit("chat:reaction", { messageId, userId: req.user.id, emoji });
  }

  return res.json(reaction);
});

// Remove reaction
router.delete("/react/:messageId", requireAuth, async (req, res) => {
  await prisma.messageReaction.deleteMany({
    where: { messageId: req.params.messageId, userId: req.user.id },
  });
  return res.json({ ok: true });
});

export default router;

