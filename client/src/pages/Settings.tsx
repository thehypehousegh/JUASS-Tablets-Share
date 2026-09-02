import { useEffect, useState } from "react";
import { apiDownload, apiGet, apiUpload, apiSend, ApiError } from "../api";

export default function Settings() {
  const [totalTablets, setTotalTablets] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    apiGet("/settings/total-tablets").then((r) => setTotalTablets(r.totalTablets)).catch(() => null);
  }, []);

  async function saveTotal(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await apiSend("PUT", "/settings/total-tablets", { totalTablets: Number(totalTablets) });
      setMessage("Saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function exportBackup() {
    try {
      await apiDownload("/backup/export", "juass-tablets-backup.json");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not export backup");
    }
  }

  async function importBackup(e: React.FormEvent) {
    e.preventDefault();
    if (!backupFile) return;
    setRestoring(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", backupFile);
      const res = await apiUpload("POST", "/backup/import", formData);
      setMessage(
        `Restored: ${res.imported.users} users, ${res.imported.students} students, ${res.imported.assignments} assignments.`
      );
      setBackupFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not import backup");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="page">
      <h2>Settings & Backup</h2>

      <form className="card" onSubmit={saveTotal}>
        <h3>Total Tablets Available</h3>
        <div className="field">
          <label>Total number of tablets purchased for distribution</label>
          <input type="number" min={0} value={totalTablets} onChange={(e) => setTotalTablets(Number(e.target.value))} />
        </div>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      <div className="card">
        <h3>Backup & Sync</h3>
        <p className="hint-text">
          Download a full backup of all data straight to this device (useful before closing out for the day, or to move
          data between a local-network computer and an internet-hosted copy). Importing a backup merges its records in
          — it never deletes anything already here.
        </p>
        <button className="btn-secondary" onClick={exportBackup}>
          Download Full Backup (.json)
        </button>

        <form onSubmit={importBackup} className="import-row">
          <input type="file" accept=".json" onChange={(e) => setBackupFile(e.target.files?.[0] || null)} />
          <button type="submit" className="btn-secondary" disabled={!backupFile || restoring}>
            {restoring ? "Restoring…" : "Restore From Backup"}
          </button>
        </form>
      </div>

      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
