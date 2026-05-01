import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/rooms", requireAuth, async (_req, res) => {
  const rooms = await prisma.liveRoom.findMany({
    where: { active: true },
    orderBy: { startedAt: "desc" },
  });
  return res.json(rooms);
});

router.post("/start", requireAuth, async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });

  const host = await prisma.user.findUnique({ where: { id: req.user.id } });
  const room = await prisma.liveRoom.create({
    data: {
      hostId: req.user.id,
      hostName: host?.name || "Unknown",
      title,
    },
  });
  return res.status(201).json(room);
});

router.delete("/rooms/:id", requireAuth, async (req, res) => {
  const room = await prisma.liveRoom.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: "Room not found" });
  if (room.hostId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await prisma.liveRoom.update({
    where: { id: req.params.id },
    data: { active: false },
  });
  return res.json({ ended: true });
});

export default router;

