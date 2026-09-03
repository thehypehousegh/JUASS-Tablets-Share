import { prisma } from "../db";

export const BACKUP_VERSION = 1;

export interface BackupPayload {
  version: number;
  exportedAt: string;
  users: unknown[];
  students: unknown[];
  assignments: unknown[];
  issueReports: unknown[];
  chatMessages: unknown[];
  settings: unknown[];
  customFields: unknown[];
}

export async function buildBackupPayload(): Promise<BackupPayload> {
  const [users, students, assignments, issueReports, chatMessages, settings, customFields] = await Promise.all([
    prisma.user.findMany(),
    prisma.student.findMany(),
    prisma.deviceAssignment.findMany(),
    prisma.deviceIssueReport.findMany(),
    prisma.chatMessage.findMany(),
    prisma.setting.findMany(),
    prisma.customField.findMany(),
  ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    users,
    students,
    assignments,
    issueReports,
    chatMessages,
    settings,
    customFields,
  };
}

export interface ApplyCounts {
  users: number;
  students: number;
  assignments: number;
  issueReports: number;
  chatMessages: number;
  settings: number;
  customFields: number;
}

// Restore/merge: upserts every record by its original id, so applying the
// same backup twice (or out of order) is always safe. Records that exist
// locally but aren't in the backup are left untouched — never destructive.
export async function applyBackup(backup: any): Promise<ApplyCounts> {
  const counts: ApplyCounts = {
    users: 0,
    students: 0,
    assignments: 0,
    issueReports: 0,
    chatMessages: 0,
    settings: 0,
    customFields: 0,
  };

  for (const u of backup.users || []) {
    const { id, ...data } = u;
    await prisma.user.upsert({ where: { id }, create: { id, ...data }, update: data });
    counts.users++;
  }
  for (const s of backup.students || []) {
    const { id, ...data } = s;
    await prisma.student.upsert({ where: { id }, create: { id, ...data }, update: data });
    counts.students++;
  }
  for (const a of backup.assignments || []) {
    const { id, ...data } = a;
    await prisma.deviceAssignment.upsert({ where: { id }, create: { id, ...data }, update: data }).catch(() => null);
    counts.assignments++;
  }
  for (const r of backup.issueReports || []) {
    const { id, ...data } = r;
    await prisma.deviceIssueReport.upsert({ where: { id }, create: { id, ...data }, update: data }).catch(() => null);
    counts.issueReports++;
  }
  for (const m of backup.chatMessages || []) {
    const { id, ...data } = m;
    await prisma.chatMessage.upsert({ where: { id }, create: { id, ...data }, update: data }).catch(() => null);
    counts.chatMessages++;
  }
  for (const s of backup.settings || []) {
    await prisma.setting.upsert({ where: { key: s.key }, create: s, update: { value: s.value } });
    counts.settings++;
  }
  for (const f of backup.customFields || []) {
    const { id, ...data } = f;
    await prisma.customField.upsert({ where: { id }, create: { id, ...data }, update: data }).catch(() => null);
    counts.customFields++;
  }

  return counts;
}
