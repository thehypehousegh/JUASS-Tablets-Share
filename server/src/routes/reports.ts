import { Router } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { computeFormStatus, FORM_LABELS } from "../utils/academicYear";

const router = Router();
router.use(requireAuth);

export type ReportType =
  | "all_students"
  | "assigned"
  | "not_assigned"
  | "returned"
  | "faulty"
  | "missing"
  | "completed_not_returned";

const REPORT_TYPES: { key: ReportType; label: string }[] = [
  { key: "all_students", label: "All Students" },
  { key: "assigned", label: "Assigned Devices" },
  { key: "not_assigned", label: "Not Assigned" },
  { key: "returned", label: "Returned" },
  { key: "faulty", label: "Faulty" },
  { key: "missing", label: "Missing" },
  { key: "completed_not_returned", label: "Completed but Not Returned" },
];

interface FieldDef {
  key: string;
  label: string;
}

// Custom fields are stored per-student under Student.extraFields, keyed by
// their own slug — prefixed here so they can never collide with a built-in
// column key.
const CUSTOM_FIELD_PREFIX = "custom_";

// Superset of built-in columns any report row could carry. A row only fills
// in the fields relevant to its report type — the rest stay blank — so the
// same field catalog and row shape works for every report without
// special-casing. Custom fields (admin-defined, see CustomField model) are
// appended to this at request time since they can change at any point.
const ALL_FIELDS: FieldDef[] = [
  { key: "indexNumber", label: "Index Number" },
  { key: "fullName", label: "Full Name" },
  { key: "gender", label: "Gender" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "className", label: "Class" },
  { key: "programme", label: "Programme" },
  { key: "house", label: "House / Hostel" },
  { key: "guardianName", label: "Guardian Name" },
  { key: "guardianContact", label: "Guardian Contact" },
  { key: "admissionYear", label: "Year Group (Batch)" },
  { key: "formLabel", label: "Form" },
  { key: "assignmentStatus", label: "Assignment Status" },
  { key: "distributorName", label: "Distributor Name" },
  { key: "imei", label: "Device IMEI" },
  { key: "serialNumber", label: "Serial Number" },
  { key: "embossmentNumber", label: "Embossment Number" },
  { key: "dateAssigned", label: "Date Assigned" },
  { key: "replacementDate", label: "Replacement Date" },
  { key: "returnedDate", label: "Returned Date" },
  { key: "issueType", label: "Issue Type" },
  { key: "issueDescription", label: "Issue Description" },
  { key: "issueStatus", label: "Issue Status" },
  { key: "reportedByName", label: "Reported By" },
  { key: "reviewedByName", label: "Reviewed By" },
  { key: "reviewedAt", label: "Reviewed At" },
  { key: "reviewNote", label: "Review Note" },
];

// Auto-assigned title for each generic report — shown on row 1 of the export
// and above the on-screen preview. The admin can type over it for a custom
// title when they've built a custom column selection.
const DEFAULT_TITLES: Record<ReportType, string> = {
  all_students: "List of All Students",
  assigned: "List of Students Assigned Devices",
  not_assigned: "List of Students Not Assigned Devices",
  returned: "List of Returned Devices",
  faulty: "List of Reported Faulty Devices",
  missing: "List of Reported Missing Devices",
  completed_not_returned: "Completed but Not Returned",
};

// Sensible starting selection per report type — the admin can still add or
// remove any column before viewing/exporting. Custom fields are never in
// the default selection (there's no way to guess which ones matter for a
// given report) — the admin adds them explicitly.
const DEFAULT_FIELDS: Record<ReportType, string[]> = {
  all_students: ["indexNumber", "fullName", "gender", "className", "admissionYear", "assignmentStatus"],
  assigned: [
    "indexNumber",
    "fullName",
    "className",
    "admissionYear",
    "distributorName",
    "imei",
    "serialNumber",
    "embossmentNumber",
    "dateAssigned",
  ],
  not_assigned: ["indexNumber", "fullName", "gender", "className", "admissionYear"],
  returned: ["indexNumber", "fullName", "className", "admissionYear", "imei", "serialNumber", "dateAssigned", "returnedDate"],
  faulty: ["indexNumber", "fullName", "className", "imei", "serialNumber", "issueDescription", "issueStatus", "reportedByName", "reviewedByName"],
  missing: ["indexNumber", "fullName", "className", "imei", "serialNumber", "issueDescription", "issueStatus", "reportedByName", "reviewedByName"],
  completed_not_returned: [
    "indexNumber",
    "fullName",
    "className",
    "admissionYear",
    "formLabel",
    "distributorName",
    "imei",
    "serialNumber",
    "dateAssigned",
  ],
};

