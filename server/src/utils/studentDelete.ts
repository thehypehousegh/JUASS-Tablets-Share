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
