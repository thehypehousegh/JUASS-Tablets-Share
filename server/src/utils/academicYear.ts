// Ghana's school year starts in September, and this SHS program runs 3
// years (Form 1 → Form 2 → Form 3). Year Group is stored as the calendar
// year admission happened in (e.g. "2025"), so a student's current Form is
// derived from how many September-to-September academic years have passed
// since then — not a plain calendar-year subtraction, which would put a
// student in the wrong Form for part of each year.

export type FormStatus = "FORM_1" | "FORM_2" | "FORM_3" | "COMPLETED" | "UNKNOWN";

export const FORM_LABELS: Record<FormStatus, string> = {
  FORM_1: "Form 1",
  FORM_2: "Form 2",
  FORM_3: "Form 3",
  COMPLETED: "Completed",
  UNKNOWN: "Unknown",
};

// The calendar year the current academic year started in. A date in
// Sep-Dec belongs to the academic year that started that same calendar
// year; a date in Jan-Aug belongs to the one that started the previous
// calendar year.
export function academicYearStart(date: Date = new Date()): number {
  const SEPTEMBER = 8; // Date#getMonth() is 0-indexed
  return date.getMonth() >= SEPTEMBER ? date.getFullYear() : date.getFullYear() - 1;
}

export function computeFormStatus(admissionYear: string | null | undefined, now: Date = new Date()): FormStatus {
  const admissionYearNum = admissionYear ? parseInt(admissionYear, 10) : NaN;
  if (!admissionYear || isNaN(admissionYearNum)) return "UNKNOWN";
  const yearsSince = academicYearStart(now) - admissionYearNum;
  if (yearsSince <= 0) return "FORM_1";
  if (yearsSince === 1) return "FORM_2";
  if (yearsSince === 2) return "FORM_3";
  return "COMPLETED";
}

export function isCompleted(admissionYear: string | null | undefined, now: Date = new Date()): boolean {
  return computeFormStatus(admissionYear, now) === "COMPLETED";
}
