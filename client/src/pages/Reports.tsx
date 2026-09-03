import { useEffect, useState } from "react";
import { apiDownload, apiGet, ApiError } from "../api";

interface ReportTypeDef {
  key: string;
  label: string;
}

interface FieldDef {
  key: string;
  label: string;
}

interface TypesResponse {
  types: ReportTypeDef[];
  fields: FieldDef[];
  defaultFields: Record<string, string[]>;
  defaultTitles: Record<string, string>;
}

interface DataResponse {
  title: string;
  generatedAt: string;
  fields: string[];
  columnLabels: Record<string, string>;
  rowCount: number;
  rows: Record<string, string>[];
}

export default function Reports() {
  const [meta, setMeta] = useState<TypesResponse | null>(null);
  const [type, setType] = useState("all_students");
  const [title, setTitle] = useState("");
  const [className, setClassName] = useState("");
  const [year, setYear] = useState("");
  const [q, setQ] = useState("");
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({});
  const [data, setData] = useState<DataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/reports/types").then((m: TypesResponse) => {
      setMeta(m);
      setSelectedFields(m.defaultFields[type] || []);
      setTitle(m.defaultTitles[type] || "");
    });
    apiGet("/students/classes").then(setClassOptions).catch(() => null);
    apiGet("/students/years").then(setYearOptions).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeType(nextType: string) {
    setType(nextType);
    setData(null);
    setColumnLabels({});
    if (meta) {
      setSelectedFields(meta.defaultFields[nextType] || []);
      setTitle(meta.defaultTitles[nextType] || "");
    }
  }

  function buildParams(fields: string[]) {
    const params = new URLSearchParams();
    params.set("type", type);
    if (title.trim()) params.set("title", title.trim());
    if (className) params.set("className", className);
    if (year) params.set("year", year);
    if (q) params.set("q", q);
    if (fields.length > 0) params.set("fields", fields.join(","));
    const overrides: Record<string, string> = {};
    for (const f of fields) {
      const custom = columnLabels[f]?.trim();
      const catalogLabel = meta?.fields.find((mf) => mf.key === f)?.label;
      if (custom && custom !== catalogLabel) overrides[f] = custom;
    }
    if (Object.keys(overrides).length > 0) params.set("labels", JSON.stringify(overrides));
    return params;
  }

  function toggleField(key: string) {
    setSelectedFields((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  }

  async function loadPreview() {
    if (selectedFields.length === 0) {
      setError("Select at least one column to view or export");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res: DataResponse = await apiGet(`/reports/data?${buildParams(selectedFields).toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this report");
    } finally {
      setLoading(false);
    }
  }

  async function exportReport() {
    if (selectedFields.length === 0) {
      setError("Select at least one column to view or export");
      return;
    }
    setError(null);
    setExporting(true);
    try {
      await apiDownload(`/reports/export.xlsx?${buildParams(selectedFields).toString()}`, `juass-report-${type}.xlsx`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (!meta) return <div className="page">Loading…</div>;
  const labelByKey = new Map(meta.fields.map((f) => [f.key, f.label]));

  return (
    <div className="page">
      <h2>Reports</h2>
      <p className="hint-text">
        Choose a report, filter it, then pick exactly the columns you need — no report has to include every field.
      </p>

      <div className="card">
        <h3>1. Report</h3>
        <div className="filter-row">
          {meta.types.map((t) => (
            <button
              key={t.key}
              type="button"
              className={type === t.key ? "btn-primary" : "btn-secondary"}
              onClick={() => changeType(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>2. Report Title</h3>
        <p className="hint-text">
          Shown on row 1 of the export. A title is assigned automatically for this report — type over it for a
          custom title.
        </p>
        <div className="filter-row">
          <div className="field grow">
            <input type="text" placeholder="Report title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn-link"
            onClick={() => setTitle(meta.defaultTitles[type] || "")}
          >
            Reset to default title
          </button>
        </div>
      </div>

      <div className="card">
        <h3>3. Filters (optional)</h3>
        <div className="filter-row">
          <input
            type="text"
            placeholder="Search by name or index number"
            value={q}
            onChange={(e) => setQ(e.target.value)}
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
        </div>
      </div>

      <div className="card">
        <h3>4. Columns</h3>
        <div className="filter-row filter-row-spaced">
          <button type="button" className="btn-link" onClick={() => setSelectedFields(meta.fields.map((f) => f.key))}>
            Select all
          </button>
          <button type="button" className="btn-link" onClick={() => setSelectedFields([])}>
            Select none
          </button>
          <button
            type="button"
            className="btn-link"
            onClick={() => setSelectedFields(meta.defaultFields[type] || [])}
          >
            Reset to default for this report
          </button>
        </div>
        <div className="checkbox-grid">
          {meta.fields.map((f) => (
            <label key={f.key} className="checkbox-item">
              <input type="checkbox" checked={selectedFields.includes(f.key)} onChange={() => toggleField(f.key)} />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      {selectedFields.length > 0 && (
        <div className="card">
          <h3>5. Column Headers (optional)</h3>
          <div className="filter-row filter-row-spaced">
            <p className="hint-text">Rename any column's exported/displayed header — leave as-is to use its default name.</p>
            <button type="button" className="btn-link" onClick={() => setColumnLabels({})}>
              Reset all headers
            </button>
          </div>
          <div className="grid-2">
            {meta.fields
              .filter((f) => selectedFields.includes(f.key))
              .map((f) => (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  <input
                    type="text"
                    value={columnLabels[f.key] ?? f.label}
                    onChange={(e) => setColumnLabels((m) => ({ ...m, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
          </div>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="filter-row filter-row-spaced">
        <button className="btn-secondary" onClick={loadPreview} disabled={loading}>
          {loading ? "Loading…" : "View Report"}
        </button>
        <button className="btn-primary" onClick={exportReport} disabled={exporting}>
          {exporting ? "Exporting…" : "Export to Excel"}
        </button>
      </div>

      {data && (
        <div className="card">
          <h3>{data.title}</h3>
          <p className="hint-text">
            Generated on {data.generatedAt} · {data.rowCount} rows
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {data.fields.map((f) => (
                    <th key={f}>{data.columnLabels[f] || labelByKey.get(f) || f}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.slice(0, 200).map((row, i) => (
                  <tr key={i}>
                    {data.fields.map((f) => (
                      <td key={f}>{row[f] || "—"}</td>
                    ))}
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={data.fields.length}>No records match this report and filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {data.rows.length > 200 && (
            <p className="hint-text">
              Showing the first 200 of {data.rowCount} rows on screen — export to Excel to get all of them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
