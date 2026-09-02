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
  sheet?: string;
}

interface SheetSelectionResult {
  needsSheetSelection: true;
  sheets: string[];
}

export default function ImportStudents() {
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const [sheetOptions, setSheetOptions] = useState<string[] | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");

  useEffect(() => {
    apiGet("/students/fields").then(setFields).catch(() => setFields([]));
  }, []);

  function applyParsed(data: ParsedResult) {
    setParsed(data);
    setSheetOptions(null);
    // Best-effort auto-match by similar header/field names.
    const auto: Record<string, string> = {};
    for (const f of fields) {
      const match = data.headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, "") === f.key.toLowerCase());
      if (match) auto[f.key] = match;
    }
    setMapping(auto);
  }

  async function parseFile(sheet?: string) {
    if (!file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (sheet) formData.append("sheet", sheet);
      const data: ParsedResult | SheetSelectionResult = await apiUpload("POST", "/students/import/parse", formData);
      if ("needsSheetSelection" in data) {
        setSheetOptions(data.sheets);
        setSelectedSheet(data.sheets[0] || "");
        setParsed(null);
      } else {
        applyParsed(data);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not read this file");
    } finally {
      setBusy(false);
    }
  }

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();
    setSheetOptions(null);
    await parseFile();
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

      {sheetOptions && (
        <div className="card">
          <h3>Choose a Sheet</h3>
          <p className="hint-text">This file has {sheetOptions.length} sheets — which one has the student data?</p>
          <div className="field">
            <label>Sheet</label>
            <select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)}>
              {sheetOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={() => parseFile(selectedSheet)} disabled={busy}>
            {busy ? "Reading…" : "Use This Sheet"}
          </button>
        </div>
      )}

      {parsed && (
        <div className="card">
          <h3>
            Match Columns ({parsed.rowCount} rows found{parsed.sheet ? ` on sheet "${parsed.sheet}"` : ""})
          </h3>
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
