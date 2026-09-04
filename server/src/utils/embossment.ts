// Embossment numbers follow a fixed school code: "JUASS/SM1/<YY>/<NNNN>",
// where YY is the last two digits of the student's Year Group and NNNN is
// a distributor-entered device number, zero-padded to 4 digits. The
// distributor only ever types the device number — this builds the full
// code from that plus the student's own Year Group, so the year segment
// can never drift from the student it's actually assigned to.
const EMBOSSMENT_PREFIX = "JUASS/SM1";

export type BuildEmbossmentResult = { ok: true; value: string } | { ok: false; error: string };

export function buildEmbossmentNumber(
  admissionYear: string | null | undefined,
  deviceNumber: string
): BuildEmbossmentResult {
  const digits = deviceNumber.trim().replace(/\D/g, "");
  if (!digits) return { ok: false, error: "Enter the device number for the embossment code" };
  if (!admissionYear || admissionYear.trim().length < 2) {
    return { ok: false, error: "This student's Year Group must be set before an embossment number can be generated" };
  }
  const yearSuffix = admissionYear.trim().slice(-2);
  const paddedDeviceNumber = digits.padStart(4, "0");
  return { ok: true, value: `${EMBOSSMENT_PREFIX}/${yearSuffix}/${paddedDeviceNumber}` };
}
