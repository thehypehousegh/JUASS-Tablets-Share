import { Router } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

export type ReportType = "all_students" | "assigned" | "not_assigned" | "returned" | "faulty" | "missing";

const REPORT_TYPES: { key: ReportType; label: string }[] = [
  { key: "all_students", label: "All Students" },
  { key: "assigned", label: "Assigned Devices" },
  { key: "not_assigned", label: "Not Assigned" },
  { key: "returned", label: "Returned" },
  { key: "faulty", label: "Faulty" },
  { key: "missing", label: "Missing" },
];

interface FieldDef {
  key: string;
  label: string;
}

// Superset of columns any report row could carry. A row only fills in the
// fields relevant to its report type — the rest stay blank — so the same
// field catalog and row shape works for every report without special-casing.
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

const FIELD_KEYS = new Set(ALL_FIELDS.map((f) => f.key));

// Sensible starting selection per report type — the admin can still add or
// remove any column before viewing/exporting.
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
};

router.get("/types", (_req, res) => {
  res.json({
    types: REPORT_TYPES,
    fields: ALL_FIELDS,
    defaultFields: DEFAULT_FIELDS,
  });
});

function dateStr(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : "";
}

type Row = Record<string, string>;

function blankRow(): Row {
  const row: Row = {};
  for (const f of ALL_FIELDS) row[f.key] = "";
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
}): Row {
  return {
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
  };
}

async function fetchRows(
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
      include: type === "all_students" ? { assignments: { where: { status: "WITH_STUDENT" }, take: 1 } } : undefined,
      orderBy: [{ admissionYear: "desc" }, { className: "asc" }, { fullName: "asc" }],
      take: 10000,
    });
    return students.map((s) => {
      const row = { ...blankRow(), ...studentFields(s) };
      if (type === "all_students") {
        const active = (s as unknown as { assignments?: { status: string }[] }).assignments?.[0];
        row.assignmentStatus = active ? "With Student" : "Not Assigned";
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
      ...blankRow(),
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
        ...blankRow(),
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

function parseParams(req: import("express").Request) {
  const type = String(req.query.type || "all_students") as ReportType;
  if (!REPORT_TYPES.some((t) => t.key === type)) return null;
  const className = req.query.className ? String(req.query.className) : undefined;
  const year = req.query.year ? String(req.query.year) : undefined;
  const q = req.query.q ? String(req.query.q) : undefined;
  const rawFields = req.query.fields ? String(req.query.fields).split(",").map((f) => f.trim()) : DEFAULT_FIELDS[type];
  const fields = rawFields.filter((f) => FIELD_KEYS.has(f));
  return { type, className, year, q, fields: fields.length > 0 ? fields : DEFAULT_FIELDS[type] };
}

router.get(
  "/data",
  asyncHandler(async (req, res) => {
    const params = parseParams(req);
    if (!params) return res.status(400).json({ error: "Unknown report type" });
    const rows = await fetchRows(params.type, params);
    res.json({
      fields: params.fields,
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
    const params = parseParams(req);
    if (!params) return res.status(400).json({ error: "Unknown report type" });
    const rows = await fetchRows(params.type, params);
    const labelByKey = new Map(ALL_FIELDS.map((f) => [f.key, f.label]));

    const workbook = new ExcelJS.Workbook();
    const typeLabel = REPORT_TYPES.find((t) => t.key === params.type)?.label || "Report";
    const sheet = workbook.addWorksheet(typeLabel.slice(0, 31));
    sheet.columns = params.fields.map((key) => ({ header: labelByKey.get(key) || key, key, width: 20 }));
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      const record: Row = {};
      for (const f of params.fields) record[f] = row[f];
      sheet.addRow(record);
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=juass-report-${params.type}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  })
);

export default router;
