import { prisma } from "../db";

export interface DeleteCounts {
  deletedStudents: number;
  deletedAssignments: number;
  deletedIssueReports: number;
}

// Cascades a student deletion down through their device assignments and
// any issue reports tied to those assignments — shared by bulk-delete,
// the data-retention purge, and single-student erasure, so the three
// destructive student-removal paths in the app can never drift apart on
// what "delete a student" actually cascades to.
export async function deleteStudentsByIds(studentIds: string[]): Promise<DeleteCounts> {
  if (studentIds.length === 0) {
    return { deletedStudents: 0, deletedAssignments: 0, deletedIssueReports: 0 };
  }
  const [issueReports, assignments, deletedStudents] = await prisma.$transaction([
    prisma.deviceIssueReport.deleteMany({ where: { assignment: { studentId: { in: studentIds } } } }),
    prisma.deviceAssignment.deleteMany({ where: { studentId: { in: studentIds } } }),
    prisma.student.deleteMany({ where: { id: { in: studentIds } } }),
  ]);
  return {
    deletedStudents: deletedStudents.count,
    deletedAssignments: assignments.count,
    deletedIssueReports: issueReports.count,
  };
}

export interface ResetAssignmentsCounts {
  deletedAssignments: number;
  deletedIssueReports: number;
}

// Wipes a single student's entire device-assignment history (current and
// past) without touching the student record itself — used by the
// Assignments page's Reset action to undo an assignment made in error.
// Deleting the row (rather than just marking it returned) also frees up
// its IMEI/Serial Number/Embossment Number, which are globally unique, so
// a mistaken entry doesn't permanently block that device from ever being
// used again.
export async function resetStudentAssignments(studentId: string): Promise<ResetAssignmentsCounts> {
  const [issueReports, assignments] = await prisma.$transaction([
    prisma.deviceIssueReport.deleteMany({ where: { assignment: { studentId } } }),
    prisma.deviceAssignment.deleteMany({ where: { studentId } }),
  ]);
  return { deletedAssignments: assignments.count, deletedIssueReports: issueReports.count };
}