async function loadFieldCatalog(): Promise<FieldDef[]> {
  const customFields = await prisma.customField.findMany({ orderBy: { createdAt: "asc" } });
  return [...ALL_FIELDS, ...customFields.map((f) => ({ key: `${CUSTOM_FIELD_PREFIX}${f.key}`, label: f.label }))];
}

router.get(
  "/types",
  asyncHandler(async (_req, res) => {
    const fields = await loadFieldCatalog();
    // Lets the Reports page flag a report as needing attention (e.g. a red
    // button) before the admin has even opened it.
    const completedNotReturned = await fetchRows(fields, "completed_not_returned", {});
    res.json({
      types: REPORT_TYPES,
      fields,
      defaultFields: DEFAULT_FIELDS,
      defaultTitles: DEFAULT_TITLES,
      alertCounts: { completed_not_returned: completedNotReturned.length },
    });
  })
);

function dateStr(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : "";
}

type Row = Record<string, string>;

function blankRow(catalog: FieldDef[]): Row {
  const row: Row = {};
  for (const f of catalog) row[f.key] = "";
  return row;
}

function studentFields(s: {
  indexNumber: string;
  fullName: string;
  gender: string | null;
  dateOfBirth: Date | null;
  className: string | null;
  programme: string | null;
  house: string | null;
  guardianName: string | null;
  guardianContact: string | null;
  admissionYear: string | null;
  extraFields: unknown;
}): Row {
  const extra = (s.extraFields as Record<string, unknown>) || {};
  const row: Row = {
    indexNumber: s.indexNumber,
    fullName: s.fullName,
    gender: s.gender ?? "",
    dateOfBirth: dateStr(s.dateOfBirth),
    className: s.className ?? "",
    programme: s.programme ?? "",
    house: s.house ?? "",
    guardianName: s.guardianName ?? "",
    guardianContact: s.guardianContact ?? "",
    admissionYear: s.admissionYear ?? "",
    formLabel: FORM_LABELS[computeFormStatus(s.admissionYear)],
  };
  for (const [key, value] of Object.entries(extra)) {
    row[`${CUSTOM_FIELD_PREFIX}${key}`] = value === null || value === undefined ? "" : String(value);
  }
  return row;
}

