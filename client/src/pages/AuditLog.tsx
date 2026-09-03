import { useEffect, useState } from "react";
import { apiGet, ApiError } from "../api";

interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  actions: string[];
}

const PAGE_SIZE = 50;

export default function AuditLog() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (action) params.set("action", action);
      if (targetType) params.set("targetType", targetType);
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to).toISOString());
      const res: AuditResponse = await apiGet(`/audit-log?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the audit log");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function applyFilters() {
    setPage(1);
    load();
  }

  function clearFilters() {
    setAction("");
    setTargetType("");
    setFrom("");
    setTo("");
    setPage(1);
    setTimeout(load, 0);
  }

  const targetTypes = ["Student", "CustomField", "User"];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="page">
      <h2>Audit Log</h2>
      <p className="hint-text">
        A record of who changed what, and when. Every entry captures the actor's name and role at the time of the
        action, so it stays readable even if that account is later deactivated or deleted.
      </p>

      <div className="card">
        <h3>Filters</h3>
        <div className="filter-row">
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {(data?.actions || []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
            <option value="">All target types</option>
            {targetTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div className="field">
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="filter-row filter-row-spaced">
          <button type="button" className="btn-primary" onClick={applyFilters} disabled={loading}>
            {loading ? "Loading…" : "Apply filters"}
          </button>
          <button type="button" className="btn-link" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {data && (
        <div className="card">
          <p className="hint-text">
            {data.total} entr{data.total === 1 ? "y" : "ies"} · page {data.page} of {totalPages}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td>
                      {entry.actorName}
                      <br />
                      <span className="hint-text">{entry.actorRole.replace("_", " ")}</span>
                    </td>
                    <td>{entry.action}</td>
                    <td>
                      {entry.targetLabel || "—"}
                      {entry.targetType && <br />}
                      {entry.targetType && <span className="hint-text">{entry.targetType}</span>}
                    </td>
                    <td>
                      {entry.details ? (
                        <code>{JSON.stringify(entry.details)}</code>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {data.entries.length === 0 && (
                  <tr>
                    <td colSpan={5}>No audit log entries match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="filter-row filter-row-spaced">
            <button
              type="button"
              className="btn-secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
