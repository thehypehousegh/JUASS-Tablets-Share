import { useEffect, useState } from "react";
import { apiGet, apiSend, apiUpload, ApiError } from "../api";

interface FieldDef {
  key: string;
  label: string;
  required: boolean;
}

interface ParsedResult {
  headers: string[];
  rowCount: number;
  rows: Record<string, unknown>[];
}

export default function ImportStudents() {
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  useEffect(() => {
    apiGet("/students/fields").then(setFields).catch(() => setFields([]));
  }, []);

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data: ParsedResult = await apiUpload("POST", "/students/import/parse", formData);
      setParsed(data);
      // Best-effort auto-match by similar header/field names.
      const auto: Record<string, string> = {};
      for (const f of fields) {
        const match = data.headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, "") === f.key.toLowerCase());
        if (match) auto[f.key] = match;
      }
      setMapping(auto);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not read this file");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!parsed) return;
    setError(null);
    setBusy(true);
    try {
      const res = await apiSend("POST", "/students/import/commit", { mapping, rows: parsed.rows });
      setResult(res);
      setParsed(null);
      setFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h2>Import Student Admission Data</h2>
      <p className="hint-text">Upload the admission-data spreadsheet (.xlsx or .csv), then match its columns to the fields below.</p>

      <form className="card" onSubmit={handleParse}>
        <div className="field">
          <label>Admission Data File</label>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Reading…" : "Read File"}
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}

      {parsed && (
        <div className="card">
          <h3>Match Columns ({parsed.rowCount} rows found)</h3>
          <div className="grid-2">
            {fields.map((f) => (
              <div className="field" key={f.key}>
                <label>
                  {f.label}
                  {f.required ? " *" : ""}
                </label>
                <select
                  value={mapping[f.key] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                >
                  <option value="">Not in file / skip</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="hint-text">
            Any column not matched above will still be saved and shown on the student's record so no admission data is
            lost.
          </p>
          <button className="btn-primary" onClick={handleCommit} disabled={busy || !mapping.indexNumber}>
            {busy ? "Importing…" : "Import Students"}
          </button>
        </div>
      )}

      {result && (
        <div className="card success-text">
          <p>
            Imported: {result.created} new, {result.updated} updated.
          </p>
          {result.errors.length > 0 && (
            <ul>
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