async function fetchRows(
  catalog: FieldDef[],
  type: ReportType,
  filters: { className?: string; year?: string; q?: string }
): Promise<Row[]> {
  const { className, year, q } = filters;
  const studentTextSearch = q
    ? [{ indexNumber: { contains: q, mode: "insensitive" as const } }, { fullName: { contains: q, mode: "insensitive" as const } }]
    : undefined;

  if (type === "all_students" || type === "not_assigned") {
    const students = await prisma.student.findMany({
      where: {
        className: className || undefined,
        admissionYear: year || undefined,
        OR: studentTextSearch,
        assignments: type === "not_assigned" ? { none: { status: "WITH_STUDENT" } } : undefined,
      },
      include:
        type === "all_students"
          ? { assignments: { where: { status: "WITH_STUDENT" }, take: 1, include: { distributor: { select: { name: true } } } } }
          : undefined,
      orderBy: [{ admissionYear: "desc" }, { className: "asc" }, { fullName: "asc" }],
      take: 10000,
    });
    return students.map((s) => {
      const row = { ...blankRow(catalog), ...studentFields(s) };
      if (type === "all_students") {
        const active = (
          s as unknown as {
            assignments?: {
              imei: string;
              serialNumber: string;
              embossmentNumber: string | null;
              dateAssigned: Date;
              distributor: { name: string };
            }[];
          }
        ).assignments?.[0];
        row.assignmentStatus = active ? "With Student" : "Not Assigned";
        if (active) {
          row.distributorName = active.distributor.name;
          row.imei = active.imei;
          row.serialNumber = active.serialNumber;
          row.embossmentNumber = active.embossmentNumber ?? "";
          row.dateAssigned = dateStr(active.dateAssigned);
        }
      }
      return row;
    });
  }

  if (type === "assigned" || type === "returned") {
    const status = type === "assigned" ? "WITH_STUDENT" : "RETURNED";
    const assignments = await prisma.deviceAssignment.findMany({
      where: {
        status,
        student: { className: className || undefined, admissionYear: year || undefined, OR: studentTextSearch },
      },
      include: { student: true, distributor: { select: { name: true } } },
      orderBy: [{ student: { admissionYear: "desc" } }, { student: { className: "asc" } }, { student: { fullName: "asc" } }],
      take: 10000,
    });
    return assignments.map((a) => ({
      ...blankRow(catalog),
      ...studentFields(a.student),
      assignmentStatus: a.status === "WITH_STUDENT" ? "With Student" : "Returned",
      distributorName: a.distributor.name,
      imei: a.imei,
      serialNumber: a.serialNumber,
      embossmentNumber: a.embossmentNumber ?? "",
      dateAssigned: dateStr(a.dateAssigned),
      replacementDate: dateStr(a.replacementDate),
      returnedDate: dateStr(a.returnedDate),
    }));
  }

  if (type === "completed_not_returned") {
    const students = await prisma.student.findMany({
      where: {
        className: className || undefined,
        admissionYear: year || undefined,
        OR: studentTextSearch,
      },
      include: {
        assignments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { distributor: { select: { name: true } }, issueReports: true },
        },
      },
      take: 10000,
    });
    return students
      .filter((s) => computeFormStatus(s.admissionYear) === "COMPLETED")
      .map((s) => ({ ...s, latest: s.assignments[0] }))
      .filter((s) => s.latest?.status === "WITH_STUDENT")
      .filter((s) => !s.latest!.issueReports.some((r) => r.type === "MISSING"))
      .map((s) => ({
        ...blankRow(catalog),
        ...studentFields(s),
        assignmentStatus: "With Student",
        distributorName: s.latest!.distributor.name,
        imei: s.latest!.imei,
        serialNumber: s.latest!.serialNumber,
        embossmentNumber: s.latest!.embossmentNumber ?? "",
        dateAssigned: dateStr(s.latest!.dateAssigned),
      }));
  }

  // faulty / missing
  const issueType = type === "faulty" ? "FAULTY" : "MISSING";
  const issues = await prisma.deviceIssueReport.findMany({
    where: {
      type: issueType,
      assignment: { student: { className: className || undefined, admissionYear: year || undefined, OR: studentTextSearch } },
    },
    include: {
      assignment: { include: { student: true, distributor: { select: { name: true } } } },
      reportedBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });
  return issues
    .filter((i) => i.assignment)
    .map((i) => {
      const a = i.assignment!;
      return {
        ...blankRow(catalog),
        ...studentFields(a.student),
        assignmentStatus: a.status === "WITH_STUDENT" ? "With Student" : a.status === "RETURNED" ? "Returned" : "Replaced",
        distributorName: a.distributor.name,
        imei: a.imei,
        serialNumber: a.serialNumber,
        embossmentNumber: a.embossmentNumber ?? "",
        dateAssigned: dateStr(a.dateAssigned),
        issueType: i.type === "FAULTY" ? "Faulty" : "Missing",
        issueDescription: i.description,
        issueStatus: i.status === "PENDING" ? "Pending" : i.status === "APPROVED" ? "Approved" : "Rejected",
        reportedByName: i.reportedBy.name,
        reviewedByName: i.reviewedBy?.name ?? "",
        reviewedAt: i.reviewedAt ? i.reviewedAt.toISOString().slice(0, 10) : "",
        reviewNote: i.reviewNote ?? "",
      };
    });
}

