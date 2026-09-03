import { Request } from "express";
import { prisma } from "../db";

interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  // Loosely typed on purpose — callers pass whatever plain-object summary
  // makes sense for that action (counts, changed field names, etc.); it's
  // stored as JSON either way.
  details?: object;
}

// Records who did what to sensitive data, and when. Never throws into the
// caller's request — an audit-log write failing shouldn't block or roll
// back the action it's describing, just get logged server-side so it can
// be noticed and fixed.
export async function recordAudit(req: Request, entry: AuditEntry): Promise<void> {
  const actor = req.user;
  if (!actor) return;
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        targetLabel: entry.targetLabel,
        details: entry.details as never,
      },
    });
  } catch (err) {
    console.error("Failed to write audit log entry", entry.action, err);
  }
}
