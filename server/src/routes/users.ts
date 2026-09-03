import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { generateTempPassword, hashPassword } from "../utils/password";
import { recordAudit } from "../utils/auditLog";

const router = Router();
router.use(requireAuth, requireRole("SUPER_ADMIN"));

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        contact: true,
        role: true,
        active: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        passwordResetRequested: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
    res.json(users);
  })
);

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  contact: z.string().optional(),
  role: z.nativeEnum(Role),
  password: z.string().min(6).optional(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid data" });
    const { name, email, contact, role, password } = parsed.data;

    const tempPassword = password || generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const user = await prisma.user
      .create({ data: { name, email, contact, role, passwordHash } })
      .catch(() => null);
    if (!user) return res.status(409).json({ error: "A user with this email already exists" });

    await recordAudit(req, {
      action: "user.create",
      targetType: "User",
      targetId: user.id,
      targetLabel: `${user.name} <${user.email}>`,
      details: { role: user.role },
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      temporaryPassword: password ? undefined : tempPassword,
    });
  })
);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  contact: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
});

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid data" });
    const user = await prisma.user.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null);
    if (!user) return res.status(404).json({ error: "User not found" });
    await recordAudit(req, {
      action: "user.update",
      targetType: "User",
      targetId: user.id,
      targetLabel: `${user.name} <${user.email}>`,
      details: { fields: Object.keys(parsed.data) },
    });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active });
  })
);

router.post(
  "/:id/unlock",
  asyncHandler(async (req, res) => {
    const user = await prisma.user
      .update({ where: { id: req.params.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
      .catch(() => null);
    if (!user) return res.status(404).json({ error: "User not found" });
    await recordAudit(req, {
      action: "user.unlock",
      targetType: "User",
      targetId: user.id,
      targetLabel: `${user.name} <${user.email}>`,
    });
    res.json({ ok: true });
  })
);

const resetPasswordSchema = z.object({ newPassword: z.string().min(6).optional() });

router.post(
  "/:id/reset-password",
  asyncHandler(async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    const newPassword = parsed.success && parsed.data.newPassword ? parsed.data.newPassword : generateTempPassword();
    const passwordHash = await hashPassword(newPassword);
    const user = await prisma.user
      .update({
        where: { id: req.params.id },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null, passwordResetRequested: false },
      })
      .catch(() => null);
    if (!user) return res.status(404).json({ error: "User not found" });

    await prisma.chatMessage.create({
      data: {
        senderId: req.user!.id,
        recipientId: user.id,
        body: `Your password has been reset by the Admin. Your new temporary password is: ${newPassword}. Please keep it safe.`,
      },
    });

    // Never store the plaintext password in the audit trail — only that a
    // reset happened, same as the target user's identity.
    await recordAudit(req, {
      action: "user.resetPassword",
      targetType: "User",
      targetId: user.id,
      targetLabel: `${user.name} <${user.email}>`,
    });

    res.json({ ok: true, newPassword });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) {
      return res.status(400).json({ error: "You cannot deactivate your own account" });
    }
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { active: false } }).catch(() => null);
    if (!user) return res.status(404).json({ error: "User not found" });
    await recordAudit(req, {
      action: "user.deactivate",
      targetType: "User",
      targetId: user.id,
      targetLabel: `${user.name} <${user.email}>`,
    });
    res.json({ ok: true });
  })
);

export default router;
