import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Html5Qrcode } from 'html5-qrcode';
import { CameraOff, Keyboard, Loader2, ScanLine } from 'lucide-react';
import { Button, Input, Modal } from '@/components/ui';

/** The DOM node html5-qrcode mounts the <video> into. Must be stable. */
const REGION_ID = 'gatepass-qr-region';

export interface QRScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

/**
 * The camera scanner. Two rules make this component correct rather than merely
 * working:
 *
 * 1. It fires `onScan` EXACTLY once per session and immediately stops the
 *    camera — html5-qrcode calls back on every decoded frame, and a guard
 *    double-submitting an exit is a real, physical mess to unwind.
 * 2. It always releases the MediaStream. The teardown runs on close AND on
 *    unmount, and swallows the rejection `stop()` throws when the scanner was
 *    never actually running — a leaked camera keeps the phone's LED on and
 *    blocks the next scan.
 */
export const QRScanner = ({ onScan, onClose, isOpen }: QRScannerProps) => {
  const [status, setStatus] = useState<'starting' | 'scanning' | 'denied'>('starting');
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Kept in refs so the camera effect depends only on `isOpen` — a new inline
  // `onScan` prop each render must not restart the camera.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const firedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return undefined;

    firedRef.current = false;
    setStatus('starting');
    setManualMode(false);
    setManualCode('');

    let disposed = false;
    const scanner = new Html5Qrcode(REGION_ID, false);

    /** Idempotent, never throws. Safe to call from the callback and the cleanup. */
    const release = () =>
      scanner
        .stop()
        .catch(() => undefined)
        .finally(() => {
          try {
            scanner.clear();
          } catch {
            /* Already cleared — nothing to release. */
          }
        });

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
        (decoded) => {
          if (firedRef.current) return;
          firedRef.current = true;
          void release();
          onScanRef.current(decoded.trim());
        },
        undefined // Per-frame decode failures are the normal case — stay quiet.
      )
      .then(() => {
        if (!disposed) setStatus('scanning');
      })
      .catch(() => {
        if (disposed) return;
        setStatus('denied');
        setManualMode(true);
      });

    return () => {
      disposed = true;
      void release();
    };
  }, [isOpen]);

  const submitManual = useCallback(() => {
    const code = manualCode.trim();
    if (code.length < 3 || firedRef.current) return;
    firedRef.current = true;
    onScan(code);
  }, [manualCode, onScan]);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Scan gate pass QR"
      description="Hold the employee's QR code inside the frame."
      icon={<ScanLine className="h-5 w-5" />}
      size="md"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          {!manualMode && status !== 'denied' && (
            <Button
              variant="subtle"
              size="lg"
              leftIcon={<Keyboard className="h-4 w-4" />}
              onClick={() => setManualMode(true)}
            >
              Type the code instead
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* ── Camera ─────────────────────────────────────────────────────── */}
        <div
          className={
            status === 'denied'
              ? 'hidden'
              : 'relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl bg-surface-sunken ring-1 ring-line'
          }
        >
          {/* html5-qrcode owns this node's children — never render into it. */}
          <div id={REGION_ID} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

          {status === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-content-muted">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm font-medium">Starting the camera…</p>
            </div>
          )}

          {/* Reticle: four corners + a sweeping line. Purely decorative. */}
          {status === 'scanning' && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-6 rounded-xl">
                <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-xl border-l-4 border-t-4 border-brand-400" />
                <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-xl border-r-4 border-t-4 border-brand-400" />
                <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-xl border-b-4 border-l-4 border-brand-400" />
                <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-xl border-b-4 border-r-4 border-brand-400" />

                <motion.span
                  initial={{ top: '0%' }}
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-x-0 h-0.5 bg-brand-400 shadow-glow"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Camera blocked ─────────────────────────────────────────────── */}
        {status === 'denied' && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger-500/30 bg-danger-500/10 p-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-500/15 text-danger-500">
              <CameraOff className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-content">Camera unavailable</p>
              <p className="mt-1 text-sm text-content-muted">
                Permission was denied or no camera was found. Allow camera access in the browser, or
                type the gate pass number below.
              </p>
            </div>
          </div>
        )}

        {/* ── Manual fallback ────────────────────────────────────────────── */}
        {manualMode && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitManual();
            }}
            className="space-y-3"
          >
            <Input
              autoFocus
              label="Gate pass number or employee code"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="GP-2026-000123"
              className="h-12 text-base"
            />
            <Button type="submit" size="lg" fullWidth disabled={manualCode.trim().length < 3}>
              Verify code
            </Button>
          </form>
        )}
      </div>
    </Modal>
  );
};

export default QRScanner;
