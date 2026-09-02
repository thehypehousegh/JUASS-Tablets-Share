import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get(
  "/total-tablets",
  asyncHandler(async (_req, res) => {
    const setting = await prisma.setting.findUnique({ where: { key: "totalTablets" } });
    res.json({ totalTablets: setting ? Number(setting.value) : 0 });
  })
);

const setSchema = z.object({ totalTablets: z.number().int().nonnegative() });

router.put(
  "/total-tablets",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = setSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid number of tablets" });
    await prisma.setting.upsert({
      where: { key: "totalTablets" },
      create: { key: "totalTablets", value: String(parsed.data.totalTablets) },
      update: { value: String(parsed.data.totalTablets) },
    });
    res.json({ totalTablets: parsed.data.totalTablets });
  })
);

export default router;
