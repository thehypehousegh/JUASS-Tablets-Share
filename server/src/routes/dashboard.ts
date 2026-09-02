import { Router } from "express";
import { Prisma } from "@prisma/client";
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

type StudentWithAssignment = Awaited<ReturnType<typeof fetchStudentsWithAssignmentFlag>>[number];

function fetchStudentsWithAssignmentFlag(where: Prisma.StudentWhereInput) {
  return prisma.student.findMany({
    where,
    include: {
      assignments: { where: { status: { in: ["WITH_STUDENT", "REPLACED"] } }, take: 1, orderBy: { createdAt: "desc" } },
    },
  });
}

function groupByKey(students: StudentWithAssignment[], keyOf: (s: StudentWithAssignment) => string) {
  const groups = new Map<string, { assigned: StudentWithAssignment[]; notReceived: StudentWithAssignment[] }>();
  for (const s of students) {
    const key = keyOf(s);
    if (!groups.has(key)) groups.set(key, { assigned: [], notReceived: [] });
    const bucket = groups.get(key)!;
    if (s.assignments.length > 0) bucket.assigned.push(s);
    else bucket.notReceived.push(s);
  }
  return groups;
}

router.get(
  "/by-class",
  asyncHandler(async (req, res) => {
    const year = req.query.year ? String(req.query.year) : undefined;
    const students = await fetchStudentsWithAssignmentFlag(year ? { admissionYear: year } : {});

    const byClass = groupByKey(students, (s) => s.className || "Unassigned Class");
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

router.get(
  "/by-year",
  asyncHandler(async (_req, res) => {
    const students = await fetchStudentsWithAssignmentFlag({});

    const byYear = groupByKey(students, (s) => s.admissionYear || "Unspecified Year Group");
    const result = Array.from(byYear.entries())
      .map(([yearGroup, bucket]) => ({
        yearGroup,
        assignedCount: bucket.assigned.length,
        notReceivedCount: bucket.notReceived.length,
        assignedStudents: bucket.assigned.map((s) => ({ indexNumber: s.indexNumber, fullName: s.fullName })),
        notReceivedStudents: bucket.notReceived.map((s) => ({ indexNumber: s.indexNumber, fullName: s.fullName })),
      }))
      .sort((a, b) => b.yearGroup.localeCompare(a.yearGroup));

    res.json(result);
  })
);

export default router;
