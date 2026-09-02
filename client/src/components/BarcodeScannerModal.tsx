import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

interface Props {
  title: string;
  onDetected: (text: string) => void;
  onClose: () => void;
}

export default function BarcodeScannerModal({ title, onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current!,
        (result, err, controls) => {
          if (cancelled) return;
          controlsRef.current = controls;
          if (result) {
            const text = result.getText();
            controls.stop();
            onDetected(text);
          }
          // NotFoundException fires continuously while scanning; ignore it.
        }
      )
      .catch((e: unknown) => {
        setError(
          "Could not access the camera. Check camera permissions, or type the number in manually."
        );
        console.error(e);
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [onDetected]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close scanner">
            ✕
          </button>
        </div>
        {error ? (
          <p className="error-text">{error}</p>
        ) : (
          <>
            <video ref={videoRef} className="scanner-video" muted playsInline />
            <p className="hint-text">Point the camera at the barcode printed on the device label.</p>
          </>
        )}
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
