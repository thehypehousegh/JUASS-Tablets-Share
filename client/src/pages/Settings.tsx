import { useEffect, useState } from "react";
import { apiDownload, apiGet, apiUpload, apiSend, ApiError } from "../api";

interface SyncStatus {
  enabled: boolean;
  remoteUrl?: string;
  intervalMinutes: number;
  running: boolean;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  pendingBackupCount: number;
  oldestPendingBackupAt?: string;
}

export default function Settings() {
  const [totalTablets, setTotalTablets] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [retrying, setRetrying] = useState(false);

  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/settings/total-tablets").then((r) => setTotalTablets(r.totalTablets)).catch(() => null);
    loadSyncStatus();
    const interval = setInterval(loadSyncStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  function loadSyncStatus() {
    apiGet("/backup/sync-status").then(setSyncStatus).catch(() => null);
  }

  async function retrySyncNow() {
    setRetrying(true);
    try {
      const res = await apiSend("POST", "/backup/sync-now");
      setSyncStatus(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not retry sync");
    } finally {
      setRetrying(false);
    }
  }

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

  async function systemReset(e: React.FormEvent) {
    e.preventDefault();
    if (resetConfirmText !== "DELETE ALL") return;
    if (!confirm("This permanently deletes ALL student, device, issue-report, chat, and custom-field data. This cannot be undone. Continue?")) {
      return;
    }
    setResetting(true);
    setResetError(null);
    setResetResult(null);
    try {
      const res = await apiSend("POST", "/backup/system-reset", { password: resetPassword, confirmText: resetConfirmText });
      setResetResult(
        `Deleted ${res.deleted.students} student(s), ${res.deleted.assignments} assignment(s), ${res.deleted.issueReports} issue report(s), ${res.deleted.chatMessages} chat message(s), and ${res.deleted.customFields} custom field(s). User accounts were kept.`
      );
      setResetPassword("");
      setResetConfirmText("");
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : "Could not reset the system");
    } finally {
      setResetting(false);
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

      {syncStatus?.enabled && (
        <div className="card">
          <h3>Automatic Cloud Sync</h3>
          <p className="hint-text">
            This is a local-network instance. Every {syncStatus.intervalMinutes} minute(s) it automatically pushes a
            full copy of its data to <strong>{syncStatus.remoteUrl}</strong>, so nothing rests only on this machine
            for long even while working with no internet.
          </p>
          {syncStatus.lastSuccessAt ? (
            <p className="success-text">Last synced successfully: {new Date(syncStatus.lastSuccessAt).toLocaleString()}</p>
          ) : (
            <p className="warn-text">Not yet synced successfully since this server started.</p>
          )}
          {syncStatus.pendingBackupCount > 0 && (
            <p className="warn-text">
              {syncStatus.pendingBackupCount} offline backup(s) saved on this machine, not yet delivered to the cloud
              {syncStatus.oldestPendingBackupAt &&
                ` (oldest from ${new Date(syncStatus.oldestPendingBackupAt).toLocaleString()})`}
              . Everyone sees a "Not backed up" badge in the top bar until this clears.
            </p>
          )}
          {syncStatus.lastError && (
            <p className="error-text">
              Last attempt ({syncStatus.lastAttemptAt ? new Date(syncStatus.lastAttemptAt).toLocaleString() : ""})
              failed: {syncStatus.lastError}. It will keep retrying automatically — this is expected while there's no
              internet connection.
            </p>
          )}
          <button className="btn-secondary" onClick={retrySyncNow} disabled={retrying || syncStatus.running}>
            {retrying || syncStatus.running ? "Syncing…" : "Retry Sync Now"}
          </button>
        </div>
      )}

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

      <form className="card card-danger" onSubmit={systemReset}>
        <h3>Danger Zone — System Reset</h3>
        <p className="warn-text">
          Permanently deletes every student record, device assignment, issue report, chat message, and custom field
          definition. User accounts are kept, so nobody is locked out. This cannot be undone — download a backup
          above first if there's any doubt.
        </p>
        <div className="grid-2">
          <div className="field">
            <label>Confirm your password</label>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="field">
            <label>Type DELETE ALL to confirm</label>
            <input type="text" value={resetConfirmText} onChange={(e) => setResetConfirmText(e.target.value)} placeholder="DELETE ALL" />
          </div>
        </div>
        <button
          type="submit"
          className="btn-danger"
          disabled={resetting || !resetPassword || resetConfirmText !== "DELETE ALL"}
        >
          {resetting ? "Resetting…" : "Reset System"}
        </button>
        {resetError && <p className="error-text">{resetError}</p>}
        {resetResult && <p className="success-text">{resetResult}</p>}
      </form>
    </div>
  );
}
