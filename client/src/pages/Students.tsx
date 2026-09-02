import { useEffect, useState } from "react";
import { apiGet, ApiError } from "../api";

interface StudentRow {
  indexNumber: string;
  fullName: string;
  gender: string | null;
  className: string | null;
  admissionYear: string | null;
  assignments: { status: string }[];
}

export default function Students() {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [q, setQ] = useState("");
  const [className, setClassName] = useState("");
  const [year, setYear] = useState("");
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    load();
    apiGet("/students/classes").then(setClassOptions).catch(() => null);
    apiGet("/students/years").then(setYearOptions).catch(() => null);
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
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>No students found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {rows.length >= 200 && (
        <p className="hint-text">Showing the first 200 matches — narrow your search to see more specific results.</p>
      )}
    </div>
  );
}
