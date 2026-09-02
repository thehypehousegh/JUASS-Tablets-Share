import { useEffect, useState } from "react";
import { apiGet, apiSend, ApiError } from "../api";

interface UserRow {
  id: string;
  name: string;
  email: string;
  contact: string | null;
  role: "SUPER_ADMIN" | "DISTRIBUTOR" | "SUPERVISOR";
  active: boolean;
  failedLoginAttempts: number;
  passwordResetRequested: boolean;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [role, setRole] = useState<UserRow["role"]>("DISTRIBUTOR");
  const [lastCreated, setLastCreated] = useState<{ email: string; temporaryPassword?: string } | null>(null);

  async function load() {
    try {
      setUsers(await apiGet("/users"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load users");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await apiSend("POST", "/users", { name, email, contact: contact || undefined, role });
      setLastCreated({ email: res.email, temporaryPassword: res.temporaryPassword });
      setName("");
      setEmail("");
      setContact("");
      setRole("DISTRIBUTOR");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create user");
    } finally {
      setCreating(false);
    }
  }

  async function unlock(id: string) {
    await apiSend("POST", `/users/${id}/unlock`).catch((e) => alert(e.message));
    load();
  }

  async function resetPassword(id: string) {
    const custom = prompt("Enter a new password (leave blank to auto-generate one):") || undefined;
    try {
      const res = await apiSend("POST", `/users/${id}/reset-password`, { newPassword: custom });
      alert(`New password: ${res.newPassword}\n(This has also been sent to the user via internal Chat.)`);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not reset password");
    }
  }

  async function toggleActive(u: UserRow) {
    await apiSend("PATCH", `/users/${u.id}`, { active: !u.active }).catch((e) => alert(e.message));
    load();
  }

  return (
    <div className="page">
      <h2>Manage Users</h2>

      <form className="card" onSubmit={createUser}>
        <h3>Add New User</h3>
        <div className="grid-2">
          <div className="field">
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Contact</label>
            <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as UserRow["role"])}>
              <option value="DISTRIBUTOR">Distributor</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="SUPER_ADMIN">Admin</option>
            </select>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn-primary" disabled={creating}>
          {creating ? "Creating…" : "Create User"}
        </button>
        {lastCreated && (
          <p className="success-text">
            Created {lastCreated.email}.{" "}
            {lastCreated.temporaryPassword && `Temporary password: ${lastCreated.temporaryPassword}`}
          </p>
        )}
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Contact</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.contact || "—"}</td>
                <td>{u.role.replace("_", " ")}</td>
                <td>
                  {!u.active && <span className="badge badge-neutral">Disabled</span>}
                  {u.failedLoginAttempts >= 5 && <span className="badge badge-warn">Blocked</span>}
                  {u.passwordResetRequested && <span className="badge badge-warn">Reset requested</span>}
                  {u.active && u.failedLoginAttempts < 5 && !u.passwordResetRequested && (
                    <span className="badge badge-active">OK</span>
                  )}
                </td>
                <td className="actions-cell">
                  {u.failedLoginAttempts >= 5 && (
                    <button className="btn-link" onClick={() => unlock(u.id)}>
                      Unlock
                    </button>
                  )}
                  <button className="btn-link" onClick={() => resetPassword(u.id)}>
                    Reset Password
                  </button>
                  <button className="btn-link" onClick={() => toggleActive(u)}>
                    {u.active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
