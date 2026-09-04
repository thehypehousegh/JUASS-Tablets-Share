// Mirrors server/src/utils/deviceCodes.ts — used here for live validation
// as the distributor types or scans, and to auto-route a scanned barcode
// to the right field regardless of which field's scan button opened the
// camera. The server re-validates independently; this is only for
// immediate feedback.
export const IMEI_LENGTH = 15;
export const SERIAL_LENGTH = 18;

export type DeviceCodeType = "IMEI" | "SERIAL" | "UNKNOWN";

export function classifyDeviceCode(raw: string): DeviceCodeType {
  const value = raw.trim();
  if (/^\d{15}$/.test(value)) return "IMEI";
  if (value.length === SERIAL_LENGTH && /^[A-Za-z0-9]+$/.test(value)) return "SERIAL";
  return "UNKNOWN";
}

export function imeiError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return "IMEI must contain digits only";
  if (v.length !== IMEI_LENGTH) return `IMEI must be exactly ${IMEI_LENGTH} digits (this is ${v.length})`;
  return null;
}

export function serialError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^[A-Za-z0-9]+$/.test(v)) return "Serial Number must contain only letters and numbers";
  if (v.length !== SERIAL_LENGTH) return `Serial Number must be exactly ${SERIAL_LENGTH} characters (this is ${v.length})`;
  return null;
}
