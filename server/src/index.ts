import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app";
import { ensureSuperAdmin } from "./bootstrap";
import { runSyncNow, startAutoSync } from "./sync";

const port = Number(process.env.PORT || 4000);
const SHUTDOWN_SYNC_TIMEOUT_MS = 20_000;

async function main() {
  await ensureSuperAdmin();
  startAutoSync();

  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`JUASS Tablets Share API listening on port ${port}`);
  });

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received — syncing to the cloud before shutting down...`);

    const timeout = new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_SYNC_TIMEOUT_MS));
    await Promise.race([runSyncNow(), timeout]).catch(() => undefined);

    server.close(() => process.exit(0));
    // Force-exit if something (an open keep-alive connection, etc.) stops
    // the server from closing cleanly on its own.
    setTimeout(() => process.exit(0), 5_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
