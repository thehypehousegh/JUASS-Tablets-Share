import { useEffect, useState } from "react";
import { apiGet, apiSend, ApiError } from "../api";
import { useAuth } from "../auth/AuthContext";

interface StudentRow {
  id: string;
  indexNumber: string;
  fullName: string;
  gender: string | null;
  dateOfBirth: string | null;
  className: string | null;
  programme: string | null;
  house: string | null;
  guardianName: string | null;
  guardianContact: string | null;
  admissionYear: string | null;
  assignments: { status: string }[];
}

const EDIT_FIELDS: { key: keyof StudentRow; label: string; required?: boolean }[] = [
  { key: "indexNumber", label: "Index Number", required: true },
  { key: "fullName", label: "Full Name", required: true },
  { key: "gender", label: "Gender" },
  { key: "className", label: "Class" },
  { key: "programme", label: "Programme" },
  { key: "house", label: "House / Hostel" },
  { key: "guardianName", label: "Guardian Name" },
  { key: "guardianContact", label: "Guardian Contact" },
  { key: "admissionYear", label: "Year Group (Batch)" },
];

export default function Students() {
  const { user } = useAuth();
  const isAdmin = user?.role === "SUPER_ADMIN";
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [q, setQ] = useState("");
  const [className, setClassName] = useState("");
  const [year, setYear] = useState("");
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StudentRow | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (className) params.set("className", className);
      if (year) params.set("year", year);
      const data = await apiGet(`/students?${params.toString()}`);
      setRows(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load student records");
    } finally {
      setLoading(false);
    }
  }

  function loadFilterOptions() {
    apiGet("/students/classes").then(setClassOptions).catch(() => null);
    apiGet("/students/years").then(setYearOptions).catch(() => null);
  }

  useEffect(() => {
    load();
    loadFilterOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <h2>Student Records</h2>
      <p className="hint-text">Search across all imported students by name, index number, class, or year group.</p>

      <div className="card filter-row">
        <input
          type="text"
          placeholder="Search by name or index number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All year groups</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select value={className} onChange={(e) => setClassName(e.target.value)}>
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button className="btn-secondary" onClick={load}>
          Search
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Index No.</th>
                <th>Name</th>
                <th>Gender</th>
                <th>Class</th>
                <th>Year Group</th>
                <th>Device Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.indexNumber}>
                  <td>{s.indexNumber}</td>
                  <td>{s.fullName}</td>
                  <td>{s.gender || "—"}</td>
                  <td>{s.className || "—"}</td>
                  <td>{s.admissionYear || "—"}</td>
                  <td>{s.assignments.length > 0 ? "Has a device" : "Not yet received"}</td>
                  {isAdmin && (
                    <td>
                      <button className="btn-link" onClick={() => setEditing(s)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6}>No students found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {rows.length >= 200 && (
        <p className="hint-text">Showing the first 200 matches — narrow your search to see more specific results.</p>
      )}

      {isAdmin && (
        <BulkDeletePanel
          yearOptions={yearOptions}
          classOptions={classOptions}
          onDeleted={() => {
            load();
            loadFilterOptions();
          }}
        />
      )}

      {editing && (
        <EditStudentModal
          student={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setRows((rs) => rs.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
            setEditing(null);
            loadFilterOptions();
          }}
        />
      )}
    </div>
  );
}

function EditStudentModal({
  student,
  onClose,
  onSaved,
}: {
  student: StudentRow;
  onClose: () => void;
  onSaved: (updated: StudentRow) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of EDIT_FIELDS) v[String(f.key)] = (student[f.key] as string) || "";
    return v;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!values.indexNumber.trim() || !values.fullName.trim()) {
      setError("Index Number and Full Name are required");
      return;
    }
    setSaving(true);
    try {
      const data: Record<string, string | null> = {};
      for (const f of EDIT_FIELDS) {
        const v = values[String(f.key)]?.trim() || "";
        data[String(f.key)] = v || null;
      }
      const updated = await apiSend("PATCH", `/students/${student.id}`, data);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal" onSubmit={submit}>
        <div className="modal-header">
          <h3>Edit Student Record</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="hint-text">
          Correct anomalies in this record — this works the same whether the student has no device, an active one, a
          replacement, or a returned one.
        </p>
        <div className="grid-2">
          {EDIT_FIELDS.map((f) => (
            <div className="field" key={String(f.key)}>
              <label>
                {f.label}
                {f.required ? " *" : ""}
              </label>
              <input
                type="text"
                value={values[String(f.key)] || ""}
                onChange={(e) => setValues((v) => ({ ...v, [String(f.key)]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </form>
    </div>
  );
}

function BulkDeletePanel({
  yearOptions,
  classOptions,
  onDeleted,
}: {
  yearOptions: string[];
  classOptions: string[];
  onDeleted: () => void;
}) {
  const [year, setYear] = useState("");
  const [className, setClassName] = useState("");
  const [preview, setPreview] = useState<{ studentCount: number; assignmentCount: number; issueReportCount: number } | null>(
    null
  );
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const scopeLabel = [year && `Year Group ${year}`, className && `Class ${className}`].filter(Boolean).join(" + ");

  async function loadPreview() {
    setError(null);
    setResult(null);
    setPreview(null);
    setConfirmText("");
    if (!year && !className) {
      setError("Select a year group or class first");
      return;
    }
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (year) params.set("year", year);
      if (className) params.set("className", className);
      const res = await apiGet(`/students/bulk-delete/preview?${params.toString()}`);
      setPreview(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load preview");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (confirmText !== "DELETE") return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend("POST", "/students/bulk-delete", { year: year || undefined, className: className || undefined });
      setResult(
        `Deleted ${res.deletedStudents} student(s), ${res.deletedAssignments} assignment(s), and ${res.deletedIssueReports} issue report(s) in ${scopeLabel}.`
      );
      setPreview(null);
      setConfirmText("");
      setYear("");
      setClassName("");
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete these records");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card section-heading">
      <h3>Delete Students by Year Group / Class</h3>
      <p className="warn-text">
        Permanently removes matching student records, along with any device assignments and issue reports tied to
        them. This cannot be undone — download a backup first (Settings & Backup) if there's any doubt.
      </p>
      <div className="grid-2">
        <div className="field">
          <label>Year Group</label>
          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setPreview(null);
            }}
          >
            <option value="">Not selected</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Class</label>
          <select
            value={className}
            onChange={(e) => {
              setClassName(e.target.value);
              setPreview(null);
            }}
          >
            <option value="">Not selected</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!preview && (
        <button className="btn-secondary" onClick={loadPreview} disabled={busy}>
          {busy ? "Checking…" : "Preview"}
        </button>
      )}

      {preview && (
        <div>
          <p className="error-text">
            This will permanently delete <strong>{preview.studentCount}</strong> student record(s),{" "}
            <strong>{preview.assignmentCount}</strong> device assignment(s), and{" "}
            <strong>{preview.issueReportCount}</strong> issue report(s) in {scopeLabel}.
          </p>
          <div className="field">
            <label>Type DELETE to confirm</label>
            <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
          </div>
          <div className="actions-cell">
            <button className="btn-secondary" onClick={doDelete} disabled={busy || confirmText !== "DELETE"}>
              {busy ? "Deleting…" : "Delete Permanently"}
            </button>
            <button className="btn-link" onClick={() => setPreview(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
      {result && <p className="success-text">{result}</p>}
    </div>
  );
}
