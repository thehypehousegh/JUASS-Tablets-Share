import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@juass.local";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "Super Admin",
      email: adminEmail,
      contact: "0240000000",
      role: "SUPER_ADMIN",
      passwordHash: await bcrypt.hash(adminPassword, 10),
    },
  });

  await prisma.setting.upsert({
    where: { key: "totalTablets" },
    update: {},
    create: { key: "totalTablets", value: "0" },
  });

  const sampleStudents = [
    { indexNumber: "JUASS-2026-0001", fullName: "Ama Serwaa", gender: "F", className: "1A", programme: "General Science" },
    { indexNumber: "JUASS-2026-0002", fullName: "Kwame Owusu", gender: "M", className: "1A", programme: "General Science" },
    { indexNumber: "JUASS-2026-0003", fullName: "Efua Mensah", gender: "F", className: "1B", programme: "Business" },
  ];
  for (const s of sampleStudents) {
    await prisma.student.upsert({ where: { indexNumber: s.indexNumber }, update: {}, create: s });
  }

  console.log("Seed complete.");
  console.log(`Super Admin login: ${admin.email} / ${adminPassword}`);
  console.log("Change this password after first login (Chat > request reset, or reset it in Manage Users).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
