import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { comparePassword } from "../utils/password";
import { clearSession, issueSession, requireAuth } from "../middleware/auth";
import { getSyncStatus, runSyncNow } from "../sync";

const router = Router();
const MAX_FAILED_ATTEMPTS = 5;

// Public: list active users for the login dropdown (no sensitive data).
router.get(
  "/login-options",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    res.json(users);
  })
);

const loginSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(1),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Select your name and enter your password" });
    const { userId, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) {
      return res.status(401).json({ error: "Account not found or disabled. See Admin." });
    }
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      return res.status(423).json({
        error: "This account is blocked after 5 failed attempts. Please see the Admin to unlock it.",
      });
    }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      const attempts = user.failedLoginAttempts + 1;
      const locked = attempts >= MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts, lockedUntil: locked ? new Date() : null },
      });
      if (locked) {
        return res.status(423).json({
          error: "This account is now blocked after 5 failed attempts. Please see the Admin to unlock it.",
        });
      }
      return res.status(401).json({ error: `Incorrect password. ${MAX_FAILED_ATTEMPTS - attempts} attempt(s) left.` });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    issueSession(res, { userId: user.id, role: user.role });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  })
);

const LOGOUT_SYNC_TIMEOUT_MS = 8_000;

router.post(
  "/logout",
  asyncHandler(async (_req, res) => {
    clearSession(res);

    // Push whatever this session worked on as soon as they log out, rather
    // than waiting for the next scheduled sync tick — and tell them whether
    // it actually made it to the cloud, so a distributor working offline
    // knows their session isn't backed up yet rather than assuming it is.
    // No-op (resolves immediately) if auto-sync isn't configured here.
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, LOGOUT_SYNC_TIMEOUT_MS));
    await Promise.race([runSyncNow(), timeout]).catch(() => undefined);

    const status = getSyncStatus();
    res.json({
      ok: true,
      backedUpOnline: status.enabled ? !status.lastError && status.pendingBackupCount === 0 : null,
      pendingBackupCount: status.pendingBackupCount,
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(req.user);
  })
);

const resetRequestSchema = z.object({ userId: z.string().min(1) });

// Any user (even locked out) can flag that they need a password reset.
// A Super Admin sees this on the Users screen and resets it there.
router.post(
  "/request-password-reset",
  asyncHandler(async (req, res) => {
    const parsed = resetRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Select your account first" });
    const user = await prisma.user.update({
      where: { id: parsed.data.userId },
      data: { passwordResetRequested: true },
    }).catch(() => null);
    if (!user) return res.status(404).json({ error: "Account not found" });

    const admins = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", active: true } });
    await prisma.chatMessage.createMany({
      data: admins
        .filter((a) => a.id !== user.id)
        .map((a) => ({
          senderId: user.id,
          recipientId: a.id,
          body: `${user.name} has requested a password reset. Please reset it from Manage Users.`,
        })),
    });

    res.json({ ok: true, message: "Request sent to the Admin. You will be informed once your password is reset." });
  })
);

export default router;
