"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/library";
import { X, Camera, AlertCircle, RefreshCcw } from "lucide-react";
import { IconBadge, buttonClassName, cx, eyebrowClassName, headingFont, iconButtonClassName } from "@/components/ui/kit";

export interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export function BarcodeScanner({ isOpen, onClose, onScan }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Cleanup when closed
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
        codeReaderRef.current = null;
      }
      // Defer state updates to avoid synchronous setState in effect
      setTimeout(() => {
        setError(null);
      }, 0);
      return;
    }

    // Initialize scanner when opened
    const initScanner = async () => {
      try {
        setError(null);

        // Check if we're in a secure context (required for camera access)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setError(
            "Camera access requires a secure connection (HTTPS). Please ensure you're accessing the app over HTTPS."
          );
          return;
        }

        const codeReader = codeReaderRef.current ?? new BrowserMultiFormatReader();
        codeReaderRef.current = codeReader;

        // Try to get available video input devices
        // On iOS Safari, this may fail, so we'll fall back to using undefined (default camera)
        let availableDevices: MediaDeviceInfo[] = [];

        try {
          availableDevices = await codeReader.listVideoInputDevices();
          setVideoDevices(availableDevices);
        } catch {
          // Device enumeration not supported (common on iOS Safari)
          // We'll use undefined to let the browser choose the default camera
          setVideoDevices([]);
          console.log("Device enumeration not supported, using default camera");
        }

        if (
          selectedDeviceId &&
          availableDevices.length > 0 &&
          !availableDevices.some((device) => device.deviceId === selectedDeviceId)
        ) {
          setSelectedDeviceId(availableDevices[0].deviceId);
          return;
        }

        if (!selectedDeviceId && availableDevices.length > 0) {
          setSelectedDeviceId(availableDevices[0].deviceId);
          return;
        }

        if (videoRef.current) {
          codeReader.reset();
          const activeDeviceId = selectedDeviceId ?? availableDevices[0]?.deviceId ?? null;

          // Start decoding from video stream
          // Using undefined as deviceId will use the default/back camera
          codeReader.decodeFromVideoDevice(
            activeDeviceId,
            videoRef.current,
            (result, err) => {
              if (result) {
                const barcode = result.getText();
                // Stop scanning after successful scan
                codeReader.reset();
                codeReaderRef.current = null;
                onScan(barcode);
                onClose();
              }
              if (err && !(err instanceof Error && err.name === "NotFoundException")) {
                // NotFoundException is expected when no barcode is detected
                // Only show other errors
                console.error("Scan error:", err);
              }
            }
          );
        }
      } catch (err) {
        console.error("Error initializing scanner:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to initialize camera. Please check permissions and try again."
        );
      }
    };

    initScanner();

    // Cleanup on unmount or close
    return () => {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
        codeReaderRef.current = null;
      }
    };
  }, [isOpen, onClose, onScan, selectedDeviceId]);

  const handleSwitchCamera = () => {
    if (videoDevices.length < 2) return;
    const currentIndex = videoDevices.findIndex(
      (device) => device.deviceId === selectedDeviceId
    );
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    setSelectedDeviceId(videoDevices[nextIndex].deviceId);
  };

  if (!isOpen) return null;

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scanner-title"
        className="animate-pop-in w-full max-w-2xl overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl dark:border-stone-800 dark:bg-stone-950"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
          <div className="min-w-0">
            <p className={eyebrowClassName}>Barcode</p>
            <h2
              id="barcode-scanner-title"
              className="mt-0.5 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100"
              style={headingFont}
            >
              Scan Barcode
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {videoDevices.length > 1 && (
              <button type="button" onClick={handleSwitchCamera} className={buttonClassName("ghost", "sm")}>
                <RefreshCcw className="h-4 w-4" strokeWidth={1.75} />
                Switch camera
              </button>
            )}
            <button type="button" onClick={onClose} className={cx(iconButtonClassName, "-mr-2 h-11 w-11")} aria-label="Close scanner">
              <X className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Scanner area */}
        <div className="px-5">
          <div className="relative overflow-hidden rounded-2xl bg-black">
            {error ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <IconBadge icon={AlertCircle} tone="warning" size="lg" />
                <p className="mt-4 max-w-sm text-sm text-stone-200">{error}</p>
                <button type="button" onClick={onClose} className={cx(buttonClassName("primary"), "mt-5")}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <video ref={videoRef} className="h-auto max-h-[60vh] w-full object-contain" playsInline muted />
                {/* Decorative framing guide over the live feed. */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-2/5 w-3/4 rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgb(0_0_0/0.25)]" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Instructions */}
        {!error ? (
          <div className="flex items-start gap-3 p-5">
            <IconBadge icon={Camera} tone="success" />
            <div className="text-sm">
              <p className="font-medium text-stone-900 dark:text-stone-100">Position the barcode within the frame</p>
              <p className="mt-0.5 text-stone-600 dark:text-stone-400">Make sure the barcode is clearly visible and well-lit</p>
            </div>
          </div>
        ) : (
          <div className="h-5" />
        )}
      </div>
    </div>
  );
}
