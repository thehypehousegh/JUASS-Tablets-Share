import { useState } from "react";
import BarcodeScannerModal from "./BarcodeScannerModal";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}

export default function ScanInput({ label, value, onChange, required, placeholder }: Props) {
  const [scanning, setScanning] = useState(false);

  return (
    <div className="field">
      <label>
        {label}
        {required ? " *" : ""}
      </label>
      <div className="scan-input-row">
        <input
          type="text"
          value={value}
          required={required}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="btn-icon"
          title={`Scan ${label} barcode`}
          aria-label={`Scan ${label} barcode`}
          onClick={() => setScanning(true)}
        >
          📷
        </button>
      </div>
      {scanning && (
        <BarcodeScannerModal
          title={`Scan ${label}`}
          onClose={() => setScanning(false)}
          onDetected={(text) => {
            onChange(text);
            setScanning(false);
          }}
        />
      )}
    </div>
  );
}
