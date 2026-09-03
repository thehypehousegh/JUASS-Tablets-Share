import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth, Role } from "./auth/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import AssignmentForm from "./pages/AssignmentForm";
import Assignments from "./pages/Assignments";
import ReportIssue from "./pages/ReportIssue";
import Approvals from "./pages/Approvals";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import ImportStudents from "./pages/ImportStudents";
import AdminUsers from "./pages/AdminUsers";
import Settings from "./pages/Settings";
import Chat from "./pages/Chat";
import Reports from "./pages/Reports";

function ProtectedRoute({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "SUPERVISOR") return <Navigate to="/dashboard" replace />;
  return <Navigate to="/assign" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<HomeRedirect />} />
        <Route
          path="/assign"
          element={
            <ProtectedRoute roles={["SUPER_ADMIN", "DISTRIBUTOR"]}>
              <AssignmentForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assignments"
          element={
            <ProtectedRoute roles={["SUPER_ADMIN", "DISTRIBUTOR"]}>
              <Assignments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/report-issue"
          element={
            <ProtectedRoute roles={["SUPER_ADMIN", "DISTRIBUTOR"]}>
              <ReportIssue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/approvals"
          element={
            <ProtectedRoute roles={["SUPER_ADMIN"]}>
              <Approvals />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={["SUPER_ADMIN", "SUPERVISOR"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/import"
          element={
            <ProtectedRoute roles={["SUPER_ADMIN"]}>
              <ImportStudents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute roles={["SUPER_ADMIN"]}>
              <AdminUsers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute roles={["SUPER_ADMIN"]}>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route path="/students" element={<Students />} />
        <Route
          path="/reports"
          element={
            <ProtectedRoute roles={["SUPER_ADMIN", "SUPERVISOR"]}>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route path="/chat" element={<Chat />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
