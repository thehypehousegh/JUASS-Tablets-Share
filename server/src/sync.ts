import fs from "fs";
import path from "path";
import { uploadDir } from "./middleware/upload";
import { BackupPayload, buildBackupPayload } from "./utils/backup";

// Background push from a local-network instance to an internet-hosted one,
// so the school's data never rests only on one machine's disk. Configured
// entirely by environment variables — if REMOTE_SYNC_URL or SYNC_SECRET is
// unset, this is a no-op (that's the normal case for the cloud instance
// itself, which only ever receives pushes via POST /api/backup/sync).
//
// Besides the timed interval, a sync is also triggered on-demand:
//   - whenever anyone logs out (routes/auth.ts), so a distributor's work is
//     pushed promptly rather than waiting for the next tick, and
//   - once more during graceful shutdown (index.ts), so stopping the local
//     server (closing the laptop for the day) doesn't leave anything only
//     on that machine. This can only run for a *graceful* stop (Ctrl-C,
//     `docker compose down`) — it has no chance to run if the machine loses
//     power or is switched off without shutting the app down first.
//
// If a push fails (typically: no internet at that moment), the payload it
// tried to send is written to disk under uploads/pending-sync/ instead of
// being discarded — a concrete "offline backup" file, not just a retry
// promise. It's cleared automatically the next time a push succeeds. This
// on-disk state (not just in-memory) is what lets the "not backed up
// online yet" indicator survive a server restart, so it keeps showing
// until someone (or the automatic retry) actually gets it to the cloud.

const PENDING_DIR = path.join(uploadDir, "pending-sync");

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

const state = {
  enabled: false,
  intervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES) || 5,
  running: false,
  lastAttemptAt: undefined as string | undefined,
  lastSuccessAt: undefined as string | undefined,
  lastError: undefined as string | undefined,
};

let remoteUrl: string | undefined;
let secret: string | undefined;
let target: string | undefined;
let inFlight: Promise<void> | null = null;

function listPendingFiles(): string[] {
  try {
    return fs
      .readdirSync(PENDING_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
}

function savePendingBackup(payload: BackupPayload) {
  fs.mkdirSync(PENDING_DIR, { recursive: true });
  const filename = `backup-${Date.now()}.json`;
  fs.writeFileSync(path.join(PENDING_DIR, filename), JSON.stringify(payload));
}

function clearPendingBackups() {
  for (const f of listPendingFiles()) {
    fs.rmSync(path.join(PENDING_DIR, f), { force: true });
  }
}

export function getSyncStatus(): SyncStatus {
  const pending = listPendingFiles();
  const oldest = pending[0];
  const oldestTimestamp = oldest ? Number(oldest.replace(/^backup-/, "").replace(/\.json$/, "")) : undefined;
  return {
    enabled: state.enabled,
    remoteUrl: state.enabled ? remoteUrl : undefined,
    intervalMinutes: state.intervalMinutes,
    running: state.running,
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    lastError: state.lastError,
    pendingBackupCount: pending.length,
    oldestPendingBackupAt: oldestTimestamp ? new Date(oldestTimestamp).toISOString() : undefined,
  };
}

async function pushPayload(payload: BackupPayload): Promise<void> {
  const res = await fetch(target!, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sync-Secret": secret! },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Remote responded ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function performSync(): Promise<void> {
  state.running = true;
  state.lastAttemptAt = new Date().toISOString();
  const payload = await buildBackupPayload();
  try {
    await pushPayload(payload);
    state.lastSuccessAt = new Date().toISOString();
    state.lastError = undefined;
    clearPendingBackups();
    console.log(`[sync] Pushed local data to ${remoteUrl}.`);
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    console.warn(`[sync] Could not reach ${remoteUrl}: ${state.lastError}. Saving an offline backup instead.`);
    try {
      savePendingBackup(payload);
    } catch (writeErr) {
      console.error("[sync] Also failed to write the offline backup file:", writeErr);
    }
  } finally {
    state.running = false;
  }
}

/**
 * Runs a sync immediately if auto-sync is configured. Safe to call
 * liberally (logout, shutdown, interval tick) — concurrent callers share
 * one in-flight attempt rather than piling up parallel pushes.
 */
export function runSyncNow(): Promise<void> {
  if (!state.enabled) return Promise.resolve();
  if (!inFlight) {
    inFlight = performSync().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export function startAutoSync() {
  remoteUrl = process.env.REMOTE_SYNC_URL;
  secret = process.env.SYNC_SECRET;
  if (!remoteUrl || !secret) return;

  state.enabled = true;
  target = `${remoteUrl.replace(/\/+$/, "")}/api/backup/sync`;
  const intervalMs = Math.max(state.intervalMinutes, 1) * 60 * 1000;

  // First push shortly after boot (not immediately — let the DB connection
  // settle), then on the configured interval for as long as the process runs.
  setTimeout(runSyncNow, 15_000);
  setInterval(runSyncNow, intervalMs);
}
