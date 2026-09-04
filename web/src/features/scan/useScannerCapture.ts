import { useEffect, useRef, type RefObject } from 'react';

// MARK: - Constants

const ScannerConstants = {
  /** Keystrokes further apart than this are typing, not a scanner burst. */
  maxGapMs: 100,
};

// MARK: - Hook

/**
 * Capture hardware-scanner input anywhere on the screen. Scanners act like a
 * keyboard: they type the code very fast and then send Enter. We buffer
 * rapid keystrokes that land outside form fields and hand the completed code
 * to `onScan`.
 *
 * Keystrokes inside any input/textarea/select (or an editable element) are
 * ignored so normal typing is unaffected; a focused scan box handles its own
 * Enter. Pass `ignoreRef` for the screen's dedicated scan input when it has one.
 */
export function useScannerCapture(
  onScan: (code: string) => void,
  ignoreRef?: RefObject<HTMLInputElement | null>,
): void {
  // Always call the latest handler without re-binding the listener.
  const handlerRef = useRef(onScan);
  handlerRef.current = onScan;

  useEffect(() => {
    const buffer = { text: '', last: 0 };

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (ignoreRef && target === ignoreRef.current) return;
      if (isTypingTarget(target)) return;

      const now = Date.now();
      if (now - buffer.last > ScannerConstants.maxGapMs) buffer.text = '';
      buffer.last = now;

      if (e.key === 'Enter') {
        const code = buffer.text;
        buffer.text = '';
        if (code) {
          e.preventDefault();
          handlerRef.current(code);
        }
        return;
      }
      if (e.key.length === 1) buffer.text += e.key;
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
