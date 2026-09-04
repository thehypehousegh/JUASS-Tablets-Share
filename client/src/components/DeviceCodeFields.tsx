import { useRef, useState } from "react";
import BarcodeScannerModal from "./BarcodeScannerModal";
import { classifyDeviceCode, IMEI_LENGTH, SERIAL_LENGTH, imeiError, serialError } from "../lib/deviceCodes";

interface Props {
  imei: string;
  onImeiChange: (value: string) => void;
  serialNumber: string;
  onSerialChange: (value: string) => void;
  required?: boolean;
}

// A device label carries two separate barcodes — IMEI and Serial Number —
// so scanning either field's button opens the same session: each scanned
// code is classified by its own format (IMEI: 15 digits; Serial Number:
// SERIAL_LENGTH alphanumeric characters) and routed to the matching field
// regardless of which button was pressed, and the session keeps scanning
// until both fields that were empty when it opened are filled.
export default function DeviceCodeFields({ imei, onImeiChange, serialNumber, onSerialChange, required }: Props) {
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const imeiRef = useRef(imei);
  const serialRef = useRef(serialNumber);
  imeiRef.current = imei;
  serialRef.current = serialNumber;
  const neededRef = useRef({ imei: false, serial: false });

  function startScan() {
    neededRef.current = { imei: !imeiRef.current.trim(), serial: !serialRef.current.trim() };
    setScanNote(null);
    setScanning(true);
  }

  function handleDetected(text: string) {
    const type = classifyDeviceCode(text);
    if (type === "IMEI") {
      onImeiChange(text);
      neededRef.current.imei = false;
      setScanNote(`Captured IMEI: ${text}`);
    } else if (type === "SERIAL") {
      onSerialChange(text);
      neededRef.current.serial = false;
      setScanNote(`Captured Serial Number: ${text}`);
    } else {
      setScanNote(
        `Scanned code doesn't match a known IMEI (${IMEI_LENGTH} digits) or Serial Number (${SERIAL_LENGTH} characters) format — try the other barcode on the label.`
      );
      return;
    }
    if (!neededRef.current.imei && !neededRef.current.serial) {
      setScanning(false);
    }
  }

  const imeiErr = imeiError(imei);
  const serialErr = serialError(serialNumber);

  return (
    <>
      <div className="field">
        <label>
          Device IMEI
          {required ? " *" : ""}
        </label>
        <div className="scan-input-row">
          <input
            type="text"
            value={imei}
            required={required}
            onChange={(e) => onImeiChange(e.target.value)}
          />
          <button type="button" className="btn-icon" title="Scan device label" aria-label="Scan device label" onClick={startScan}>
            📷
          </button>
        </div>
        {imeiErr && <p className="error-text">{imeiErr}</p>}
      </div>
      <div className="field">
        <label>
          Serial Number
          {required ? " *" : ""}
        </label>
        <div className="scan-input-row">
          <input
            type="text"
            value={serialNumber}
            required={required}
            onChange={(e) => onSerialChange(e.target.value)}
          />
          <button type="button" className="btn-icon" title="Scan device label" aria-label="Scan device label" onClick={startScan}>
            📷
          </button>
        </div>
        {serialErr && <p className="error-text">{serialErr}</p>}
      </div>
      {scanning && (
        <BarcodeScannerModal
          title="Scan Device Label"
          hint="Point the camera at either barcode — IMEI and Serial Number are recognized automatically and filled into the right field. Scan the other barcode too to fill both in one go."
          onDetected={handleDetected}
          onClose={() => setScanning(false)}
        />
      )}
      {scanNote && !scanning && <p className="hint-text">{scanNote}</p>}
    </>
  );
}
