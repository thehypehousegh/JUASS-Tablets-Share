// IMEI is a well-known standard: exactly 15 digits, no letters. Serial
// Number's fixed length is specific to this school's tablet batch (see the
// device label format the school supplied) — both are enforced here so a
// mistyped or misscanned code is caught before it reaches the database,
// and mirrored in client/src/lib/deviceCodes.ts for live-typing feedback.
export const IMEI_LENGTH = 15;
export const SERIAL_LENGTH = 18;

export type DeviceCodeType = "IMEI" | "SERIAL" | "UNKNOWN";

// Used by the scan-to-fill flow to route a scanned barcode to the right
// field regardless of which field's scan button was pressed.
export function classifyDeviceCode(raw: string): DeviceCodeType {
  const value = raw.trim();
  if (/^\d{15}$/.test(value)) return "IMEI";
  if (value.length === SERIAL_LENGTH && /^[A-Za-z0-9]+$/.test(value)) return "SERIAL";
  return "UNKNOWN";
}

export function imeiError(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter the device IMEI";
  if (!/^\d+$/.test(v)) return "IMEI must contain digits only";
  if (v.length !== IMEI_LENGTH) return `IMEI must be exactly ${IMEI_LENGTH} digits (this is ${v.length})`;
  return null;
}

export function serialError(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter the device Serial Number";
  if (!/^[A-Za-z0-9]+$/.test(v)) return "Serial Number must contain only letters and numbers";
  if (v.length !== SERIAL_LENGTH) return `Serial Number must be exactly ${SERIAL_LENGTH} characters (this is ${v.length})`;
  return null;
}
