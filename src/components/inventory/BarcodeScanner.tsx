"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/library";
import { X, Camera, AlertCircle } from "lucide-react";

export interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export function BarcodeScanner({ isOpen, onClose, onScan }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

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
        setScanning(false);
      }, 0);
      return;
    }

    // Initialize scanner when opened
    const initScanner = async () => {
      try {
        setError(null);
        setScanning(true);

        // Check if we're in a secure context (required for camera access)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setError(
            "Camera access requires a secure connection (HTTPS). Please ensure you're accessing the app over HTTPS."
          );
          setScanning(false);
          return;
        }

        const codeReader = new BrowserMultiFormatReader();
        codeReaderRef.current = codeReader;

        // Try to get available video input devices
        // On iOS Safari, this may fail, so we'll fall back to using undefined (default camera)
        let selectedDeviceId: string | undefined = undefined;
        
        try {
          const videoInputDevices = await codeReader.listVideoInputDevices();
          if (videoInputDevices.length > 0) {
            selectedDeviceId = videoInputDevices[0].deviceId;
          }
        } catch {
          // Device enumeration not supported (common on iOS Safari)
          // We'll use undefined to let the browser choose the default camera
          console.log("Device enumeration not supported, using default camera");
        }

        if (videoRef.current) {
          // Start decoding from video stream
          // Using undefined as deviceId will use the default/back camera
          codeReader.decodeFromVideoDevice(
            selectedDeviceId ?? null,
            videoRef.current,
            (result, err) => {
              if (result) {
                const barcode = result.getText();
                // Stop scanning after successful scan
                codeReader.reset();
                codeReaderRef.current = null;
                setScanning(false);
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
        setScanning(false);
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
  }, [isOpen, onClose, onScan]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-white dark:bg-stone-950 rounded-lg border border-stone-200 dark:border-stone-800 w-full max-w-2xl mx-4 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-200 dark:border-stone-800">
          <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
            Scan Barcode
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-stone-100 dark:hover:bg-stone-900 text-stone-600 dark:text-stone-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scanner area */}
        <div className="relative bg-black p-4">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
              <p className="text-center text-stone-100 mb-4">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-auto max-h-[60vh] object-contain"
                playsInline
                muted
              />
            </>
          )}
        </div>

        {/* Instructions */}
        {!error && (
          <div className="p-4 bg-stone-50 dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800">
            <div className="flex items-start gap-3">
              <Camera className="w-5 h-5 text-stone-500 dark:text-stone-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-stone-600 dark:text-stone-400">
                <p className="font-medium mb-1">Position the barcode within the frame</p>
                <p>Make sure the barcode is clearly visible and well-lit</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

