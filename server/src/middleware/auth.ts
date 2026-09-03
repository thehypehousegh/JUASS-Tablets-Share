import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { prisma } from "../db";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const COOKIE_NAME = "juass_session";
const TOKEN_TTL = "12h";

export interface AuthPayload {
  userId: string;
  role: Role;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role; name: string; email: string };
    }
  }
}

export function issueSession(res: Response, payload: AuthPayload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 12 * 60 * 60 * 1000,
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE_NAME);
}

export function readSessionCookie(req: Request): AuthPayload | null {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "Not logged in" });
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.active) return res.status(401).json({ error: "Session invalid" });
    // Only one login is valid per account at a time — a newer login (any
    // device/browser) overwrites activeSessionId, which immediately
    // invalidates every other still-open session for that account.
    if (!decoded.sessionId || decoded.sessionId !== user.activeSessionId) {
      return res.status(401).json({
        error: "This account was just used to log in elsewhere, so you've been logged out here.",
        code: "SESSION_SUPERSEDED",
      });
    }
    req.user = { id: user.id, role: user.role, name: user.name, email: user.email };
    next();
  } catch {
    res.status(401).json({ error: "Session invalid" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not logged in" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to do this" });
    }
    next();
  };
}
