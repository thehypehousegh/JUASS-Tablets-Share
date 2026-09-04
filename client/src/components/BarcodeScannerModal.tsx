import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

interface Props {
  title: string;
  // Called once per distinct decoded value (repeat frames of the same code
  // are deduped here, not re-reported). Scanning keeps running after a
  // detection — the caller decides when to close (e.g. once every field it
  // needed has been filled), since a device label can carry more than one
  // barcode that all need to be scanned in one session.
  onDetected: (text: string) => void;
  onClose: () => void;
  hint?: string;
}

export default function BarcodeScannerModal({ title, onDetected, onClose, hint }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastTextRef = useRef<string | null>(null);
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  // Deliberately empty deps — this opens the camera once per modal mount.
  // onDetected is read through a ref (updated above) so a new function
  // identity from the caller never tears down and restarts the stream.
  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current!,
        (result, _err, controls) => {
          if (cancelled) return;
          controlsRef.current = controls;
          if (result) {
            const text = result.getText();
            if (text !== lastTextRef.current) {
              lastTextRef.current = text;
              onDetectedRef.current(text);
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <p className="hint-text">{hint ?? "Point the camera at the barcode printed on the device label."}</p>
          </>
        )}
        <button type="button" className="btn-secondary" onClick={onClose}>
          {error ? "Close" : "Done"}
        </button>
      </div>
    </div>
  );
}
