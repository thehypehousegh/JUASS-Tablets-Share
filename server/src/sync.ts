import { buildBackupPayload } from "./utils/backup";

// Background push from a local-network instance to an internet-hosted one,
// so the school's data never rests only on one machine's disk. Configured
// entirely by environment variables — if REMOTE_SYNC_URL or SYNC_SECRET is
// unset, this is a no-op (that's the normal case for the cloud instance
// itself, which only ever receives pushes via POST /api/backup/sync).

interface SyncStatus {
  enabled: boolean;
  remoteUrl?: string;
  intervalMinutes: number;
  running: boolean;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
}

const status: SyncStatus = {
  enabled: false,
  intervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES) || 5,
  running: false,
};

export function getSyncStatus(): SyncStatus {
  return { ...status };
}

export function startAutoSync() {
  const remoteUrl = process.env.REMOTE_SYNC_URL;
  const secret = process.env.SYNC_SECRET;
  if (!remoteUrl || !secret) return;

  status.enabled = true;
  status.remoteUrl = remoteUrl;
  const intervalMs = Math.max(status.intervalMinutes, 1) * 60 * 1000;
  const target = `${remoteUrl.replace(/\/+$/, "")}/api/backup/sync`;

  async function tick() {
    if (status.running) return;
    status.running = true;
    status.lastAttemptAt = new Date().toISOString();
    try {
      const payload = await buildBackupPayload();
      const res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sync-Secret": secret! },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Remote responded ${res.status}: ${body.slice(0, 200)}`);
      }
      status.lastSuccessAt = new Date().toISOString();
      status.lastError = undefined;
      console.log(`[sync] Pushed local data to ${remoteUrl}.`);
    } catch (err) {
      status.lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[sync] Could not reach ${remoteUrl}: ${status.lastError}`);
    } finally {
      status.running = false;
    }
  }

  // First push shortly after boot (not immediately — let the DB connection
  // settle), then on the configured interval for as long as the process runs.
  setTimeout(tick, 15_000);
  setInterval(tick, intervalMs);
}
