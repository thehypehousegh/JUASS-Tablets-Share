import { useEffect, useState } from "react";
import { apiDownload, apiGet, apiSend, ApiError } from "../api";
import StatusBadge from "../components/StatusBadge";
import ScanInput from "../components/ScanInput";
import { embossmentYearSuffix, previewEmbossmentNumber } from "../lib/embossment";

interface Assignment {
  id: string;
  imei: string;
  serialNumber: string;
  embossmentNumber: string | null;
  dateAssigned: string;
  replacementDate: string | null;
  returnedDate: string | null;
  replacementReason: "FAULTY" | "MISSING" | "OTHER" | null;
  replacementNote: string | null;
  returnReason: "COMPLETED" | "WITHDRAWN" | "OTHER" | null;
  returnNote: string | null;
  status: "WITH_STUDENT" | "REPLACED" | "RETURNED";
  student: { id: string; indexNumber: string; fullName: string; className: string | null; admissionYear: string | null };
  distributor: { name: string };
}

interface IssueReport {
  id: string;
  type: "FAULTY" | "MISSING";
  description: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reportedBy: { name: string };
  reviewedBy: { name: string } | null;
}

interface HistoryAssignment extends Assignment {
  issueReports: IssueReport[];
}

const REPLACEMENT_REASON_LABELS: Record<string, string> = { FAULTY: "Faulty", MISSING: "Missing", OTHER: "Other" };
const RETURN_REASON_LABELS: Record<string, string> = { COMPLETED: "Completed", WITHDRAWN: "Withdrawn", OTHER: "Other" };

