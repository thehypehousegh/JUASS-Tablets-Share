import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
  login: (userId: string, password: string) => Promise<void>;
  logout: () => Promise<LogoutResult | null>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function login(userId: string, password: string) {
    const me = await apiSend("POST", "/auth/login", { userId, password });
    setUser(me);
  }

  async function logout() {
    const result = await apiSend("POST", "/auth/logout").catch(() => null);
    setUser(null);
    return result as LogoutResult | null;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
