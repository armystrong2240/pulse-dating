import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const TicketSchema = z.object({
  message: z.string().min(10).max(5000),
  type: z.enum(["bug", "feedback", "other"]).default("bug"),
  page: z.string().max(200).optional(),
});

// POST /support/report — submit a support ticket (auth optional)
router.post("/report", async (req, res) => {
  const parsed = TicketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const userId = req.user?.id ?? null; // populated by optional auth
  const userAgent = req.headers["user-agent"] || "";
  const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString().split(",")[0].trim();
  const metadata = JSON.stringify({ ip });

  const ticket = await prisma.supportTicket.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      message: parsed.data.message,
      type: parsed.data.type,
      page: parsed.data.page || "",
      userAgent,
      metadata,
    },
  });

  return res.status(201).json({ ok: true, id: ticket.id });
});

// PATCH /support/tickets/:id — admin resolve/update (requires auth + admin check)
router.patch("/tickets/:id", requireAuth, async (req, res) => {
  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean);
  if (!ADMIN_EMAILS.includes(req.user?.email)) {
    return res.status(403).json({ error: "Admin only." });
  }
  const { status } = req.body;
  if (!["open", "in_progress", "resolved"].includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }
  const ticket = await prisma.supportTicket.update({
    where: { id: req.params.id },
    data: { status },
  });
  return res.json({ ok: true, ticket });
});

export default router;
