import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { uploadJson } from "../middleware/upload";
import { asyncHandler } from "../utils/asyncHandler";
import { applyBackup, BACKUP_VERSION, buildBackupPayload } from "../utils/backup";
import { secretsMatch } from "../utils/secret";
import { getSyncStatus } from "../sync";

const router = Router();

router.get(
  "/sync-status",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  (_req, res) => {
    res.json(getSyncStatus());
  }
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
