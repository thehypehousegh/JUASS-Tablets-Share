import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { uploadDir } from "./middleware/upload";

import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import studentsRoutes from "./routes/students";
import assignmentsRoutes from "./routes/assignments";
import issuesRoutes from "./routes/issues";
import chatRoutes from "./routes/chat";
import dashboardRoutes from "./routes/dashboard";
import settingsRoutes from "./routes/settings";
import backupRoutes from "./routes/backup";
import reportsRoutes from "./routes/reports";
import customFieldsRoutes from "./routes/customFields";

export function createApp() {
  const app = express();

  const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim());

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );
  // Generous enough for a full-database backup payload pushed by the
  // background sync job (see src/sync.ts) as the school's data grows.
  app.use(express.json({ limit: "25mb" }));
  app.use(cookieParser());
  app.use("/uploads", express.static(uploadDir));

  app.get("/api/health", (_req, res) => res.json({ ok: true, school: process.env.SCHOOL_NAME || "" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/students", studentsRoutes);
  app.use("/api/assignments", assignmentsRoutes);
  app.use("/api/issues", issuesRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/backup", backupRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/custom-fields", customFieldsRoutes);

  // Serve the built React app in production (single deployable service).
  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) next();
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (err?.message?.includes("Unique constraint")) {
      return res.status(409).json({ error: "This IMEI or Serial Number is already assigned to another student" });
    }
    res.status(500).json({ error: "Something went wrong on the server" });
  });

  return app;
}
