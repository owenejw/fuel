"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Button, Input } from "./ui";
import { IconClose } from "./icons";

/**
 * Full-screen camera barcode scanner using ZXing (Safari has no reliable
 * BarcodeDetector). Falls back to typing the number.
 */
export function Scanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const done = useRef(false);

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let cancelled = false;
    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
        if (cancelled || !videoRef.current) return;
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          videoRef.current,
          (result, _err, ctl) => {
            if (!result || done.current) return;
            done.current = true;
            ctl.stop();
            navigator.vibrate?.(40);
            onDetected(result.getText());
          },
        );
        if (cancelled) controls.stop();
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in Settings → Safari → Camera, or type the barcode below."
            : "Couldn't start the camera. Type the barcode below instead.",
        );
      }
    })();
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="pt-safe flex items-center justify-between px-4 py-3">
        <span className="font-medium">Scan a barcode</span>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2" aria-label="Close scanner">
          <IconClose />
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-72 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        {error && <p className="absolute inset-x-4 top-4 rounded-xl bg-black/80 p-3 text-sm">{error}</p>}
      </div>
      <form
        className="pb-safe flex gap-2 bg-black p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const code = manual.replace(/\D/g, "");
          if (code) onDetected(code);
        }}
      >
        <Input
          className="flex-1 [&_input]:border-white/20 [&_input]:bg-white/10 [&_input]:text-white"
          placeholder="Or type the barcode number"
          inputMode="numeric"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <Button type="submit" disabled={!manual}>
          Look up
        </Button>
      </form>
    </div>
  );
}
