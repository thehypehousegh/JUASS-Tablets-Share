import { Router } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  studentIndexNumber: z.string().min(1),
  imei: z.string().min(5),
  serialNumber: z.string().min(3),
  embossmentNumber: z.string().optional(),
  dateAssigned: z.string().optional(),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN", "DISTRIBUTOR"),
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid data" });
    const { studentIndexNumber, imei, serialNumber, embossmentNumber, dateAssigned } = parsed.data;

    const student = await prisma.student.findUnique({ where: { indexNumber: studentIndexNumber } });
    if (!student) return res.status(404).json({ error: "No student found with this index number" });

    const existingActive = await prisma.deviceAssignment.findFirst({
      where: { studentId: student.id, status: "WITH_STUDENT" },
    });
    if (existingActive) {
      return res.status(409).json({ error: "This student already has an active device assigned" });
    }

    const assignment = await prisma.deviceAssignment
      .create({
        data: {
          studentId: student.id,
          distributorId: req.user!.id,
          imei,
          serialNumber,
          embossmentNumber,
          dateAssigned: dateAssigned ? new Date(dateAssigned) : new Date(),
        },
        include: { student: true, distributor: { select: { name: true } } },
      })
      .catch((e: unknown) => {
        throw e;
      });

    res.status(201).json(assignment);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = req.query.q ? String(req.query.q) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const className = req.query.className ? String(req.query.className) : undefined;
    const year = req.query.year ? String(req.query.year) : undefined;

    const assignments = await prisma.deviceAssignment.findMany({
      where: {
        status: status ? (status as "WITH_STUDENT" | "REPLACED" | "RETURNED") : undefined,
        student: {
          className: className || undefined,
          admissionYear: year || undefined,
          OR: q
            ? [
                { indexNumber: { contains: q, mode: "insensitive" } },
                { fullName: { contains: q, mode: "insensitive" } },
              ]
            : undefined,
        },
      },
      include: { student: true, distributor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    res.json(assignments);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const assignment = await prisma.deviceAssignment.findUnique({
      where: { id: req.params.id },
      include: { student: true, distributor: { select: { name: true } }, issueReports: true },
    });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });
    res.json(assignment);
  })
);

const returnSchema = z.object({ returnedDate: z.string().optional() });

router.post(
  "/:id/return",
  requireRole("SUPER_ADMIN", "DISTRIBUTOR"),
  asyncHandler(async (req, res) => {
    const parsed = returnSchema.safeParse(req.body);
    const returnedDate = parsed.success && parsed.data.returnedDate ? new Date(parsed.data.returnedDate) : new Date();
    const assignment = await prisma.deviceAssignment
      .update({ where: { id: req.params.id }, data: { status: "RETURNED", returnedDate } })
      .catch(() => null);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });
    res.json(assignment);
  })
);

const replaceSchema = z.object({
  imei: z.string().min(5),
  serialNumber: z.string().min(3),
  embossmentNumber: z.string().optional(),
});

// Replaces a device: closes the old assignment (status REPLACED, replacementDate = now)
// and opens a fresh active assignment for the same student with the new device.
router.post(
  "/:id/replace",
  requireRole("SUPER_ADMIN", "DISTRIBUTOR"),
  asyncHandler(async (req, res) => {
    const parsed = replaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid data" });

    const old = await prisma.deviceAssignment.findUnique({ where: { id: req.params.id } });
    if (!old) return res.status(404).json({ error: "Assignment not found" });

    const [, fresh] = await prisma.$transaction([
      prisma.deviceAssignment.update({
        where: { id: old.id },
        data: { status: "REPLACED", replacementDate: new Date() },
      }),
      prisma.deviceAssignment.create({
        data: {
          studentId: old.studentId,
          distributorId: req.user!.id,
          imei: parsed.data.imei,
          serialNumber: parsed.data.serialNumber,
          embossmentNumber: parsed.data.embossmentNumber,
        },
        include: { student: true, distributor: { select: { name: true } } },
      }),
    ]);

    res.json(fresh);
  })
);

router.get(
  "/export/xlsx",
  asyncHandler(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const className = req.query.className ? String(req.query.className) : undefined;
    const year = req.query.year ? String(req.query.year) : undefined;

    const assignments = await prisma.deviceAssignment.findMany({
      where: {
        status: status ? (status as "WITH_STUDENT" | "REPLACED" | "RETURNED") : undefined,
        student: { className: className || undefined, admissionYear: year || undefined },
      },
      include: { student: true, distributor: { select: { name: true } } },
      orderBy: [{ student: { admissionYear: "desc" } }, { student: { className: "asc" } }, { student: { fullName: "asc" } }],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tablet Assignments");
    sheet.columns = [
      { header: "Index Number", key: "indexNumber", width: 16 },
      { header: "Full Name", key: "fullName", width: 28 },
      { header: "Gender", key: "gender", width: 10 },
      { header: "Class", key: "className", width: 12 },
      { header: "Year Group", key: "admissionYear", width: 14 },
      { header: "Programme", key: "programme", width: 18 },
      { header: "House", key: "house", width: 14 },
      { header: "Guardian Name", key: "guardianName", width: 22 },
      { header: "Guardian Contact", key: "guardianContact", width: 18 },
      { header: "Distributor Name", key: "distributorName", width: 20 },
      { header: "Device IMEI", key: "imei", width: 20 },
      { header: "Serial Number", key: "serialNumber", width: 22 },
      { header: "Date Assigned", key: "dateAssigned", width: 16 },
      { header: "Replacement Date", key: "replacementDate", width: 18 },
      { header: "Returned Date", key: "returnedDate", width: 16 },
      { header: "Status", key: "status", width: 16 },
      { header: "Embossment Number", key: "embossmentNumber", width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const a of assignments) {
      sheet.addRow({
        indexNumber: a.student.indexNumber,
        fullName: a.student.fullName,
        gender: a.student.gender ?? "",
        className: a.student.className ?? "",
        admissionYear: a.student.admissionYear ?? "",
        programme: a.student.programme ?? "",
        house: a.student.house ?? "",
        guardianName: a.student.guardianName ?? "",
        guardianContact: a.student.guardianContact ?? "",
        distributorName: a.distributor.name,
        imei: a.imei,
        serialNumber: a.serialNumber,
        dateAssigned: a.dateAssigned.toISOString().slice(0, 10),
        replacementDate: a.replacementDate ? a.replacementDate.toISOString().slice(0, 10) : "",
        returnedDate: a.returnedDate ? a.returnedDate.toISOString().slice(0, 10) : "",
        status: a.status,
        embossmentNumber: a.embossmentNumber ?? "",
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=juass-tablet-assignments.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  })
);

export default router;
