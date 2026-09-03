import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

function slugify(label: string) {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field"
  );
}

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const fields = await prisma.customField.findMany({ orderBy: { createdAt: "asc" } });
    res.json(fields);
  })
);

const createSchema = z.object({ label: z.string().trim().min(1, "Enter a name for the field") });

router.post(
  "/",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid data" });
    const label = parsed.data.label;

    const existing = await prisma.customField.findFirst({ where: { label: { equals: label, mode: "insensitive" } } });
    if (existing) return res.json(existing);

    const base = slugify(label);
    let key = base;
    let suffix = 2;
    // Guard against two differently-worded labels slugifying to the same key.
    while (await prisma.customField.findUnique({ where: { key } })) {
      key = `${base}_${suffix++}`;
    }

    const field = await prisma.customField.create({ data: { key, label } });
    res.status(201).json(field);
  })
);

router.delete(
  "/:id",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    // Only removes the field definition itself — any values already saved
    // under this key in a student's extraFields are left in place, so
    // deleting a field by mistake doesn't silently destroy imported data.
    await prisma.customField.delete({ where: { id: req.params.id } }).catch(() => null);
    res.status(204).end();
  })
);

export default router;
