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

interface RetentionPreviewStudent {
  id: string;
  indexNumber: string;
  fullName: string;
  className: string | null;
  admissionYear: string | null;
  yearsSinceCompletion: number | null;
}

interface RetentionPreview {
  retentionYears: number;
  studentCount: number;
  students: RetentionPreviewStudent[];
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

  const [retentionYears, setRetentionYears] = useState<number | "">("");
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionMessage, setRetentionMessage] = useState<string | null>(null);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [retentionPreview, setRetentionPreview] = useState<RetentionPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState("");
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/settings/total-tablets").then((r) => setTotalTablets(r.totalTablets)).catch(() => null);
    apiGet("/retention/policy").then((r) => setRetentionYears(r.retentionYears ?? "")).catch(() => null);
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

  async function saveRetentionPolicy(e: React.FormEvent) {
    e.preventDefault();
    if (retentionYears === "") return;
    setRetentionSaving(true);
    setRetentionMessage(null);
    setRetentionError(null);
    try {
      await apiSend("PUT", "/retention/policy", { retentionYears: Number(retentionYears) });
      setRetentionMessage("Saved.");
      setRetentionPreview(null);
    } catch (err) {
      setRetentionError(err instanceof ApiError ? err.message : "Could not save the retention policy");
    } finally {
      setRetentionSaving(false);
    }
  }

  async function previewRetentionPurge() {
    setPreviewing(true);
    setRetentionError(null);
    setPurgeResult(null);
    try {
      setRetentionPreview(await apiGet("/retention/preview"));
    } catch (err) {
      setRetentionError(err instanceof ApiError ? err.message : "Could not load eligible records");
    } finally {
      setPreviewing(false);
    }
  }

  async function purgeRetention() {
    if (purgeConfirmText !== "PURGE") return;
    if (
      !confirm(
        `This permanently deletes ${retentionPreview?.studentCount ?? 0} student record(s) and their device history. This cannot be undone. Continue?`
      )
    ) {
      return;
    }
    setPurging(true);
    setRetentionError(null);
    try {
      const res = await apiSend("POST", "/retention/purge", { confirmText: purgeConfirmText });
      setPurgeResult(
        `Deleted ${res.deletedStudents} student(s), ${res.deletedAssignments} assignment(s), and ${res.deletedIssueReports} issue report(s).`
      );
      setPurgeConfirmText("");
      setRetentionPreview(null);
    } catch (err) {
      setRetentionError(err instanceof ApiError ? err.message : "Could not purge these records");
    } finally {
      setPurging(false);
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

      <div className="card">
        <h3>Data Retention</h3>
        <p className="hint-text">
          Students who graduated (Form 3 completed) and whose device has already been returned or reported missing
          can be purged automatically once they've been graduated this many years. Students still holding a device
          are never purged, regardless of how long ago they graduated.
        </p>
        <form onSubmit={saveRetentionPolicy} className="filter-row">
          <div className="field">
            <label>Years after graduation before a record is eligible for purge</label>
            <input
              type="number"
              min={0}
              max={50}
              value={retentionYears}
              onChange={(e) => setRetentionYears(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={retentionSaving || retentionYears === ""}>
            {retentionSaving ? "Saving…" : "Save Policy"}
          </button>
        </form>
        {retentionMessage && <p className="success-text">{retentionMessage}</p>}
        {retentionError && <p className="error-text">{retentionError}</p>}

        <button
          type="button"
          className="btn-secondary"
          onClick={previewRetentionPurge}
          disabled={previewing || retentionYears === ""}
        >
          {previewing ? "Checking…" : "Preview Eligible Records"}
        </button>

        {retentionPreview && (
          <>
            <p className="hint-text">
              {retentionPreview.studentCount} record(s) eligible for purge (graduated {retentionPreview.retentionYears}+
              year(s) ago, device already accounted for).
            </p>
            {retentionPreview.studentCount > 0 && (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Index Number</th>
                        <th>Name</th>
                        <th>Class</th>
                        <th>Year Group</th>
                        <th>Years Since Completion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retentionPreview.students.slice(0, 200).map((s) => (
                        <tr key={s.id}>
                          <td>{s.indexNumber}</td>
                          <td>{s.fullName}</td>
                          <td>{s.className || "—"}</td>
                          <td>{s.admissionYear || "—"}</td>
                          <td>{s.yearsSinceCompletion ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {retentionPreview.students.length > 200 && (
                  <p className="hint-text">Showing the first 200 of {retentionPreview.studentCount} records.</p>
                )}
                <div className="grid-2">
                  <div className="field">
                    <label>Type PURGE to confirm</label>
                    <input
                      type="text"
                      value={purgeConfirmText}
                      onChange={(e) => setPurgeConfirmText(e.target.value)}
                      placeholder="PURGE"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={purging || purgeConfirmText !== "PURGE"}
                  onClick={purgeRetention}
                >
                  {purging ? "Purging…" : `Purge ${retentionPreview.studentCount} Record(s)`}
                </button>
              </>
            )}
          </>
        )}
        {purgeResult && <p className="success-text">{purgeResult}</p>}
      </div>

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
