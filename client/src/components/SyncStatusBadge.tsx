import { useEffect, useState } from "react";
import { apiGet } from "../api";

interface SyncStatus {
  enabled: boolean;
  lastSuccessAt?: string;
  lastError?: string;
  pendingBackupCount: number;
}

// Shown to every logged-in role, not just Admin — only appears at all on an
// instance with local-network auto-sync configured (REMOTE_SYNC_URL /
// SYNC_SECRET set); a plain cloud-only or local-dev instance never shows it.
export default function SyncStatusBadge() {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await apiGet("/backup/sync-status");
        if (active) setStatus(res);
      } catch {
        // ignore while offline — the badge just keeps showing its last known state
      }
    }
    poll();
    const interval = setInterval(poll, 20000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (!status?.enabled) return null;

  const upToDate = status.pendingBackupCount === 0 && !status.lastError;

  return (
    <span
      className={`badge ${upToDate ? "badge-active" : "badge-warn"}`}
      title={
        upToDate
          ? `Last synced to the cloud: ${status.lastSuccessAt ? new Date(status.lastSuccessAt).toLocaleString() : "just now"}`
          : `${status.pendingBackupCount} offline backup(s) waiting to sync. Retries automatically once there's internet — an Admin can also retry now from Settings & Backup.`
      }
    >
      {upToDate ? "Backed up online" : `Not backed up (${status.pendingBackupCount})`}
    </span>
  );
}
