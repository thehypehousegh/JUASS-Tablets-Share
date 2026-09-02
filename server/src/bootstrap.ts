import { prisma } from "./db";
import { generateTempPassword, hashPassword } from "./utils/password";

// Runs on every server startup, but only acts once: if no accounts exist
// yet (a brand new database), it creates the first Super Admin so there's
// a way to log in at all. This matters most on hosts without shell/console
// access (e.g. Render's free tier), where `npm run seed` can't be run by
// hand after the first deploy.
export async function ensureSuperAdmin() {
  const existing = await prisma.user.count();
  if (existing > 0) return;

  const email = process.env.SEED_ADMIN_EMAIL || "admin@juass.local";
  const password = process.env.SEED_ADMIN_PASSWORD || generateTempPassword();
  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: { name: "Super Admin", email, role: "SUPER_ADMIN", passwordHash },
  });

  console.log("============================================================");
  console.log("No accounts existed yet — created the first Super Admin:");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log("Log in and change this password immediately (Manage Users > Reset Password).");
  console.log("============================================================");
}
