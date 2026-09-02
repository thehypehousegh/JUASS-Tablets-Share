import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// Everyone can message everyone internally (small, trusted user base).
router.get(
  "/contacts",
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { active: true, id: { not: req.user!.id } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });

    const unread = await prisma.chatMessage.groupBy({
      by: ["senderId"],
      where: { recipientId: req.user!.id, readAt: null },
      _count: { _all: true },
    });
    const unreadMap = new Map(unread.map((u) => [u.senderId, u._count._all]));

    res.json(users.map((u) => ({ ...u, unread: unreadMap.get(u.id) || 0 })));
  })
);

router.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const count = await prisma.chatMessage.count({ where: { recipientId: req.user!.id, readAt: null } });
    res.json({ count });
  })
);

router.get(
  "/thread/:userId",
  asyncHandler(async (req, res) => {
    const otherId = req.params.userId;
    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: req.user!.id, recipientId: otherId },
          { senderId: otherId, recipientId: req.user!.id },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    await prisma.chatMessage.updateMany({
      where: { senderId: otherId, recipientId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });

    res.json(messages);
  })
);

const sendSchema = z.object({ body: z.string().min(1).max(2000) });

router.post(
  "/thread/:userId",
  asyncHandler(async (req, res) => {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Message cannot be empty" });
    const message = await prisma.chatMessage.create({
      data: { senderId: req.user!.id, recipientId: req.params.userId, body: parsed.data.body },
    });
    res.status(201).json(message);
  })
);

export default router;
