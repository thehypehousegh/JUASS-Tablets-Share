import { openDB, DBSchema, IDBPDatabase } from "idb";

interface QueuedAssignment {
  id: string;
  kind: "assignment";
  path: string;
  body: Record<string, unknown>;
  createdAt: number;
}

interface QueuedIssue {
  id: string;
  kind: "issue";
  path: string;
  fields: Record<string, string>;
  photo?: Blob;
  photoName?: string;
  createdAt: number;
}

export type QueuedItem = QueuedAssignment | QueuedIssue;

interface OfflineDB extends DBSchema {
  queue: {
    key: string;
    value: QueuedItem;
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>("juass-offline", 1, {
      upgrade(db) {
        db.createObjectStore("queue", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function queueAssignment(path: string, body: Record<string, unknown>) {
  const db = await getDb();
  const item: QueuedAssignment = { id: newId(), kind: "assignment", path, body, createdAt: Date.now() };
  await db.put("queue", item);
  return item.id;
}

export async function queueIssue(path: string, fields: Record<string, string>, photo?: File) {
  const db = await getDb();
  const item: QueuedIssue = {
    id: newId(),
    kind: "issue",
    path,
    fields,
    photo: photo || undefined,
    photoName: photo?.name,
    createdAt: Date.now(),
  };
  await db.put("queue", item);
  return item.id;
}

export async function listQueue(): Promise<QueuedItem[]> {
  const db = await getDb();
  const all = await db.getAll("queue");
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeFromQueue(id: string) {
  const db = await getDb();
  await db.delete("queue", id);
}

export async function queueCount(): Promise<number> {
  const db = await getDb();
  return db.count("queue");
}

type FlushResult = { synced: number; failed: number };

// Attempts to send every queued item to the server. Stops advancing past
// an item that still fails so retry order stays stable, but keeps trying
// every item at least once per call so one bad row doesn't block the rest.
export async function flushQueue(): Promise<FlushResult> {
  const items = await listQueue();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      if (item.kind === "assignment") {
        const res = await fetch(`/api${item.path}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.body),
        });
        if (!res.ok && res.status !== 409) throw new Error("sync failed");
      } else {
        const formData = new FormData();
        Object.entries(item.fields).forEach(([k, v]) => formData.append(k, v));
        if (item.photo) formData.append("photo", item.photo, item.photoName || "photo.jpg");
        const res = await fetch(`/api${item.path}`, { method: "POST", credentials: "include", body: formData });
        if (!res.ok) throw new Error("sync failed");
      }
      await removeFromQueue(item.id);
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

export function onConnectivityRestored(callback: () => void) {
  window.addEventListener("online", callback);
  return () => window.removeEventListener("online", callback);
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
