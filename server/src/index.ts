import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app";
import { ensureSuperAdmin } from "./bootstrap";
import { startAutoSync } from "./sync";

const port = Number(process.env.PORT || 4000);

async function main() {
  await ensureSuperAdmin();
  startAutoSync();

  const app = createApp();
  app.listen(port, () => {
    console.log(`JUASS Tablets Share API listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
