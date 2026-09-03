import { useEffect, useState } from "react";
import { apiGet, apiSend, ApiError } from "../api";
import { useAuth } from "../auth/AuthContext";
import ScanInput from "../components/ScanInput";
import StatusBadge from "../components/StatusBadge";
import { isOnline, queueAssignment } from "../lib/offlineQueue";

interface StudentRecord {
  id: string;
  indexNumber: string;
  fullName: string;
  gender: string | null;
  dateOfBirth: string | null;
  className: string | null;
  programme: string | null;
  house: string | null;
  guardianName: string | null;
  guardianContact: string | null;
  admissionYear: string | null;
  extraFields: Record<string, unknown> | null;
  assignments: { status: string; imei: string; serialNumber: string; dateAssigned: string; distributor: { name: string } }[];
}

interface CustomFieldDef {
  id: string;
  key: string;
  label: string;
}

interface SearchResult {
  indexNumber: string;
  fullName: string;
  className: string | null;
  admissionYear: string | null;
}

// Mirrors the server's INDEX_NUMBER_SYNONYMS (customFields.ts) — a custom
// field like this can only be leftover data from before that guard
// existed, and showing it here would just duplicate the real Index Number
// field above with a value that can silently drift from it.
const INDEX_NUMBER_SYNONYMS = new Set([
  "indexno",
  "indexnumber",
  "indexnum",
  "idno",
  "studentid",
  "studentindex",
  "admissionno",
  "admissionnumber",
]);
function isIndexNumberLike(f: { key: string; label: string }) {
  const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return INDEX_NUMBER_SYNONYMS.has(normalized(f.key)) || INDEX_NUMBER_SYNONYMS.has(normalized(f.label));
}

const READONLY_FIELDS: { key: keyof StudentRecord; label: string }[] = [
  { key: "fullName", label: "Full Name" },
  { key: "gender", label: "Gender" },
  { key: "className", label: "Class" },
  { key: "programme", label: "Programme" },
  { key: "house", label: "House / Hostel" },
  { key: "guardianName", label: "Guardian Name" },
  { key: "guardianContact", label: "Guardian Contact" },
  { key: "admissionYear", label: "Year Group (Batch)" },
];

