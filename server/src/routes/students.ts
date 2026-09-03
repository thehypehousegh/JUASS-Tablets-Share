import { Router } from "express";
import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { uploadSpreadsheet } from "../middleware/upload";
import { computeFormStatus, FORM_LABELS } from "../utils/academicYear";

const router = Router();
router.use(requireAuth);

// Attaches the student's current Form (derived from Year Group, see
// utils/academicYear.ts) to whatever's being returned, so the client never
// has to duplicate — and risk drifting from — this computation.
function withFormStatus<T extends { admissionYear: string | null }>(student: T) {
  const formStatus = computeFormStatus(student.admissionYear);
  return { ...student, formStatus, formLabel: FORM_LABELS[formStatus] };
}

export const STUDENT_FIELDS = [
  { key: "indexNumber", label: "Index Number", required: true },
  { key: "fullName", label: "Full Name", required: true },
  { key: "gender", label: "Gender", required: false },
  { key: "dateOfBirth", label: "Date of Birth", required: false },
  { key: "className", label: "Class", required: false },
  { key: "programme", label: "Programme", required: false },
  { key: "house", label: "House / Hostel", required: false },
  { key: "guardianName", label: "Guardian Name", required: false },
  { key: "guardianContact", label: "Guardian Contact", required: false },
  { key: "admissionYear", label: "Year Group (Batch)", required: false },
] as const;

router.get("/fields", (_req, res) => res.json(STUDENT_FIELDS));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = String(req.query.q || "").trim();
    const className = req.query.className ? String(req.query.className) : undefined;
    const year = req.query.year ? String(req.query.year) : undefined;
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
          year ? { admissionYear: year } : {},
        ],
      },
      // No status filter here — a student's most recent assignment might be
      // RETURNED, and that's still meaningful ("has received a device
      // before") rather than "not yet received", which a WITH_STUDENT/
      // REPLACED-only filter would otherwise misreport.
      include: { assignments: { take: 1, orderBy: { createdAt: "desc" } } },
      take: 200,
      orderBy: [{ admissionYear: "desc" }, { className: "asc" }, { fullName: "asc" }],
    });
    res.json(students.map(withFormStatus));
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
  "/years",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.student.findMany({
      where: { admissionYear: { not: null } },
      select: { admissionYear: true },
      distinct: ["admissionYear"],
    });
    res.json(
      rows
        .map((r) => r.admissionYear)
        .filter((y): y is string => !!y)
        .sort((a, b) => b.localeCompare(a))
    );
  })
);

function bulkDeleteWhere(year?: string, className?: string) {
  if (!year && !className) return null;
  return { admissionYear: year || undefined, className: className || undefined };
}

// Preview and bulk-delete are scoped to a year group and/or class on
// purpose — there's no "delete everything" button, to make an accidental
// wipe of the whole roster harder to trigger.
router.get(
  "/bulk-delete/preview",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const year = req.query.year ? String(req.query.year) : undefined;
    const className = req.query.className ? String(req.query.className) : undefined;
    const where = bulkDeleteWhere(year, className);
    if (!where) return res.status(400).json({ error: "Select a year group or class first" });

    const students = await prisma.student.findMany({ where, select: { id: true } });
    const studentIds = students.map((s) => s.id);
    const [assignmentCount, issueReportCount] = await Promise.all([
      prisma.deviceAssignment.count({ where: { studentId: { in: studentIds } } }),
      prisma.deviceIssueReport.count({ where: { assignment: { studentId: { in: studentIds } } } }),
    ]);
    res.json({ studentCount: studentIds.length, assignmentCount, issueReportCount });
  })
);

const bulkDeleteSchema = z.object({
  year: z.string().optional(),
  className: z.string().optional(),
});

router.post(
  "/bulk-delete",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = bulkDeleteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
    const where = bulkDeleteWhere(parsed.data.year, parsed.data.className);
    if (!where) return res.status(400).json({ error: "Select a year group or class first" });

    const students = await prisma.student.findMany({ where, select: { id: true } });
    const studentIds = students.map((s) => s.id);
    if (studentIds.length === 0) {
      return res.json({ deletedStudents: 0, deletedAssignments: 0, deletedIssueReports: 0 });
    }

    const [issueReports, assignments, deletedStudents] = await prisma.$transaction([
      prisma.deviceIssueReport.deleteMany({ where: { assignment: { studentId: { in: studentIds } } } }),
      prisma.deviceAssignment.deleteMany({ where: { studentId: { in: studentIds } } }),
      prisma.student.deleteMany({ where: { id: { in: studentIds } } }),
    ]);

    res.json({
      deletedStudents: deletedStudents.count,
      deletedAssignments: assignments.count,
      deletedIssueReports: issueReports.count,
    });
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
    res.json(withFormStatus(student));
  })
);

