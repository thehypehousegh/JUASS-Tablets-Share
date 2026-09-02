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

interface StudentRef {
  indexNumber: string;
  fullName: string;
}

interface ClassBreakdown {
  className: string;
  assignedCount: number;
  notReceivedCount: number;
  assignedStudents: StudentRef[];
  notReceivedStudents: StudentRef[];
}

interface YearBreakdown {
  yearGroup: string;
  assignedCount: number;
  notReceivedCount: number;
  assignedStudents: StudentRef[];
  notReceivedStudents: StudentRef[];
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byYear, setByYear] = useState<YearBreakdown[]>([]);
  const [byClass, setByClass] = useState<ClassBreakdown[]>([]);
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [classYearFilter, setClassYearFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiGet("/dashboard/summary"), apiGet("/dashboard/by-year"), apiGet("/students/years")])
      .then(([s, y, years]) => {
        setSummary(s);
        setByYear(y);
        setYearOptions(years);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load dashboard"));
  }, []);

  useEffect(() => {
    const params = classYearFilter ? `?year=${encodeURIComponent(classYearFilter)}` : "";
    apiGet(`/dashboard/by-class${params}`)
      .then(setByClass)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load class breakdown"));
  }, [classYearFilter]);

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

      <h3>By Year Group</h3>
      <p className="hint-text">
        As more year groups get their tablets over time, this keeps each batch's numbers separate.
      </p>
      <BreakdownTable
        rows={byYear.map((y) => ({ key: y.yearGroup, label: y.yearGroup, ...y }))}
      />

      <h3 className="section-heading">By Class</h3>
      <div className="filter-row filter-row-spaced">
        <select value={classYearFilter} onChange={(e) => setClassYearFilter(e.target.value)}>
          <option value="">All year groups</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <BreakdownTable
        rows={byClass.map((c) => ({ key: c.className, label: c.className, ...c }))}
      />
    </div>
  );
}

function BreakdownTable({
  rows,
}: {
  rows: { key: string; label: string; assignedCount: number; notReceivedCount: number; assignedStudents: StudentRef[]; notReceivedStudents: StudentRef[] }[];
}) {
  const [expanded, setExpanded] = useState<Record<string, "assigned" | "notReceived" | null>>({});

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Group</th>
            <th>Assigned</th>
            <th>Not Received</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.key}>
              <tr>
                <td>{r.label}</td>
                <td>
                  <button
                    className="btn-link"
                    onClick={() => setExpanded((e) => ({ ...e, [r.key]: e[r.key] === "assigned" ? null : "assigned" }))}
                  >
                    {r.assignedCount}
                  </button>
                </td>
                <td>
                  <button
                    className="btn-link"
                    onClick={() =>
                      setExpanded((e) => ({ ...e, [r.key]: e[r.key] === "notReceived" ? null : "notReceived" }))
                    }
                  >
                    {r.notReceivedCount}
                  </button>
                </td>
              </tr>
              {expanded[r.key] && (
                <tr>
                  <td colSpan={3}>
                    <ul className="student-list">
                      {(expanded[r.key] === "assigned" ? r.assignedStudents : r.notReceivedStudents).map((s) => (
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
          {rows.length === 0 && (
            <tr>
              <td colSpan={3}>No data yet.</td>
            </tr>
          )}
        </tbody>
      </table>
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
