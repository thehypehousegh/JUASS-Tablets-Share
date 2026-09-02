import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiGet } from "../api";
import OfflineSyncBanner from "./OfflineSyncBanner";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await apiGet("/chat/unread-count");
        if (active) setUnread(res.count);
      } catch {
        // ignore while offline
      }
    }
    poll();
    const interval = setInterval(poll, 20000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (!user) return null;

  const isAdmin = user.role === "SUPER_ADMIN";
  const isDistributor = user.role === "SUPER_ADMIN" || user.role === "DISTRIBUTOR";
  const isSupervisor = user.role === "SUPERVISOR" || user.role === "SUPER_ADMIN";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img
            src="/logo.png"
            alt=""
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          JUASS Tablets Share
        </div>
        <nav className="nav">
          {isDistributor && (
            <NavLink to="/assign" className={({ isActive }) => (isActive ? "active" : "")}>
              Assign Device
            </NavLink>
          )}
          {isDistributor && (
            <NavLink to="/assignments" className={({ isActive }) => (isActive ? "active" : "")}>
              Assignments
            </NavLink>
          )}
          {isDistributor && (
            <NavLink to="/report-issue" className={({ isActive }) => (isActive ? "active" : "")}>
              Report Faulty/Missing
            </NavLink>
          )}
          <NavLink to="/students" className={({ isActive }) => (isActive ? "active" : "")}>
            Student Records
          </NavLink>
          {isSupervisor && (
            <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
              Dashboard
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/approvals" className={({ isActive }) => (isActive ? "active" : "")}>
              Approvals
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/import" className={({ isActive }) => (isActive ? "active" : "")}>
              Import Students
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/users" className={({ isActive }) => (isActive ? "active" : "")}>
              Manage Users
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
              Settings & Backup
            </NavLink>
          )}
          <NavLink to="/chat" className={({ isActive }) => (isActive ? "active" : "")}>
            Chat{unread > 0 ? ` (${unread})` : ""}
          </NavLink>
        </nav>
        <div className="user-menu">
          <span>
            {user.name} · {user.role.replace("_", " ")}
          </span>
          <button
            className="btn-secondary"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <OfflineSyncBanner />
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