export default function AssignmentForm() {
  const { user } = useAuth();
  const isAdmin = user?.role === "SUPER_ADMIN";
  const [query, setQuery] = useState("");
  const [student, setStudent] = useState<StudentRecord | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [customSaving, setCustomSaving] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [customSaved, setCustomSaved] = useState(false);

  useEffect(() => {
    apiGet("/custom-fields").then(setCustomFields).catch(() => setCustomFields([]));
  }, []);

  const [imei, setImei] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [embossmentNumber, setEmbossmentNumber] = useState("");
  const [dateAssigned, setDateAssigned] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadStudent(idx: string) {
    setSearchError(null);
    setSearching(true);
    try {
      const data: StudentRecord = await apiGet(`/students/${encodeURIComponent(idx)}`);
      setStudent(data);
      setSearchResults(null);
      const values: Record<string, string> = {};
      for (const f of customFields) values[f.key] = String(data.extraFields?.[f.key] ?? "");
      setCustomValues(values);
      setCustomSaved(false);
      setCustomError(null);
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchError(null);
    setMessage(null);
    setStudent(null);
    setSearchResults(null);
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const matches: SearchResult[] = await apiGet(`/students?q=${encodeURIComponent(q)}`);
      // Sorted by Index Number, then Name, so a list of matches (e.g.
      // several students sharing a surname) is easy to scan.
      const sorted = [...matches].sort(
        (a, b) => a.indexNumber.localeCompare(b.indexNumber) || a.fullName.localeCompare(b.fullName)
      );
      if (sorted.length === 0) {
        setSearchError("No student found matching that name or index number");
        setSearching(false);
        return;
      }
      if (sorted.length === 1) {
        await loadStudent(sorted[0].indexNumber);
        return;
      }
      setSearchResults(sorted);
      setSearching(false);
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : "Search failed");
      setSearching(false);
    }
  }

  async function saveCustomFields() {
    if (!student) return;
    setCustomSaving(true);
    setCustomError(null);
    setCustomSaved(false);
    try {
      const values: Record<string, string> = {};
      for (const f of customFields) values[f.key] = customValues[f.key]?.trim() || "";
      const updated = await apiSend("PATCH", `/students/${student.id}/custom-fields`, { values });
      setStudent({ ...student, ...updated });
      setCustomSaved(true);
    } catch (err) {
      setCustomError(err instanceof ApiError ? err.message : "Could not save these details");
    } finally {
      setCustomSaving(false);
    }
  }

  function startEditing() {
    if (!student) return;
    const values: Record<string, string> = {};
    for (const f of READONLY_FIELDS) values[String(f.key)] = (student[f.key] as string) || "";
    setEditValues(values);
    setEditError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!student) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const data: Record<string, string | null> = {};
      for (const f of READONLY_FIELDS) {
        const v = editValues[String(f.key)]?.trim() || "";
        data[String(f.key)] = v || null;
      }
      const updated = await apiSend("PATCH", `/students/${student.id}`, data);
      setStudent({ ...student, ...updated });
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Could not save changes");
    } finally {
      setEditSaving(false);
    }
  }

  function resetDeviceFields() {
    setImei("");
    setSerialNumber("");
    setEmbossmentNumber("");
    setDateAssigned(new Date().toISOString().slice(0, 10));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setMessage(null);
    if (!student) return;
    if (!imei.trim() || !serialNumber.trim()) {
      setFormError("Enter or scan the Device IMEI and Serial Number");
      return;
    }

    const body = {
      studentIndexNumber: student.indexNumber,
      imei: imei.trim(),
      serialNumber: serialNumber.trim(),
      embossmentNumber: embossmentNumber.trim() || undefined,
      dateAssigned,
    };

    setSubmitting(true);
    try {
      if (!isOnline()) {
        await queueAssignment("/assignments", body);
        setMessage("You are offline. This assignment has been saved on this device and will sync automatically once you're back online.");
        resetDeviceFields();
        setStudent(null);
        setQuery("");
      } else {
        await apiSend("POST", "/assignments", body);
        setMessage(`Device assigned to ${student.fullName}.`);
        resetDeviceFields();
        setStudent(null);
        setQuery("");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        // Network-level failure (server unreachable) rather than a rejected
        // request — fall back to the offline queue instead of losing the entry.
        await queueAssignment("/assignments", body);
        setMessage("Could not reach the server. Saved on this device and will sync automatically once connection returns.");
        resetDeviceFields();
        setStudent(null);
        setQuery("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const activeAssignment = student?.assignments.find((a) => a.status === "WITH_STUDENT");

  return (
    <div className="page">
      <h2>Assign Device to Student</h2>

      <form className="card search-row" onSubmit={handleSearch}>
        <div className="field grow">
          <label>Student Name or Index Number</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. JUASS-2026-0001 or Achiaa Margaret"
            required
          />
        </div>
        <button type="submit" className="btn-primary" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>
      {searchError && <p className="error-text">{searchError}</p>}

      {searchResults && (
        <div className="card">
          <h3>{searchResults.length} students match — pick one</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Index No.</th>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Year Group</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((r) => (
                  <tr key={r.indexNumber}>
                    <td>{r.indexNumber}</td>
                    <td>{r.fullName}</td>
                    <td>{r.className || "—"}</td>
                    <td>{r.admissionYear || "—"}</td>
                    <td>
                      <button className="btn-link" onClick={() => loadStudent(r.indexNumber)} disabled={searching}>
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {student && (
        <div className="card">
          <div className="form-header">
            <h3>{student.fullName}</h3>
            <div className="actions-cell">
              {activeAssignment && <StatusBadge status="WITH_STUDENT" />}
              {isAdmin && !editing && (
                <button type="button" className="btn-link" onClick={startEditing}>
                  Edit Details
                </button>
              )}
            </div>
          </div>

          {activeAssignment && (
            <p className="warn-text">
              This student already has an active device ({activeAssignment.serialNumber}). Use the Assignments page to
              record a replacement or return before assigning a new one here.
            </p>
          )}

          {editing ? (
            <>
              <p className="hint-text">
                Correcting anomalies in this student's record. This does not affect their index number — edit that from
                Student Records if it's wrong.
              </p>
              <div className="grid-2">
                <div className="field">
                  <label>Index Number</label>
                  <input type="text" value={student.indexNumber} readOnly />
                </div>
                {READONLY_FIELDS.map((f) => (
                  <div className="field" key={String(f.key)}>
                    <label>{f.label}</label>
                    <input
                      type="text"
                      value={editValues[String(f.key)] || ""}
                      onChange={(e) => setEditValues((v) => ({ ...v, [String(f.key)]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              {editError && <p className="error-text">{editError}</p>}
              <div className="actions-cell">
                <button type="button" className="btn-primary" onClick={saveEdit} disabled={editSaving}>
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setEditing(false)} disabled={editSaving}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="grid-2">
              <div className="field">
                <label>Index Number</label>
                <input type="text" value={student.indexNumber} readOnly />
              </div>
              {READONLY_FIELDS.map((f) => (
                <div className="field" key={String(f.key)}>
                  <label>{f.label}</label>
                  <input type="text" value={(student[f.key] as string) || "—"} readOnly />
                </div>
              ))}
              <div className="field">
                <label>Distributor Name</label>
                <input type="text" value={user?.name || ""} readOnly />
              </div>
            </div>
          )}

          {(() => {
            // Only fields genuinely missing for this student belong here —
            // the point is filling gaps while assigning, not re-editing data
            // that's already there (do that from Student Records instead).
            // Index-Number-like fields never belong here at all: Index
            // Number already has its own field above, and a second,
            // independently-typed copy can only drift out of sync with it.
            const missingCustomFields = customFields.filter((f) => {
              if (isIndexNumberLike(f)) return false;
              const val = student.extraFields?.[f.key];
              return val === undefined || val === null || String(val).trim() === "";
            });
            if (missingCustomFields.length === 0) return null;
            return (
              <div className="section-heading">
                <h4>Additional Details</h4>
                <p className="hint-text">
                  These fields aren't part of the admission data import and are still missing for this student — fill
                  in what you can. (Fields that already have data can be edited from Student Records instead.)
                </p>
                <div className="grid-2">
                  {missingCustomFields.map((f) => (
                    <div className="field" key={f.key}>
                      <label>{f.label}</label>
                      <input
                        type="text"
                        value={customValues[f.key] || ""}
                        onChange={(e) => {
                          setCustomValues((v) => ({ ...v, [f.key]: e.target.value }));
                          setCustomSaved(false);
                        }}
                      />
                    </div>
                  ))}
                </div>
                {customError && <p className="error-text">{customError}</p>}
                {customSaved && <p className="success-text">Saved.</p>}
                <button type="button" className="btn-secondary" onClick={saveCustomFields} disabled={customSaving}>
                  {customSaving ? "Saving…" : "Save Additional Details"}
                </button>
              </div>
            );
          })()}

          <form onSubmit={handleSubmit} className={activeAssignment ? "disabled-form" : undefined}>
            <h4>Device Details (recorded at distribution)</h4>
            <div className="grid-2">
              <ScanInput label="Device IMEI" value={imei} onChange={setImei} required />
              <ScanInput label="Serial Number" value={serialNumber} onChange={setSerialNumber} required />
              <div className="field">
                <label>Embossment Number</label>
                <input
                  type="text"
                  value={embossmentNumber}
                  onChange={(e) => setEmbossmentNumber(e.target.value)}
                  placeholder="Manually centered at distribution"
                />
              </div>
              <div className="field">
                <label>Date Assigned</label>
                <input type="date" value={dateAssigned} onChange={(e) => setDateAssigned(e.target.value)} />
              </div>
              <div className="field">
                <label>Replacement Date</label>
                <input type="text" value="" placeholder="Left blank until a replacement occurs" disabled />
              </div>
              <div className="field">
                <label>Returned Date</label>
                <input type="text" value="" placeholder="Left blank until the device is returned" disabled />
              </div>
            </div>

            {formError && <p className="error-text">{formError}</p>}
            {message && <p className="success-text">{message}</p>}

            <button type="submit" className="btn-primary" disabled={submitting || !!activeAssignment}>
              {submitting ? "Saving…" : "Assign Device"}
            </button>
          </form>
        </div>
      )}

      {!student && message && <p className="success-text">{message}</p>}
    </div>
  );
}
