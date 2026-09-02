import { useState } from "react";
import { apiGet, apiUpload, ApiError } from "../api";
import { isOnline, queueIssue } from "../lib/offlineQueue";

interface AssignmentOption {
  id: string;
  imei: string;
  serialNumber: string;
  student: { indexNumber: string; fullName: string };
}

export default function ReportIssue() {
  const [indexNumber, setIndexNumber] = useState("");
  const [assignment, setAssignment] = useState<AssignmentOption | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [type, setType] = useState<"FAULTY" | "MISSING">("FAULTY");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearchError(null);
    setAssignment(null);
    setMessage(null);
    try {
      const student = await apiGet(`/students/${encodeURIComponent(indexNumber.trim())}`);
      const active = student.assignments.find((a: { status: string }) => a.status !== "RETURNED") || student.assignments[0];
      if (!active) {
        setSearchError("This student has no recorded device assignment yet.");
        return;
      }
      setAssignment({ id: active.id, imei: active.imei, serialNumber: active.serialNumber, student });
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : "Search failed");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setMessage(null);
    if (!assignment) return;
    if (description.trim().length < 3) {
      setFormError("Please describe the issue");
      return;
    }

    const fields = { type, assignmentId: assignment.id, description: description.trim() };
    setSubmitting(true);
    try {
      if (!isOnline()) {
        await queueIssue("/issues", fields, photo || undefined);
        setMessage("Offline: this report was saved on this device and will sync automatically once you're back online.");
      } else {
        const formData = new FormData();
        Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
        if (photo) formData.append("photo", photo);
        await apiUpload("POST", "/issues", formData);
        setMessage("Report submitted. The Admin will review it before it's finalized.");
      }
      setAssignment(null);
      setIndexNumber("");
      setDescription("");
      setPhoto(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        await queueIssue("/issues", fields, photo || undefined);
        setMessage("Could not reach the server. Saved on this device and will sync automatically once connection returns.");
        setAssignment(null);
        setDescription("");
        setPhoto(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h2>Report Faulty or Missing Tablet</h2>

      <form className="card search-row" onSubmit={search}>
        <div className="field grow">
          <label>Student Index Number</label>
          <input type="text" value={indexNumber} onChange={(e) => setIndexNumber(e.target.value)} required />
        </div>
        <button type="submit" className="btn-primary">
          Find Device
        </button>
      </form>
      {searchError && <p className="error-text">{searchError}</p>}

      {assignment && (
        <form className="card" onSubmit={submit}>
          <h3>{assignment.student.fullName}</h3>
          <p>
            Device: <strong>{assignment.serialNumber}</strong> (IMEI {assignment.imei})
          </p>

          <div className="field">
            <label>Report Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as "FAULTY" | "MISSING")}>
              <option value="FAULTY">Faulty / Damaged</option>
              <option value="MISSING">Missing / Lost</option>
            </select>
          </div>

          <div className="field">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe what happened to the device"
              required
            />
          </div>

          {type === "FAULTY" && (
            <div className="field">
              <label>Photo of Device Condition</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </div>
          )}

          {formError && <p className="error-text">{formError}</p>}
          {message && <p className="success-text">{message}</p>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Report"}
          </button>
          <p className="hint-text">This report needs Admin approval before it is finalized.</p>
        </form>
      )}

      {!assignment && message && <p className="success-text">{message}</p>}
    </div>
  );
}
