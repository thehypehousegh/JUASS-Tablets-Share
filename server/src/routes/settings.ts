import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { STUDENT_FIELDS } from "./students";

const router = Router();
router.use(requireAuth);

const HIDDEN_FIELDS_KEY = "hiddenStudentFields";
// Index Number and Full Name are always shown — hiding a student's own
// identity from their own record list isn't a real use case.
const HIDEABLE_KEYS: Set<string> = new Set(STUDENT_FIELDS.filter((f) => !f.required).map((f) => f.key));

router.get(
  "/hidden-fields",
  asyncHandler(async (_req, res) => {
    const setting = await prisma.setting.findUnique({ where: { key: HIDDEN_FIELDS_KEY } });
    let hiddenFields: string[] = [];
    if (setting) {
      try {
        hiddenFields = JSON.parse(setting.value);
      } catch {
        hiddenFields = [];
      }
    }
    res.json({ hiddenFields: hiddenFields.filter((k) => HIDEABLE_KEYS.has(k)) });
  })
);

const hiddenFieldsSchema = z.object({ hiddenFields: z.array(z.string()) });

// Which built-in Student fields to hide from the Student Records table —
// a school-wide display preference, not tied to any one import. Surfaced
// mainly as a toggle at import time for fields that batch didn't populate,
// but it's just this one setting either way.
router.put(
  "/hidden-fields",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = hiddenFieldsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid data" });
    const hiddenFields = [...new Set(parsed.data.hiddenFields.filter((k) => HIDEABLE_KEYS.has(k)))];
    await prisma.setting.upsert({
      where: { key: HIDDEN_FIELDS_KEY },
      create: { key: HIDDEN_FIELDS_KEY, value: JSON.stringify(hiddenFields) },
      update: { value: JSON.stringify(hiddenFields) },
    });
    res.json({ hiddenFields });
  })
);

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
