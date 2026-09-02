import { Router } from "express";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const [totalStudents, totalTabletsSetting, withStudent, replaced, returned, faultyApproved, missingApproved, pendingIssues] =
      await Promise.all([
        prisma.student.count(),
        prisma.setting.findUnique({ where: { key: "totalTablets" } }),
        prisma.deviceAssignment.count({ where: { status: "WITH_STUDENT" } }),
        prisma.deviceAssignment.count({ where: { status: "REPLACED" } }),
        prisma.deviceAssignment.count({ where: { status: "RETURNED" } }),
        prisma.deviceIssueReport.count({ where: { type: "FAULTY", status: "APPROVED" } }),
        prisma.deviceIssueReport.count({ where: { type: "MISSING", status: "APPROVED" } }),
        prisma.deviceIssueReport.count({ where: { status: "PENDING" } }),
      ]);

    const assignedStudentIds = await prisma.deviceAssignment.findMany({
      where: { status: { in: ["WITH_STUDENT", "REPLACED"] } },
      select: { studentId: true },
      distinct: ["studentId"],
    });
    const notReceived = totalStudents - assignedStudentIds.length;

    res.json({
      totalTablets: totalTabletsSetting ? Number(totalTabletsSetting.value) : 0,
      totalStudents,
      assigned: withStudent,
      replaced,
      returned,
      notReceived: Math.max(notReceived, 0),
      faulty: faultyApproved,
      missing: missingApproved,
      pendingIssues,
    });
  })
);

router.get(
  "/by-class",
  asyncHandler(async (_req, res) => {
    const students = await prisma.student.findMany({
      include: {
        assignments: { where: { status: { in: ["WITH_STUDENT", "REPLACED"] } }, take: 1, orderBy: { createdAt: "desc" } },
      },
    });

    const byClass = new Map<string, { assigned: typeof students; notReceived: typeof students }>();
    for (const s of students) {
      const cls = s.className || "Unassigned Class";
      if (!byClass.has(cls)) byClass.set(cls, { assigned: [], notReceived: [] });
      const bucket = byClass.get(cls)!;
      if (s.assignments.length > 0) bucket.assigned.push(s);
      else bucket.notReceived.push(s);
    }

    const result = Array.from(byClass.entries())
      .map(([className, bucket]) => ({
        className,
        assignedCount: bucket.assigned.length,
        notReceivedCount: bucket.notReceived.length,
        assignedStudents: bucket.assigned.map((s) => ({ indexNumber: s.indexNumber, fullName: s.fullName })),
        notReceivedStudents: bucket.notReceived.map((s) => ({ indexNumber: s.indexNumber, fullName: s.fullName })),
      }))
      .sort((a, b) => a.className.localeCompare(b.className));

    res.json(result);
  })
);

export default router;