export default function Assignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [className, setClassName] = useState("");
  const [year, setYear] = useState("");
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [replacing, setReplacing] = useState<Assignment | null>(null);
  const [returning, setReturning] = useState<Assignment | null>(null);
  const [historyFor, setHistoryFor] = useState<Assignment | null>(null);
  const [error, setError] = useState<string | null>(null);

  function buildParams() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (className) params.set("className", className);
    if (year) params.set("year", year);
    return params;
  }

  async function load() {
    setLoading(true);
    try {
      const data = await apiGet(`/assignments?${buildParams().toString()}`);
      setAssignments(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load assignments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    apiGet("/students/classes").then(setClassOptions).catch(() => null);
    apiGet("/students/years").then(setYearOptions).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <h2>Device Assignments</h2>
      <p className="hint-text">Each student appears once, showing their current device status — use "History" to see every device they've had.</p>

      <div className="card filter-row">
        <input
          type="text"
          placeholder="Search by name or index number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="WITH_STUDENT">With Student</option>
          <option value="REPLACED">Replaced</option>
          <option value="RETURNED">Returned</option>
        </select>
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
          Filter
        </button>
        <button
          className="btn-secondary"
          onClick={() => apiDownload(`/assignments/export/xlsx?${buildParams().toString()}`, "assignments.xlsx")}
        >
          Export to Excel
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
                <th>Class</th>
                <th>Year Group</th>
                <th>Distributor</th>
                <th>IMEI</th>
                <th>Serial No.</th>
                <th>Embossment No.</th>
                <th>Date Assigned</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td>{a.student.indexNumber}</td>
                  <td>{a.student.fullName}</td>
                  <td>{a.student.className || "—"}</td>
                  <td>{a.student.admissionYear || "—"}</td>
                  <td>{a.distributor.name}</td>
                  <td>{a.imei}</td>
                  <td>{a.serialNumber}</td>
                  <td>{a.embossmentNumber || "—"}</td>
                  <td>{a.dateAssigned.slice(0, 10)}</td>
                  <td>
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="actions-cell">
                    {a.status === "WITH_STUDENT" && (
                      <>
                        <button className="btn-link" onClick={() => setReplacing(a)}>
                          Replace
                        </button>
                        <button className="btn-link" onClick={() => setReturning(a)}>
                          Mark Returned
                        </button>
                      </>
                    )}
                    <button className="btn-link" onClick={() => setHistoryFor(a)}>
                      History
                    </button>
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={11}>No assignments found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {replacing && (
        <ReplaceModal
          assignment={replacing}
          onClose={() => setReplacing(null)}
          onDone={() => {
            setReplacing(null);
            load();
          }}
        />
      )}

      {returning && (
        <ReturnModal
          assignment={returning}
          onClose={() => setReturning(null)}
          onDone={() => {
            setReturning(null);
            load();
          }}
        />
      )}

      {historyFor && <HistoryModal assignment={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

function ReplaceModal({ assignment, onClose, onDone }: { assignment: Assignment; onClose: () => void; onDone: () => void }) {
  const [imei, setImei] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [embossmentDeviceNumber, setEmbossmentDeviceNumber] = useState("");
  const [reason, setReason] = useState("FAULTY");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!imei.trim() || !serialNumber.trim()) {
      setError("Enter the new device's IMEI and Serial Number");
      return;
    }
    if (reason === "OTHER" && !note.trim()) {
      setError('Enter a short note explaining "Other"');
      return;
    }
    setSubmitting(true);
    try {
      await apiSend("POST", `/assignments/${assignment.id}/replace`, {
        imei: imei.trim(),
        serialNumber: serialNumber.trim(),
        embossmentDeviceNumber: embossmentDeviceNumber.trim() || undefined,
        reason,
        note: note.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record replacement");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal" onSubmit={submit}>
        <div className="modal-header">
          <h3>Replace Device — {assignment.student.fullName}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="hint-text">
          The old device ({assignment.serialNumber}) will be marked <strong>Replaced</strong> with today's date. Enter
          the replacement device below.
        </p>
        <div className="field">
          <label>Reason for Replacement</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="FAULTY">Faulty</option>
            <option value="MISSING">Missing</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div className="field">
          <label>
            Note{reason === "OTHER" ? " *" : " (optional)"}
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={reason === "OTHER" ? "Briefly explain why" : "Any extra detail"}
          />
        </div>
        <ScanInput label="New Device IMEI" value={imei} onChange={setImei} required />
        <ScanInput label="New Serial Number" value={serialNumber} onChange={setSerialNumber} required />
        <div className="field">
          <label>New Embossment Number</label>
          {embossmentYearSuffix(assignment.student.admissionYear) ? (
            <>
              <div className="input-prefix-group">
                <span className="input-prefix">JUASS/SM1/{embossmentYearSuffix(assignment.student.admissionYear)}/</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={embossmentDeviceNumber}
                  onChange={(e) => setEmbossmentDeviceNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="0001"
                />
              </div>
              {embossmentDeviceNumber.trim() && (
                <p className="hint-text">
                  Will be recorded as {previewEmbossmentNumber(assignment.student.admissionYear, embossmentDeviceNumber)}
                </p>
              )}
            </>
          ) : (
            <p className="hint-text">Set this student's Year Group before entering an embossment number.</p>
          )}
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Saving…" : "Confirm Replacement"}
        </button>
      </form>
    </div>
  );
}

function ReturnModal({ assignment, onClose, onDone }: { assignment: Assignment; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("COMPLETED");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (reason === "OTHER" && !note.trim()) {
      setError('Enter a short note explaining "Other"');
      return;
    }
    setSubmitting(true);
    try {
      await apiSend("POST", `/assignments/${assignment.id}/return`, { reason, note: note.trim() || undefined });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the return");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal" onSubmit={submit}>
        <div className="modal-header">
          <h3>Mark Returned — {assignment.student.fullName}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="hint-text">
          The device ({assignment.serialNumber}) will be marked <strong>Returned</strong> with today's date.
        </p>
        <div className="field">
          <label>Reason for Return</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="COMPLETED">Completed</option>
            <option value="WITHDRAWN">Withdrawn</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div className="field">
          <label>
            Note{reason === "OTHER" ? " *" : " (optional)"}
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={reason === "OTHER" ? "Briefly explain why" : "Any extra detail"}
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Saving…" : "Confirm Return"}
        </button>
      </form>
    </div>
  );
}

function HistoryModal({ assignment, onClose }: { assignment: Assignment; onClose: () => void }) {
  const [history, setHistory] = useState<HistoryAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet(`/assignments/history/${assignment.student.id}`)
      .then((r) => setHistory(r.assignments))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load history"));
  }, [assignment.student.id]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h3>Device History — {assignment.student.fullName}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        {!history && !error && <p>Loading…</p>}
        {history && history.length === 0 && <p className="hint-text">No devices on record for this student.</p>}
        {history && history.length > 0 && (
          <div className="report-list">
            {history.map((h, i) => (
              <div key={h.id} className="card">
                <div className="form-header">
                  <strong>
                    Device {i + 1}: {h.serialNumber} (IMEI {h.imei})
                  </strong>
                  <StatusBadge status={h.status} />
                </div>
                <p className="hint-text">
                  Assigned {h.dateAssigned.slice(0, 10)} by {h.distributor.name}
                  {h.embossmentNumber ? ` · Embossment ${h.embossmentNumber}` : ""}
                </p>
                {h.status === "REPLACED" && (
                  <p className="warn-text">
                    Replaced {h.replacementDate?.slice(0, 10)} — reason:{" "}
                    {REPLACEMENT_REASON_LABELS[h.replacementReason || ""] || "Not recorded"}
                    {h.replacementNote ? `: "${h.replacementNote}"` : ""}
                  </p>
                )}
                {h.status === "RETURNED" && (
                  <p className="success-text">
                    Returned {h.returnedDate?.slice(0, 10)} — reason: {RETURN_REASON_LABELS[h.returnReason || ""] || "Not recorded"}
                    {h.returnNote ? `: "${h.returnNote}"` : ""}
                  </p>
                )}
                {h.issueReports.length > 0 && (
                  <>
                    <p className="hint-text">Issue reports on this device:</p>
                    <ul className="student-list">
                      {h.issueReports.map((r) => (
                        <li key={r.id}>
                          <strong>{r.type === "FAULTY" ? "Faulty" : "Missing"}</strong> ({r.status.toLowerCase()}) —{" "}
                          {r.description} — reported by {r.reportedBy.name} on {r.createdAt.slice(0, 10)}
                          {r.reviewedBy ? `, reviewed by ${r.reviewedBy.name}` : ""}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