function parseLabelOverrides(req: import("express").Request): Record<string, string> {
  if (!req.query.labels) return {};
  try {
    const parsed = JSON.parse(String(req.query.labels));
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function parseParams(req: import("express").Request, catalog: FieldDef[]) {
  const type = String(req.query.type || "all_students") as ReportType;
  if (!REPORT_TYPES.some((t) => t.key === type)) return null;
  const fieldKeys = new Set(catalog.map((f) => f.key));
  const className = req.query.className ? String(req.query.className) : undefined;
  const year = req.query.year ? String(req.query.year) : undefined;
  const q = req.query.q ? String(req.query.q) : undefined;
  const rawFields = req.query.fields ? String(req.query.fields).split(",").map((f) => f.trim()) : DEFAULT_FIELDS[type];
  const fields = rawFields.filter((f) => fieldKeys.has(f));
  const rawTitle = req.query.title ? String(req.query.title).trim() : "";
  const title = rawTitle || DEFAULT_TITLES[type];
  const labelOverrides = parseLabelOverrides(req);
  return { type, className, year, q, fields: fields.length > 0 ? fields : DEFAULT_FIELDS[type], title, labelOverrides };
}

router.get(
  "/data",
  asyncHandler(async (req, res) => {
    const catalog = await loadFieldCatalog();
    const params = parseParams(req, catalog);
    if (!params) return res.status(400).json({ error: "Unknown report type" });
    const labelByKey = new Map(catalog.map((f) => [f.key, f.label]));
    const rows = await fetchRows(catalog, params.type, params);
    res.json({
      title: params.title,
      generatedAt: dateStr(new Date()),
      fields: params.fields,
      columnLabels: Object.fromEntries(params.fields.map((f) => [f, params.labelOverrides[f] || labelByKey.get(f) || f])),
      rowCount: rows.length,
      rows: rows.map((r) => {
        const out: Row = {};
        for (const f of params.fields) out[f] = r[f];
        return out;
      }),
    });
  })
);

router.get(
  "/export.xlsx",
  asyncHandler(async (req, res) => {
    const catalog = await loadFieldCatalog();
    const params = parseParams(req, catalog);
    if (!params) return res.status(400).json({ error: "Unknown report type" });
    const rows = await fetchRows(catalog, params.type, params);
    const labelByKey = new Map(catalog.map((f) => [f.key, f.label]));

    const workbook = new ExcelJS.Workbook();
    const typeLabel = REPORT_TYPES.find((t) => t.key === params.type)?.label || "Report";
    const sheet = workbook.addWorksheet(typeLabel.slice(0, 31));
    const numCols = Math.max(params.fields.length, 1);

    // Row 1: report title. Row 2: generation date. Row 3 stays blank as a
    // spacer. Row 4: column headers, data from row 5.
    sheet.mergeCells(1, 1, 1, numCols);
    sheet.getCell(1, 1).value = params.title;
    sheet.getCell(1, 1).font = { bold: true, size: 14 };

    sheet.mergeCells(2, 1, 2, numCols);
    sheet.getCell(2, 1).value = `Generated on ${dateStr(new Date())}`;
    sheet.getCell(2, 1).font = { italic: true, size: 10, color: { argb: "FF616A80" } };

    const headerRowNum = 4;
    const headerRow = sheet.getRow(headerRowNum);
    params.fields.forEach((key, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = params.labelOverrides[key] || labelByKey.get(key) || key;
    });
    headerRow.font = { bold: true };
    params.fields.forEach((_key, idx) => {
      sheet.getColumn(idx + 1).width = 20;
    });

    for (const row of rows) {
      sheet.addRow(params.fields.map((f) => row[f]));
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=juass-report-${params.type}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  })
);

export default router;
