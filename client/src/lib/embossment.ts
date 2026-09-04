// Mirrors server/src/utils/embossment.ts — used here only to show a live
// preview as the distributor types; the server is the source of truth and
// builds the value actually stored.
const EMBOSSMENT_PREFIX = "JUASS/SM1";

export function embossmentYearSuffix(admissionYear: string | null | undefined): string | null {
  const trimmed = admissionYear?.trim();
  if (!trimmed || trimmed.length < 2) return null;
  return trimmed.slice(-2);
}

export function previewEmbossmentNumber(admissionYear: string | null | undefined, deviceNumber: string): string | null {
  const yearSuffix = embossmentYearSuffix(admissionYear);
  const digits = deviceNumber.trim().replace(/\D/g, "");
  if (!yearSuffix || !digits) return null;
  return `${EMBOSSMENT_PREFIX}/${yearSuffix}/${digits.padStart(4, "0")}`;
}
