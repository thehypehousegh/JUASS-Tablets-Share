import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { apiGet, apiSend, ApiError } from "../api";

export type Role = "SUPER_ADMIN" | "DISTRIBUTOR" | "SUPERVISOR";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface LogoutResult {
  ok: boolean;
  backedUpOnline: boolean | null;
  pendingBackupCount: number;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  sessionNotice: string | null;
  clearSessionNotice: () => void;
  login: (userId: string, password: string) => Promise<void>;
  logout: () => Promise<LogoutResult | null>;
  refresh: () => Promise<void>;
}

const SESSION_CHECK_INTERVAL_MS = 25_000;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const loggedInRef = useRef(false);

  async function refresh() {
    try {
      const me = await apiGet("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    loggedInRef.current = !!user;
  }, [user]);

  // Detects a session that's been superseded by a newer login elsewhere
  // (or otherwise gone invalid) within one poll interval, instead of the
  // person only finding out the next time some action happens to fail.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!loggedInRef.current) return;
      try {
        await apiGet("/auth/me");
      } catch (err) {
        if (!loggedInRef.current) return;
        setUser(null);
        setSessionNotice(
          err instanceof ApiError ? err.message : "You've been logged out. Please log in again."
        );
      }
    }, SESSION_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  async function login(userId: string, password: string) {
    const me = await apiSend("POST", "/auth/login", { userId, password });
    setUser(me);
    setSessionNotice(null);
  }

  async function logout() {
    const result = await apiSend("POST", "/auth/logout").catch(() => null);
    setUser(null);
    return result as LogoutResult | null;
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, sessionNotice, clearSessionNotice: () => setSessionNotice(null), login, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
