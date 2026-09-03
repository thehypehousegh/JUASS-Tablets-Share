import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { recordAudit } from "../utils/auditLog";

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

function normalize(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Common spellings for the one built-in field where a duplicate custom
// field genuinely causes confusion — a per-student index-number-like
// value that can silently drift from the real, unique indexNumber column.
// (Client-side AssignmentForm.tsx keeps a matching list to hide any such
// field that slips in some other way, e.g. from data imported before this
// guard existed.)
const INDEX_NUMBER_SYNONYMS = new Set([
  "indexno",
  "indexnumber",
  "indexnum",
  "idno",
  "studentid",
  "studentindex",
  "admissionno",
  "admissionnumber",
]);

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

    if (INDEX_NUMBER_SYNONYMS.has(normalize(label))) {
      return res.status(400).json({
        error: 'This duplicates the built-in Index Number field — map the file column to "Index Number" instead of creating a new field for it.',
      });
    }

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
    await recordAudit(req, {
      action: "customField.create",
      targetType: "CustomField",
      targetId: field.id,
      targetLabel: field.label,
    });
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
    const field = await prisma.customField.delete({ where: { id: req.params.id } }).catch(() => null);
    if (field) {
      await recordAudit(req, {
        action: "customField.delete",
        targetType: "CustomField",
        targetId: field.id,
        targetLabel: field.label,
      });
    }
    res.status(204).end();
  })
);

export default router;
