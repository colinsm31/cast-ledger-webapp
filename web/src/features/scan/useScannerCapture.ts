import { useEffect, useRef, type RefObject } from 'react';
import { createScanBuffer } from '../../lib/scanBuffer';

// MARK: - Hook

/**
 * Capture hardware-scanner input anywhere on the screen. Scanners act like a
 * keyboard: they type the code very fast and then send Enter. We buffer
 * rapid keystrokes that land outside form fields and hand the completed code
 * to `onScan` (see `createScanBuffer` for what counts as a scan).
 *
 * Keystrokes inside any input/textarea/select (or an editable element) are
 * ignored so normal typing is unaffected; a focused scan box handles its own
 * Enter. Pass `ignoreRef` for the screen's dedicated scan input when it has one.
 * Nothing is captured while a dialog is open, so a scan can't act on the page
 * behind it (#39).
 */
export function useScannerCapture(
  onScan: (code: string) => void,
  ignoreRef?: RefObject<HTMLInputElement | null>,
): void {
  // Always call the latest handler without re-binding the listener.
  const handlerRef = useRef(onScan);
  handlerRef.current = onScan;

  useEffect(() => {
    const buffer = createScanBuffer();

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (ignoreRef && target === ignoreRef.current) return;
      if (isTypingTarget(target) || isDialogOpen()) return;

      const code = buffer.feed(e, Date.now());
      if (code) {
        e.preventDefault();
        handlerRef.current(code);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ignoreRef]);
}

// MARK: - Private Helpers

function isTypingTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}
