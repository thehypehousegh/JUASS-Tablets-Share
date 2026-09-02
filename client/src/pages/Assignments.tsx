import { useEffect, useState } from "react";
import { apiDownload, apiGet, apiSend, ApiError } from "../api";
import StatusBadge from "../components/StatusBadge";
import ScanInput from "../components/ScanInput";

interface Assignment {
  id: string;
  imei: string;
  serialNumber: string;
  embossmentNumber: string | null;
  dateAssigned: string;
  replacementDate: string | null;
  returnedDate: string | null;
  status: "WITH_STUDENT" | "REPLACED" | "RETURNED";
  student: { indexNumber: string; fullName: string; className: string | null; admissionYear: string | null };
  distributor: { name: string };
}

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

  async function markReturned(a: Assignment) {
    if (!confirm(`Mark ${a.student.fullName}'s device as returned?`)) return;
    try {
      await apiSend("POST", `/assignments/${a.id}/return`, {});
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not update assignment");
    }
  }

  return (
    <div className="page">
      <h2>Device Assignments</h2>

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
                        <button className="btn-link" onClick={() => markReturned(a)}>
                          Mark Returned
                        </button>
                      </>
                    )}
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
    </div>
  );
}

function ReplaceModal({ assignment, onClose, onDone }: { assignment: Assignment; onClose: () => void; onDone: () => void }) {
  const [imei, setImei] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [embossmentNumber, setEmbossmentNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!imei.trim() || !serialNumber.trim()) {
      setError("Enter the new device's IMEI and Serial Number");
      return;
    }
    setSubmitting(true);
    try {
      await apiSend("POST", `/assignments/${assignment.id}/replace`, {
        imei: imei.trim(),
        serialNumber: serialNumber.trim(),
        embossmentNumber: embossmentNumber.trim() || undefined,
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
        <ScanInput label="New Device IMEI" value={imei} onChange={setImei} required />
        <ScanInput label="New Serial Number" value={serialNumber} onChange={setSerialNumber} required />
        <div className="field">
          <label>New Embossment Number</label>
          <input type="text" value={embossmentNumber} onChange={(e) => setEmbossmentNumber(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Saving…" : "Confirm Replacement"}
        </button>
      </form>
    </div>
  );
}
