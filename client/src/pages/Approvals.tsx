import { useEffect, useState } from "react";
import { apiGet, apiSend, ApiError } from "../api";

interface IssueReport {
  id: string;
  type: "FAULTY" | "MISSING";
  description: string;
  photoUrl: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reportedBy: { name: string };
  assignment: { student: { fullName: string; indexNumber: string }; serialNumber: string; imei: string } | null;
}

export default function Approvals() {
  const [reports, setReports] = useState<IssueReport[]>([]);
  const [filter, setFilter] = useState("PENDING");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await apiGet(`/issues?status=${filter}`);
      setReports(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load reports");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function review(id: string, approve: boolean) {
    const note = approve ? undefined : prompt("Reason for rejecting (optional)") || undefined;
    try {
      await apiSend("POST", `/issues/${id}/review`, { approve, note });
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not update report");
    }
  }

  return (
    <div className="page">
      <h2>Faulty / Missing Reports — Admin Review</h2>

      <div className="card filter-row">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>
      {error && <p className="error-text">{error}</p>}

      <div className="report-list">
        {reports.map((r) => (
          <div className="card" key={r.id}>
            <div className="form-header">
              <h3>
                {r.type === "FAULTY" ? "Faulty" : "Missing"} — {r.assignment?.student.fullName || "Unknown student"}
              </h3>
              <span className={`badge ${r.status === "PENDING" ? "badge-warn" : r.status === "APPROVED" ? "badge-active" : "badge-neutral"}`}>
                {r.status}
              </span>
            </div>
            <p>
              Index: {r.assignment?.student.indexNumber} · Serial: {r.assignment?.serialNumber} · IMEI: {r.assignment?.imei}
            </p>
            <p>Reported by {r.reportedBy.name} on {new Date(r.createdAt).toLocaleString()}</p>
            <p>{r.description}</p>
            {r.photoUrl && <img src={r.photoUrl} alt="Device condition" className="issue-photo" />}
            {r.status === "PENDING" && (
              <div className="actions-cell">
                <button className="btn-primary" onClick={() => review(r.id, true)}>
                  Approve
                </button>
                <button className="btn-secondary" onClick={() => review(r.id, false)}>
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
        {reports.length === 0 && <p>No {filter.toLowerCase()} reports.</p>}
      </div>
    </div>
  );
}
