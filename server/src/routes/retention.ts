import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { computeFormStatus, yearsSinceCompletion } from "../utils/academicYear";
import { recordAudit } from "../utils/auditLog";
import { deleteStudentsByIds } from "../utils/studentDelete";

const router = Router();
router.use(requireAuth, requireRole("SUPER_ADMIN"));

const POLICY_KEY = "retentionYearsAfterCompletion";

router.get(
  "/policy",
  asyncHandler(async (_req, res) => {
    const setting = await prisma.setting.findUnique({ where: { key: POLICY_KEY } });
    res.json({ retentionYears: setting ? Number(setting.value) : null });
  })
);

const policySchema = z.object({ retentionYears: z.number().int().min(0).max(50) });

router.put(
  "/policy",
  asyncHandler(async (req, res) => {
    const parsed = policySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid number of years (0 or more)" });
    await prisma.setting.upsert({
      where: { key: POLICY_KEY },
      create: { key: POLICY_KEY, value: String(parsed.data.retentionYears) },
      update: { value: String(parsed.data.retentionYears) },
    });
    await recordAudit(req, {
      action: "retention.setPolicy",
      details: { retentionYears: parsed.data.retentionYears },
    });
    res.json({ retentionYears: parsed.data.retentionYears });
  })
);

// A graduated student is only eligible for retention purge once every
// device they've ever held is accounted for (returned, or reported
// missing) — never while a device is still recorded as with them, so the
// purge can't silently erase the one record proving a tablet is
// outstanding. Mirrors the "Completed but Not Returned" report's rule.
async function findEligibleStudents(retentionYears: number) {
  const students = await prisma.student.findMany({
    include: {
      assignments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { issueReports: true },
      },
    },
    take: 20000,
  });

  return students.filter((s) => {
    if (computeFormStatus(s.admissionYear) !== "COMPLETED") return false;
    const years = yearsSinceCompletion(s.admissionYear);
    if (years === null || years < retentionYears) return false;
    const latest = s.assignments[0];
    if (latest && latest.status === "WITH_STUDENT" && !latest.issueReports.some((r) => r.type === "MISSING")) {
      return false;
    }
    return true;
  });
}

router.get(
  "/preview",
  asyncHandler(async (req, res) => {
    const setting = await prisma.setting.findUnique({ where: { key: POLICY_KEY } });
    const retentionYears = setting ? Number(setting.value) : null;
    if (retentionYears === null) {
      return res.status(400).json({ error: "Set a retention policy first" });
    }
    const eligible = await findEligibleStudents(retentionYears);
    res.json({
      retentionYears,
      studentCount: eligible.length,
      students: eligible.map((s) => ({
        id: s.id,
        indexNumber: s.indexNumber,
        fullName: s.fullName,
        className: s.className,
        admissionYear: s.admissionYear,
        yearsSinceCompletion: yearsSinceCompletion(s.admissionYear),
      })),
    });
  })
);

const purgeSchema = z.object({ confirmText: z.string() });

router.post(
  "/purge",
  asyncHandler(async (req, res) => {
    const parsed = purgeSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.confirmText !== "PURGE") {
      return res.status(400).json({ error: 'Type "PURGE" exactly to confirm' });
    }
    const setting = await prisma.setting.findUnique({ where: { key: POLICY_KEY } });
    const retentionYears = setting ? Number(setting.value) : null;
    if (retentionYears === null) {
      return res.status(400).json({ error: "Set a retention policy first" });
    }
    const eligible = await findEligibleStudents(retentionYears);
    const counts = await deleteStudentsByIds(eligible.map((s) => s.id));
    if (counts.deletedStudents > 0) {
      await recordAudit(req, {
        action: "retention.purge",
        targetType: "Student",
        targetLabel: `${counts.deletedStudents} student record(s), ${retentionYears}+ years graduated`,
        details: counts,
      });
    }
    res.json(counts);
  })
);

export default router;
