import { useEffect, useState } from "react";
import { flushQueue, isOnline, onConnectivityRestored, queueCount } from "../lib/offlineQueue";

export default function OfflineSyncBanner() {
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  async function refreshCount() {
    setPending(await queueCount());
  }

  async function trySync() {
    if (!isOnline()) return;
    setSyncing(true);
    try {
      await flushQueue();
    } finally {
      setSyncing(false);
      refreshCount();
    }
  }

  useEffect(() => {
    refreshCount();
    const onOnline = () => {
      setOnline(true);
      trySync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("offline", onOffline);
    const unsubscribe = onConnectivityRestored(onOnline);
    const interval = setInterval(refreshCount, 15000);
    return () => {
      window.removeEventListener("offline", onOffline);
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div className={`offline-banner ${online ? "banner-syncing" : "banner-offline"}`}>
      {!online && <span>You are offline. Forms are being saved on this device.</span>}
      {pending > 0 && (
        <span>
          {pending} item(s) waiting to sync.{" "}
          {online && (
            <button className="btn-link" onClick={trySync} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
        </span>
      )}
    </div>
  );
}
