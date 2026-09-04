import { Router } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { computeFormStatus } from "../utils/academicYear";
import { buildEmbossmentNumber } from "../utils/embossment";
import { imeiError, serialError } from "../utils/deviceCodes";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  studentIndexNumber: z.string().min(1),
  imei: z.string({ required_error: "Enter the device IMEI" }).min(1, "Enter the device IMEI"),
  serialNumber: z.string({ required_error: "Enter the device Serial Number" }).min(1, "Enter the device Serial Number"),
  embossmentDeviceNumber: z
    .string({ required_error: "Enter the device number for the embossment code" })
    .min(1, "Enter the device number for the embossment code"),
  dateAssigned: z.string().optional(),
});

router.post(
  "/",
  requireRole("SUPER_ADMIN", "DISTRIBUTOR"),
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid data" });
    const { studentIndexNumber, imei, serialNumber, embossmentDeviceNumber, dateAssigned } = parsed.data;

    const imeiInvalid = imeiError(imei);
    if (imeiInvalid) return res.status(400).json({ error: imeiInvalid });
    const serialInvalid = serialError(serialNumber);
    if (serialInvalid) return res.status(400).json({ error: serialInvalid });

    const student = await prisma.student.findUnique({ where: { indexNumber: studentIndexNumber } });
    if (!student) return res.status(404).json({ error: "No student found with this index number" });

    if (computeFormStatus(student.admissionYear) === "COMPLETED") {
      return res.status(409).json({
        error: `${student.fullName} has completed the 3-year program (Year Group ${student.admissionYear}) and should not be assigned a new device.`,
      });
    }

    const existingActive = await prisma.deviceAssignment.findFirst({
      where: { studentId: student.id, status: "WITH_STUDENT" },
    });
    if (existingActive) {
      return res.status(409).json({ error: "This student already has an active device assigned" });
    }

    const built = buildEmbossmentNumber(student.admissionYear, embossmentDeviceNumber);
    if (!built.ok) return res.status(400).json({ error: built.error });
    const embossmentNumber = built.value;

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

// One row per student — their single most recent device assignment —
// rather than every historical row. A student who's had a device
// replaced or returned and reassigned otherwise showed up 2-3 times here
// with no obvious way to tell which row was current; the full history
// (previous devices, replace/return reasons, linked issue reports) is one
// click away via GET /history/:studentId instead.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = req.query.q ? String(req.query.q) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const className = req.query.className ? String(req.query.className) : undefined;
    const year = req.query.year ? String(req.query.year) : undefined;

    const latestPerStudent = await prisma.deviceAssignment.findMany({
      where: {
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
      distinct: ["studentId"],
      orderBy: [{ studentId: "asc" }, { createdAt: "desc" }],
      take: 2000,
    });

    const filtered = status ? latestPerStudent.filter((a) => a.status === status) : latestPerStudent;
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.json(filtered.slice(0, 500));
  })
);

// Full assignment history for one student — every device they've ever had,
// oldest first, plus any faulty/missing reports tied to those devices.
router.get(
  "/history/:studentId",
  asyncHandler(async (req, res) => {
    const student = await prisma.student.findUnique({ where: { id: req.params.studentId } });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const assignments = await prisma.deviceAssignment.findMany({
      where: { studentId: student.id },
      include: {
        distributor: { select: { name: true } },
        issueReports: {
          include: { reportedBy: { select: { name: true } }, reviewedBy: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({ student, assignments });
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

const returnSchema = z
  .object({
    returnedDate: z.string().optional(),
    reason: z.enum(["COMPLETED", "WITHDRAWN", "OTHER"]),
    note: z.string().trim().optional(),
  })
  .refine((d) => d.reason !== "OTHER" || !!d.note?.trim(), {
    message: 'A short note is required when reason is "Other"',
    path: ["note"],
  });

router.post(
  "/:id/return",
  requireRole("SUPER_ADMIN", "DISTRIBUTOR"),
  asyncHandler(async (req, res) => {
    const parsed = returnSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Select a reason for the return" });
    const returnedDate = parsed.data.returnedDate ? new Date(parsed.data.returnedDate) : new Date();
    const assignment = await prisma.deviceAssignment
      .update({
        where: { id: req.params.id },
        data: {
          status: "RETURNED",
          returnedDate,
          returnReason: parsed.data.reason,
          returnNote: parsed.data.note?.trim() || null,
        },
      })
      .catch(() => null);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });
    res.json(assignment);
  })
);

const replaceSchema = z
  .object({
    imei: z.string({ required_error: "Enter the device IMEI" }).min(1, "Enter the device IMEI"),
    serialNumber: z.string({ required_error: "Enter the device Serial Number" }).min(1, "Enter the device Serial Number"),
    embossmentDeviceNumber: z
      .string({ required_error: "Enter the device number for the embossment code" })
      .min(1, "Enter the device number for the embossment code"),
    reason: z.enum(["FAULTY", "MISSING", "OTHER"]),
    note: z.string().trim().optional(),
  })
  .refine((d) => d.reason !== "OTHER" || !!d.note?.trim(), {
    message: 'A short note is required when reason is "Other"',
    path: ["note"],
  });

// Replaces a device: closes the old assignment (status REPLACED, replacementDate = now,
// with a reason recorded on it) and opens a fresh active assignment for the same
// student with the new device.
router.post(
  "/:id/replace",
  requireRole("SUPER_ADMIN", "DISTRIBUTOR"),
  asyncHandler(async (req, res) => {
    const parsed = replaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid data" });

    const imeiInvalid = imeiError(parsed.data.imei);
    if (imeiInvalid) return res.status(400).json({ error: imeiInvalid });
    const serialInvalid = serialError(parsed.data.serialNumber);
    if (serialInvalid) return res.status(400).json({ error: serialInvalid });

    const old = await prisma.deviceAssignment.findUnique({ where: { id: req.params.id }, include: { student: true } });
    if (!old) return res.status(404).json({ error: "Assignment not found" });

    const built = buildEmbossmentNumber(old.student.admissionYear, parsed.data.embossmentDeviceNumber);
    if (!built.ok) return res.status(400).json({ error: built.error });
    const embossmentNumber = built.value;

    const [, fresh] = await prisma.$transaction([
      prisma.deviceAssignment.update({
        where: { id: old.id },
        data: {
          status: "REPLACED",
          replacementDate: new Date(),
          replacementReason: parsed.data.reason,
          replacementNote: parsed.data.note?.trim() || null,
        },
      }),
      prisma.deviceAssignment.create({
        data: {
          studentId: old.studentId,
          distributorId: req.user!.id,
          imei: parsed.data.imei,
          serialNumber: parsed.data.serialNumber,
          embossmentNumber,
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
      { header: "Replacement Reason", key: "replacementReason", width: 18 },
      { header: "Replacement Note", key: "replacementNote", width: 26 },
      { header: "Return Reason", key: "returnReason", width: 16 },
      { header: "Return Note", key: "returnNote", width: 26 },
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
        replacementReason: a.replacementReason ?? "",
        replacementNote: a.replacementNote ?? "",
        returnReason: a.returnReason ?? "",
        returnNote: a.returnNote ?? "",
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=juass-tablet-assignments.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  })
);

export default router;
