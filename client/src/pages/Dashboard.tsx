import { Fragment, useEffect, useState } from "react";
import { apiGet, ApiError } from "../api";

interface Summary {
  totalTablets: number;
  totalStudents: number;
  assigned: number;
  replaced: number;
  returned: number;
  notReceived: number;
  faulty: number;
  missing: number;
  pendingIssues: number;
}

interface ClassBreakdown {
  className: string;
  assignedCount: number;
  notReceivedCount: number;
  assignedStudents: { indexNumber: string; fullName: string }[];
  notReceivedStudents: { indexNumber: string; fullName: string }[];
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byClass, setByClass] = useState<ClassBreakdown[]>([]);
  const [expanded, setExpanded] = useState<Record<string, "assigned" | "notReceived" | null>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiGet("/dashboard/summary"), apiGet("/dashboard/by-class")])
      .then(([s, c]) => {
        setSummary(s);
        setByClass(c);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load dashboard"));
  }, []);

  if (error) return <p className="error-text">{error}</p>;
  if (!summary) return <p>Loading…</p>;

  return (
    <div className="page">
      <h2>Dashboard</h2>

      <div className="stat-grid">
        <Stat label="Total Tablets" value={summary.totalTablets} />
        <Stat label="Total Students" value={summary.totalStudents} />
        <Stat label="Assigned" value={summary.assigned} tone="active" />
        <Stat label="Not Yet Received" value={summary.notReceived} tone="warn" />
        <Stat label="Replaced" value={summary.replaced} />
        <Stat label="Returned" value={summary.returned} />
        <Stat label="Faulty (approved)" value={summary.faulty} tone="warn" />
        <Stat label="Missing (approved)" value={summary.missing} tone="warn" />
        <Stat label="Pending Approvals" value={summary.pendingIssues} tone="warn" />
      </div>

      <h3>By Class</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Class</th>
              <th>Assigned</th>
              <th>Not Received</th>
            </tr>
          </thead>
          <tbody>
            {byClass.map((c) => (
              <Fragment key={c.className}>
                <tr>
                  <td>{c.className}</td>
                  <td>
                    <button
                      className="btn-link"
                      onClick={() =>
                        setExpanded((e) => ({ ...e, [c.className]: e[c.className] === "assigned" ? null : "assigned" }))
                      }
                    >
                      {c.assignedCount}
                    </button>
                  </td>
                  <td>
                    <button
                      className="btn-link"
                      onClick={() =>
                        setExpanded((e) => ({
                          ...e,
                          [c.className]: e[c.className] === "notReceived" ? null : "notReceived",
                        }))
                      }
                    >
                      {c.notReceivedCount}
                    </button>
                  </td>
                </tr>
                {expanded[c.className] && (
                  <tr>
                    <td colSpan={3}>
                      <ul className="student-list">
                        {(expanded[c.className] === "assigned" ? c.assignedStudents : c.notReceivedStudents).map((s) => (
                          <li key={s.indexNumber}>
                            {s.fullName} ({s.indexNumber})
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "active" | "warn" }) {
  return (
    <div className={`stat-card ${tone ? `stat-${tone}` : ""}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
