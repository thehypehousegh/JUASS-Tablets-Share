import { useState } from "react";
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

const READONLY_FIELDS: { key: keyof StudentRecord; label: string }[] = [
  { key: "fullName", label: "Full Name" },
  { key: "gender", label: "Gender" },
  { key: "className", label: "Class" },
  { key: "programme", label: "Programme" },
  { key: "house", label: "House / Hostel" },
  { key: "guardianName", label: "Guardian Name" },
  { key: "guardianContact", label: "Guardian Contact" },
  { key: "admissionYear", label: "Admission Year" },
];

export default function AssignmentForm() {
  const { user } = useAuth();
  const [indexNumber, setIndexNumber] = useState("");
  const [student, setStudent] = useState<StudentRecord | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [imei, setImei] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [embossmentNumber, setEmbossmentNumber] = useState("");
  const [dateAssigned, setDateAssigned] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchError(null);
    setMessage(null);
    setStudent(null);
    if (!indexNumber.trim()) return;
    setSearching(true);
    try {
      const data = await apiGet(`/students/${encodeURIComponent(indexNumber.trim())}`);
      setStudent(data);
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : "Search failed");
    } finally {
      setSearching(false);
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
        setIndexNumber("");
      } else {
        await apiSend("POST", "/assignments", body);
        setMessage(`Device assigned to ${student.fullName}.`);
        resetDeviceFields();
        setStudent(null);
        setIndexNumber("");
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
        setIndexNumber("");
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
          <label>Student Index Number</label>
          <input
            type="text"
            value={indexNumber}
            onChange={(e) => setIndexNumber(e.target.value)}
            placeholder="e.g. JUASS-2026-0001"
            required
          />
        </div>
        <button type="submit" className="btn-primary" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>
      {searchError && <p className="error-text">{searchError}</p>}

      {student && (
        <div className="card">
          <div className="form-header">
            <h3>{student.fullName}</h3>
            {activeAssignment && <StatusBadge status="WITH_STUDENT" />}
          </div>

          {activeAssignment && (
            <p className="warn-text">
              This student already has an active device ({activeAssignment.serialNumber}). Use the Assignments page to
              record a replacement or return before assigning a new one here.
            </p>
          )}

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
