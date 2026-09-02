import { Router } from "express";
import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { uploadSpreadsheet } from "../middleware/upload";

const router = Router();
router.use(requireAuth);

const STUDENT_FIELDS = [
  { key: "indexNumber", label: "Index Number", required: true },
  { key: "fullName", label: "Full Name", required: true },
  { key: "gender", label: "Gender", required: false },
  { key: "dateOfBirth", label: "Date of Birth", required: false },
  { key: "className", label: "Class", required: false },
  { key: "programme", label: "Programme", required: false },
  { key: "house", label: "House / Hostel", required: false },
  { key: "guardianName", label: "Guardian Name", required: false },
  { key: "guardianContact", label: "Guardian Contact", required: false },
  { key: "admissionYear", label: "Admission Year", required: false },
] as const;

router.get("/fields", (_req, res) => res.json(STUDENT_FIELDS));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = String(req.query.q || "").trim();
    const className = req.query.className ? String(req.query.className) : undefined;
    const students = await prisma.student.findMany({
      where: {
        AND: [
          query
            ? {
                OR: [
                  { indexNumber: { contains: query, mode: "insensitive" } },
                  { fullName: { contains: query, mode: "insensitive" } },
                ],
              }
            : {},
          className ? { className } : {},
        ],
      },
      take: 50,
      orderBy: { fullName: "asc" },
    });
    res.json(students);
  })
);

router.get(
  "/classes",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.student.findMany({
      where: { className: { not: null } },
      select: { className: true },
      distinct: ["className"],
    });
    res.json(rows.map((r) => r.className).filter(Boolean).sort());
  })
);

router.get(
  "/:indexNumber",
  asyncHandler(async (req, res) => {
    const student = await prisma.student.findUnique({
      where: { indexNumber: req.params.indexNumber },
      include: { assignments: { orderBy: { createdAt: "desc" }, include: { distributor: { select: { name: true } } } } },
    });
    if (!student) return res.status(404).json({ error: "No student found with this index number" });
    res.json(student);
  })
);

// --- Import: step 1, parse the uploaded file and return headers + rows ---
router.post(
  "/import/parse",
  requireRole("SUPER_ADMIN"),
  uploadSpreadsheet.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Upload a .xlsx or .csv file" });
    const isCsv = /\.csv$/i.test(req.file.originalname) || req.file.mimetype === "text/csv";

    let rows: Record<string, unknown>[] = [];
    if (isCsv) {
      const records: Record<string, string>[] = parseCsv(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      });
      rows = records;
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer as unknown as ArrayBuffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) return res.status(400).json({ error: "The file appears to be empty" });
      const headerRow = sheet.getRow(1).values as unknown[];
      const headers = headerRow.slice(1).map((h) => String(h ?? "").trim());
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const values = row.values as unknown[];
        const record: Record<string, unknown> = {};
        headers.forEach((header, idx) => {
          if (!header) return;
          const cell = values[idx + 1];
          record[header] = cell instanceof Date ? cell : cell === undefined || cell === null ? "" : String(cell);
        });
        rows.push(record);
      });
    }

    if (rows.length === 0) return res.status(400).json({ error: "The file appears to be empty" });
    const headers = Object.keys(rows[0]);
    res.json({ headers, rowCount: rows.length, rows: rows.slice(0, 2000) });
  })
);

const commitSchema = z.object({
  mapping: z.record(z.string(), z.string()), // studentField -> source header
  rows: z.array(z.record(z.string(), z.unknown())),
});

router.post(
  "/import/commit",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = commitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid import payload" });
    const { mapping, rows } = parsed.data;
    if (!mapping.indexNumber) return res.status(400).json({ error: "Index Number must be mapped" });

    const knownKeys = new Set(STUDENT_FIELDS.map((f) => f.key));
    const mappedHeaders = new Set(Object.values(mapping));

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const [i, row] of rows.entries()) {
      const indexNumber = String(row[mapping.indexNumber] ?? "").trim();
      if (!indexNumber) {
        errors.push(`Row ${i + 2}: missing Index Number, skipped`);
        continue;
      }
      const data: Record<string, unknown> = {};
      const extraFields: Record<string, unknown> = {};

      for (const [header, value] of Object.entries(row)) {
        const field = Object.entries(mapping).find(([, h]) => h === header)?.[0];
        if (field && knownKeys.has(field as (typeof STUDENT_FIELDS)[number]["key"])) {
          if (field === "dateOfBirth" && value) {
            const d = new Date(value as string);
            data[field] = isNaN(d.getTime()) ? null : d;
          } else if (field !== "indexNumber") {
            data[field] = value === "" ? null : String(value);
          }
        } else if (!mappedHeaders.has(header)) {
          extraFields[header] = value;
        }
      }

      const result = await prisma.student.upsert({
        where: { indexNumber },
        create: {
          indexNumber,
          fullName: String(data.fullName ?? indexNumber),
          ...data,
          extraFields: extraFields as Prisma.InputJsonValue,
        },
        update: { ...data, extraFields: extraFields as Prisma.InputJsonValue },
      });
      if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
      else updated++;
    }

    res.json({ created, updated, errors });
  })
);

export default router;