const studentUpdateSchema = z.object({
  indexNumber: z.string().min(1).optional(),
  fullName: z.string().min(1).optional(),
  gender: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  className: z.string().nullable().optional(),
  programme: z.string().nullable().optional(),
  house: z.string().nullable().optional(),
  guardianName: z.string().nullable().optional(),
  guardianContact: z.string().nullable().optional(),
  admissionYear: z.string().nullable().optional(),
});

// Editing a student's record is independent of any assignment they have —
// works the same whether they have no device yet, an active one, a
// replaced one, or a returned one. Lets an Admin correct anomalies (a
// misspelled name, wrong class, mistyped index number, etc.) at any time,
// including right in the middle of the Assign Device flow.
router.patch(
  "/:id",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = studentUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid data" });

    const { dateOfBirth, ...rest } = parsed.data;
    const data: Prisma.StudentUpdateInput = { ...rest };
    if (dateOfBirth !== undefined) {
      data.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    }

    const student = await prisma.student
      .update({ where: { id: req.params.id }, data })
      .catch((e: { code?: string }) => {
        if (e?.code === "P2002") return "DUPLICATE" as const;
        if (e?.code === "P2025") return "NOT_FOUND" as const;
        throw e;
      });
    if (student === "NOT_FOUND") return res.status(404).json({ error: "Student not found" });
    if (student === "DUPLICATE") return res.status(409).json({ error: "Another student already has this index number" });
    res.json(student);
  })
);

// --- Import: step 1, parse the uploaded file and return headers + rows ---
//
// Real admission-data files routinely don't have their column headings on
// row 1 — a title banner, a submission-deadline note, an instructions line,
// etc. often sit above the real header row. So this doesn't assume row 1:
// it first reduces the file (whichever sheet, xlsx or csv) to a plain grid
// of rows, and if the caller hasn't said which row is the header yet, it
// hands back a preview of that grid for them to look at and choose from —
// same idea as the sheet picker, one step further in.
router.post(
  "/import/parse",
  requireRole("SUPER_ADMIN"),
  uploadSpreadsheet.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Upload a .xlsx or .csv file" });
    const isCsv = /\.csv$/i.test(req.file.originalname) || req.file.mimetype === "text/csv";

    let grid: string[][] = [];
    let sheetName: string | undefined;

    if (isCsv) {
      const records: string[][] = parseCsv(req.file.buffer, {
        columns: false,
        skip_empty_lines: false,
        trim: true,
        bom: true,
        relax_column_count: true,
      });
      grid = records.map((row) => row.map((cell) => String(cell ?? "")));
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer as unknown as ArrayBuffer);
      const sheetNames = workbook.worksheets.map((w) => w.name);

      const requestedSheet = req.body.sheet ? String(req.body.sheet) : undefined;
      const sheet = requestedSheet ? workbook.getWorksheet(requestedSheet) : workbook.worksheets[0];

      // More than one sheet and the caller hasn't said which one yet — ask,
      // rather than silently importing whatever happens to be first.
      if (!requestedSheet && sheetNames.length > 1) {
        return res.json({ needsSheetSelection: true, sheets: sheetNames });
      }
      if (!sheet) return res.status(400).json({ error: `Sheet "${requestedSheet}" was not found in this file` });
      sheetName = sheet.name;

      let maxCol = sheet.columnCount || 0;
      sheet.eachRow((row) => {
        if (row.cellCount > maxCol) maxCol = row.cellCount;
      });

      for (let r = 1; r <= sheet.rowCount; r++) {
        const values = sheet.getRow(r).values as unknown[];
        const rowArr: string[] = [];
        for (let c = 1; c <= maxCol; c++) {
          const cell = values[c];
          rowArr.push(cell instanceof Date ? cell.toISOString() : cell === undefined || cell === null ? "" : String(cell).trim());
        }
        grid.push(rowArr);
      }
    }

    if (grid.length === 0) return res.status(400).json({ error: "The file appears to be empty" });

    const noHeaderRow = String(req.body.noHeaderRow) === "true";
    const headerRow = req.body.headerRow ? parseInt(String(req.body.headerRow), 10) : undefined;
    if (!headerRow && !noHeaderRow) {
      return res.json({
        needsHeaderSelection: true,
        sheet: sheetName,
        rowCount: grid.length,
        preview: grid.slice(0, 20),
      });
    }
    if (headerRow && (headerRow < 1 || headerRow > grid.length)) {
      return res.status(400).json({ error: `Row ${headerRow} doesn't exist in this sheet` });
    }

    // Some raw exports have no header row at all — every row is data. In
    // that case there's nothing to pick as headings, so generic column
    // names ("Column 1", "Column 2", ...) stand in; the caller can rename
    // any of them before matching, same as it can rename a real header.
    const dataStartRow = req.body.dataStartRow
      ? parseInt(String(req.body.dataStartRow), 10)
      : noHeaderRow
        ? 1
        : (headerRow as number) + 1;
    let headers: string[];
    if (noHeaderRow) {
      const colCount = grid.reduce((max, row) => Math.max(max, row.length), 0);
      headers = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`);
    } else {
      headers = grid[(headerRow as number) - 1].map((h) => h.trim());
      if (headers.every((h) => !h)) {
        return res.status(400).json({ error: `Row ${headerRow} doesn't look like a header row — every cell is blank` });
      }
    }

    const rows: Record<string, unknown>[] = [];
    for (let i = Math.max(dataStartRow - 1, 0); i < grid.length; i++) {
      const rowArr = grid[i];
      if (rowArr.every((c) => !c.trim())) continue; // skip blank rows rather than importing empty students
      const record: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        if (!header) return;
        record[header] = rowArr[idx] ?? "";
      });
      rows.push(record);
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: `No data found starting at row ${dataStartRow} — check the row numbers` });
    }
    res.json({ headers, rowCount: rows.length, rows: rows.slice(0, 2000), sheet: sheetName, headerRow, dataStartRow });
  })
);

