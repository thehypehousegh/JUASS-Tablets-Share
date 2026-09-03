import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { uploadJson } from "../middleware/upload";
import { asyncHandler } from "../utils/asyncHandler";
import { applyBackup, BACKUP_VERSION, buildBackupPayload } from "../utils/backup";
import { comparePassword } from "../utils/password";
import { secretsMatch } from "../utils/secret";
import { getSyncStatus, runSyncNow } from "../sync";

const router = Router();

// Visible to any logged-in role, not just Admin — a distributor should be
// able to see for themselves whether their session's work has made it to
// the cloud yet, not just be told about it once at logout.
router.get("/sync-status", requireAuth, (_req, res) => {
  res.json(getSyncStatus());
});

// Manual "retry now" — mainly for an Admin to press after confirming
// internet is back, rather than waiting for the next scheduled tick.
router.post(
  "/sync-now",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (_req, res) => {
    await runSyncNow();
    res.json(getSyncStatus());
  })
);

// Full snapshot of every table, downloadable straight to the admin's device
// (PC or mobile browser). Used both as an offline safety backup and as the
// manual way to move data between a local-network instance and an
// internet-hosted one. See POST /sync below for the automatic version of
// this used by local-network deployments.
router.get(
  "/export",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (_req, res) => {
    const backup = await buildBackupPayload();
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=juass-tablets-backup-${new Date().toISOString().slice(0, 10)}.json`
    );
    res.send(JSON.stringify(backup, null, 2));
  })
);

router.post(
  "/import",
  requireAuth,
  requireRole("SUPER_ADMIN"),
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
    const counts = await applyBackup(backup);
    res.json({ ok: true, imported: counts });
  })
);

const resetSchema = z.object({
  password: z.string().min(1, "Enter your password"),
  confirmText: z.string(),
});

// Full data wipe — students, device assignments, issue reports, chat
// messages, and custom field definitions. User accounts are deliberately
// left untouched so nobody (including the admin doing the reset) gets
// locked out, and the school can start re-importing immediately. Gated
// behind the acting admin's own password (re-entered, not just "still
// logged in") plus a literal "DELETE ALL" confirmation, since this cannot
// be undone short of restoring an export from Settings & Backup.
router.post(
  "/system-reset",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request" });
    if (parsed.data.confirmText !== "DELETE ALL") {
      return res.status(400).json({ error: 'Type "DELETE ALL" exactly to confirm' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(401).json({ error: "Session invalid" });
    const passwordOk = await comparePassword(parsed.data.password, user.passwordHash);
    if (!passwordOk) return res.status(401).json({ error: "Incorrect password" });

    const [issueReports, assignments, students, chatMessages, customFields] = await prisma.$transaction([
      prisma.deviceIssueReport.deleteMany({}),
      prisma.deviceAssignment.deleteMany({}),
      prisma.student.deleteMany({}),
      prisma.chatMessage.deleteMany({}),
      prisma.customField.deleteMany({}),
    ]);

    res.json({
      ok: true,
      deleted: {
        students: students.count,
        assignments: assignments.count,
        issueReports: issueReports.count,
        chatMessages: chatMessages.count,
        customFields: customFields.count,
      },
    });
  })
);

// Machine-to-machine push, used by a local-network instance's background
// sync job (see src/sync.ts) to keep an internet-hosted copy up to date
// automatically, without a human ever needing to remember to export/import.
// Authenticated by a shared secret (SYNC_SECRET) instead of a login session,
// since there's no browser involved.
router.post(
  "/sync",
  asyncHandler(async (req, res) => {
    const expected = process.env.SYNC_SECRET;
    if (!expected) return res.status(503).json({ error: "This instance does not accept automatic sync pushes" });
    if (!secretsMatch(req.header("x-sync-secret"), expected)) {
      return res.status(401).json({ error: "Invalid sync secret" });
    }

    const backup = req.body;
    if (!backup || backup.version !== BACKUP_VERSION) {
      return res.status(400).json({ error: "Unrecognized or incompatible backup payload" });
    }
    const counts = await applyBackup(backup);
    res.json({ ok: true, imported: counts });
  })
);

export default router;
