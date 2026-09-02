import { Router } from "express";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { uploadJson } from "../middleware/upload";

const router = Router();
router.use(requireAuth, requireRole("SUPER_ADMIN"));

const BACKUP_VERSION = 1;

// Full snapshot of every table, downloadable straight to the admin's device
// (PC or mobile browser). Used both as an offline safety backup and as the
// mechanism to periodically move data between a local-network instance and
// an internet-hosted instance: export on one, import on the other.
router.get(
  "/export",
  asyncHandler(async (_req, res) => {
    const [users, students, assignments, issueReports, chatMessages, settings] = await Promise.all([
      prisma.user.findMany(),
      prisma.student.findMany(),
      prisma.deviceAssignment.findMany(),
      prisma.deviceIssueReport.findMany(),
      prisma.chatMessage.findMany(),
      prisma.setting.findMany(),
    ]);

    const backup = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      users,
      students,
      assignments,
      issueReports,
      chatMessages,
      settings,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=juass-tablets-backup-${new Date().toISOString().slice(0, 10)}.json`
    );
    res.send(JSON.stringify(backup, null, 2));
  })
);

// Restore/merge: upserts every record by its original id, so importing the
// same backup twice is safe. Existing local records not present in the
// backup are left untouched (never destructive).
router.post(
  "/import",
  uploadJson.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Upload a backup .json file" });
    let backup: any;
    try {
      backup = JSON.parse(req.file.buffer.toString("utf-8"));
    } catch {
      return res.status(400).json({ error: "This file is not valid JSON" });
    }
    if (!backup || backup.version !== BACKUP_VERSION) {
      return res.status(400).json({ error: "Unrecognized or incompatible backup file" });
    }

    const counts = { users: 0, students: 0, assignments: 0, issueReports: 0, chatMessages: 0, settings: 0 };

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

    res.json({ ok: true, imported: counts });
  })
);

export default router;
