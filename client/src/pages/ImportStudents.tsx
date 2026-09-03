import { useEffect, useState } from "react";
import { apiGet, apiSend, apiUpload, ApiError } from "../api";

interface FieldDef {
  key: string;
  label: string;
  required: boolean;
}

interface CustomFieldDef {
  id: string;
  key: string;
  label: string;
}

interface ParsedResult {
  headers: string[];
  rowCount: number;
  rows: Record<string, unknown>[];
  sheet?: string;
  headerRow?: number;
  dataStartRow?: number;
}

interface SheetSelectionResult {
  needsSheetSelection: true;
  sheets: string[];
}

interface HeaderSelectionResult {
  needsHeaderSelection: true;
  sheet?: string;
  rowCount: number;
  preview: string[][];
}

type ParseResponse = ParsedResult | SheetSelectionResult | HeaderSelectionResult;

// Sentinel select value meaning "use one fixed value for every row in this
// import" rather than reading a column from the file.
const CONSTANT_MODE = "__constant__";

export default function ImportStudents() {
  const [builtinFields, setBuiltinFields] = useState<FieldDef[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [addingField, setAddingField] = useState(false);
  const [addFieldError, setAddFieldError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  // For each target field key: "" (skip), a file header, or CONSTANT_MODE.
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [constants, setConstants] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  const [sheetOptions, setSheetOptions] = useState<string[] | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");

  const [headerPreview, setHeaderPreview] = useState<HeaderSelectionResult | null>(null);
  const [headerRow, setHeaderRow] = useState(1);
  const [dataStartRow, setDataStartRow] = useState(2);
  const [noHeaderRow, setNoHeaderRow] = useState(false);

  // Column names as detected (real header text, or "Column N" placeholders
  // when the file has no header row) — editable before matching.
  const [columnNames, setColumnNames] = useState<string[]>([]);
  const [namingConfirmed, setNamingConfirmed] = useState(false);

  const allFields: FieldDef[] = [...builtinFields, ...customFields.map((f) => ({ key: f.key, label: f.label, required: false }))];

  function loadCustomFields() {
    apiGet("/custom-fields")
      .then((rows: CustomFieldDef[]) => setCustomFields(rows))
      .catch(() => setCustomFields([]));
  }

  useEffect(() => {
    apiGet("/students/fields").then(setBuiltinFields).catch(() => setBuiltinFields([]));
    loadCustomFields();
  }, []);

  async function addCustomField() {
    if (!newFieldLabel.trim()) return;
    setAddingField(true);
    setAddFieldError(null);
    try {
      const field: CustomFieldDef = await apiSend("POST", "/custom-fields", { label: newFieldLabel.trim() });
      setCustomFields((f) => (f.some((existing) => existing.key === field.key) ? f : [...f, field]));
      setNewFieldLabel("");
    } catch (err) {
      setAddFieldError(err instanceof ApiError ? err.message : "Could not add this field");
    } finally {
      setAddingField(false);
    }
  }

  function autoMatch(headers: string[]) {
    // Best-effort auto-match by similar header/field names.
    const auto: Record<string, string> = {};
    for (const f of allFields) {
      const match = headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, "") === f.key.toLowerCase());
      if (match) auto[f.key] = match;
    }
    return auto;
  }

  function applyParsed(data: ParsedResult) {
    setParsed(data);
    setColumnNames(data.headers.slice());
    setNamingConfirmed(false);
    setSheetOptions(null);
    setHeaderPreview(null);
    setSelection({});
    setConstants({});
  }

  function confirmColumnNames() {
    if (!parsed) return;
    // Trim, default back to the detected name if left blank, and dedupe so
    // two columns never end up sharing the same key.
    const seen = new Map<string, number>();
    const finalHeaders = columnNames.map((name, i) => {
      const base = name.trim() || parsed.headers[i];
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      return count > 1 ? `${base} (${count})` : base;
    });
    const remappedRows = parsed.rows.map((row) => {
      const newRow: Record<string, unknown> = {};
      parsed.headers.forEach((oldHeader, i) => {
        newRow[finalHeaders[i]] = row[oldHeader];
      });
      return newRow;
    });
    setParsed({ ...parsed, headers: finalHeaders, rows: remappedRows });
    setSelection(autoMatch(finalHeaders));
    setConstants({});
    setNamingConfirmed(true);
  }

  async function parseFile(opts: { sheet?: string; headerRow?: number; dataStartRow?: number; noHeaderRow?: boolean } = {}) {
    if (!file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (opts.sheet) formData.append("sheet", opts.sheet);
      if (opts.noHeaderRow) {
        formData.append("noHeaderRow", "true");
      } else if (opts.headerRow) {
        formData.append("headerRow", String(opts.headerRow));
      }
      if (opts.dataStartRow) formData.append("dataStartRow", String(opts.dataStartRow));
      const data: ParseResponse = await apiUpload("POST", "/students/import/parse", formData);
      if ("needsSheetSelection" in data) {
        setSheetOptions(data.sheets);
        setSelectedSheet(data.sheets[0] || "");
        setHeaderPreview(null);
        setParsed(null);
      } else if ("needsHeaderSelection" in data) {
        setHeaderPreview(data);
        setHeaderRow(1);
        setDataStartRow(2);
        setNoHeaderRow(false);
        setSheetOptions(null);
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
    setHeaderPreview(null);
    await parseFile();
  }

  async function handleCommit() {
    if (!parsed) return;
    setError(null);
    setBusy(true);
    try {
      const mapping: Record<string, string> = {};
      const finalConstants: Record<string, string> = {};
      for (const f of allFields) {
        const sel = selection[f.key];
        if (!sel) continue;
        if (sel === CONSTANT_MODE) {
          const value = constants[f.key]?.trim();
          if (value) finalConstants[f.key] = value;
        } else {
          mapping[f.key] = sel;
        }
      }
      const res = await apiSend("POST", "/students/import/commit", { mapping, constants: finalConstants, rows: parsed.rows });
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
          <button className="btn-primary" onClick={() => parseFile({ sheet: selectedSheet })} disabled={busy}>
            {busy ? "Reading…" : "Use This Sheet"}
          </button>
        </div>
      )}

      {headerPreview && (
        <div className="card">
          <h3>Which row has the column headings?</h3>
          <p className="hint-text">
            Not every file has its headings on row 1 — some have a title or note above the real table, and some raw
            exports have no column headings at all. Look at the rows below and tell us which row has the column
            names (or that there isn't one), and which row the actual student data starts on.
          </p>
          <label className="checkbox-item">
            <input
              type="checkbox"
              checked={noHeaderRow}
              onChange={(e) => {
                setNoHeaderRow(e.target.checked);
                if (e.target.checked) setDataStartRow(1);
              }}
            />
            This file has no column headings — every row is data
          </label>
          <div className="grid-2">
            {!noHeaderRow && (
              <div className="field">
                <label>Heading row</label>
                <input
                  type="number"
                  min={1}
                  max={headerPreview.rowCount}
                  value={headerRow}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 1;
                    setHeaderRow(v);
                    setDataStartRow(v + 1);
                  }}
                />
              </div>
            )}
            <div className="field">
              <label>Data starts at row</label>
              <input
                type="number"
                min={1}
                max={headerPreview.rowCount}
                value={dataStartRow}
                onChange={(e) => setDataStartRow(Number(e.target.value) || 1)}
              />
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <tbody>
                {headerPreview.preview.map((row, i) => {
                  const rowNum = i + 1;
                  const isHeader = !noHeaderRow && rowNum === headerRow;
                  const isDataStart = rowNum === dataStartRow;
                  return (
                    <tr
                      key={rowNum}
                      className={isHeader ? "badge-active" : isDataStart ? "badge-warn" : undefined}
                    >
                      <td>
                        <strong>{rowNum}</strong>
                        {isHeader && " (heading)"}
                        {isDataStart && " (data starts)"}
                      </td>
                      {row.map((cell, ci) => (
                        <td key={ci}>{cell || "—"}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            className="btn-primary"
            onClick={() => parseFile({ sheet: selectedSheet, headerRow, dataStartRow, noHeaderRow })}
            disabled={busy}
          >
            {busy ? "Reading…" : "Use These Rows"}
          </button>
        </div>
      )}

      {parsed && !namingConfirmed && (
        <div className="card">
          <h3>Name Your Columns</h3>
          <p className="hint-text">
            {parsed.headerRow
              ? "These are the column names found in the file — rename any of them if you'd like something clearer, or leave them as-is."
              : "This file has no column headings, so generic names were assigned below — give each column a real name (or leave the generic one) before matching."}
          </p>
          <div className="grid-2">
            {columnNames.map((name, i) => (
              <div className="field" key={i}>
                <label>Column {i + 1}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) =>
                    setColumnNames((names) => names.map((n, ni) => (ni === i ? e.target.value : n)))
                  }
                />
              </div>
            ))}
          </div>
          <div className="filter-row filter-row-spaced">
            <button type="button" className="btn-link" onClick={() => setColumnNames(parsed.headers.slice())}>
              Reset to detected names
            </button>
          </div>
          <button className="btn-primary" onClick={confirmColumnNames}>
            Continue to Column Matching
          </button>
        </div>
      )}

      {parsed && namingConfirmed && (
        <div className="card">
          <h3>
            Match Columns ({parsed.rowCount} rows found{parsed.sheet ? ` on sheet "${parsed.sheet}"` : ""}
            {parsed.headerRow ? `, heading row ${parsed.headerRow}` : ""})
          </h3>
          <p className="hint-text">
            For each field: pick the matching column from the file, type one fixed value to apply to every row (e.g. a
            Year Group that's the same for the whole batch), or leave it as "Not in file / skip". Fields left unset stay
            empty until a distributor or admin fills them in later, per student.
          </p>

          <div className="grid-2">
            {allFields.map((f) => {
              const sel = selection[f.key] || "";
              return (
                <div className="field" key={f.key}>
                  <label>
                    {f.label}
                    {f.required ? " *" : ""}
                  </label>
                  <select
                    value={sel}
                    onChange={(e) => setSelection((m) => ({ ...m, [f.key]: e.target.value }))}
                  >
                    <option value="">Not in file / skip</option>
                    {f.key !== "indexNumber" && <option value={CONSTANT_MODE}>Same value for every row…</option>}
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  {sel === CONSTANT_MODE && (
                    <input
                      type="text"
                      placeholder={`Value to use for every row, e.g. 2026`}
                      value={constants[f.key] || ""}
                      onChange={(e) => setConstants((c) => ({ ...c, [f.key]: e.target.value }))}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="import-row">
            <div className="field grow">
              <label>Need a field that isn't listed above?</label>
              <input
                type="text"
                placeholder="e.g. Scholarship Type"
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
              />
            </div>
            <button type="button" className="btn-secondary" onClick={addCustomField} disabled={addingField || !newFieldLabel.trim()}>
              {addingField ? "Adding…" : "Add Field"}
            </button>
          </div>
          {addFieldError && <p className="error-text">{addFieldError}</p>}

          <p className="hint-text">
            Any file column not matched to a field above will still be saved and shown on the student's record under
            its column name (as set on the previous step), so no admission data is lost.
          </p>
          <button className="btn-primary" onClick={handleCommit} disabled={busy || !selection.indexNumber}>
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