const commitSchema = z.object({
  mapping: z.record(z.string(), z.string()), // targetField -> source header
  // targetField -> a single value applied to every row, for fields that
  // aren't in the file at all but are the same for the whole batch (e.g.
  // Year Group = 2026 for every student in this import).
  constants: z.record(z.string(), z.string()).optional(),
  rows: z.array(z.record(z.string(), z.unknown())),
});

router.post(
  "/import/commit",
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = commitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid import payload" });
    const { mapping, rows } = parsed.data;
    const constants = parsed.data.constants || {};
    if (!mapping.indexNumber) return res.status(400).json({ error: "Index Number must be mapped" });

    const knownKeys = new Set(STUDENT_FIELDS.map((f) => f.key));
    const customFields = await prisma.customField.findMany();
    const customKeys = new Set(customFields.map((f) => f.key));
    const mappedHeaders = new Set(Object.values(mapping));
    // Every target field this import batch touches, whether via a mapped
    // column or a fixed value for every row.
    const targetFields = new Set([...Object.keys(mapping), ...Object.keys(constants)]);

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

      for (const field of targetFields) {
        if (field === "indexNumber") continue;
        const header = mapping[field];
        const rawValue = header !== undefined ? row[header] : constants[field];
        if (knownKeys.has(field as (typeof STUDENT_FIELDS)[number]["key"])) {
          if (field === "dateOfBirth" && rawValue) {
            const d = new Date(rawValue as string);
            data[field] = isNaN(d.getTime()) ? null : d;
          } else {
            data[field] = rawValue === "" || rawValue === undefined ? null : String(rawValue);
          }
        } else if (customKeys.has(field)) {
          extraFields[field] = rawValue === undefined ? "" : rawValue;
        }
      }

      // Safety net: any file column not claimed by any target field's
      // mapping is still preserved verbatim under its original heading, so
      // an admin who hasn't defined a custom field for it yet doesn't lose it.
      for (const [header, value] of Object.entries(row)) {
        if (!mappedHeaders.has(header)) extraFields[header] = value;
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

const customFieldValuesSchema = z.object({
  values: z.record(z.string(), z.string().nullable()),
});

// Lets a Distributor (not just an Admin) fill in custom-field values for a
// student at assignment time — e.g. a field that isn't in the admission
// data and has to be captured per-student. Deliberately narrower than the
// full-record PATCH above: it can only touch extraFields, never core
// identity fields like index number or name.
router.patch(
  "/:id/custom-fields",
  requireRole("SUPER_ADMIN", "DISTRIBUTOR"),
  asyncHandler(async (req, res) => {
    const parsed = customFieldValuesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid data" });

    const student = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const existing = (student.extraFields as Record<string, unknown>) || {};
    const merged = { ...existing };
    for (const [key, value] of Object.entries(parsed.data.values)) {
      merged[key] = value === null ? "" : value;
    }

    const updated = await prisma.student.update({
      where: { id: student.id },
      data: { extraFields: merged as Prisma.InputJsonValue },
    });
    res.json(updated);
  })
);

export default router;
