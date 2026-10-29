// Pure scanner-burst detection, kept free of the DOM so it can be unit tested.
// Scanners act like a keyboard: they type the code very fast, then send Enter.

// MARK: - Constants

export const ScanConstants = {
  /** Keystrokes further apart than this are typing, not a scanner burst. */
  maxGapMs: 100,
  /** A burst shorter than this is a stray key plus Enter, not a scan (#40). */
  minCodeLength: 4,
};

// MARK: - Types

/** The parts of a KeyboardEvent the buffer looks at. */
export interface ScanKey {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export interface ScanBuffer {
  /**
   * Feed one keystroke at time `now` (ms). Returns the scanned code when this
   * key is the Enter that completes a scan, otherwise null.
   */
  feed: (key: ScanKey, now: number) => string | null;
}

// MARK: - Buffer

export function createScanBuffer(): ScanBuffer {
  let text = '';
  let last = Number.NEGATIVE_INFINITY;

  return {
    feed(key, now) {
      // Shortcuts like Cmd/Ctrl+C aren't scanned characters (#40).
      if (key.ctrlKey || key.metaKey || key.altKey) {
        text = '';
        return null;
      }
      if (now - last > ScanConstants.maxGapMs) text = '';
      last = now;

      if (key.key === 'Enter') {
        const code = text;
        text = '';
        return code.length >= ScanConstants.minCodeLength ? code : null;
      }
      if (key.key.length === 1) text += key.key;
      return null;
    },
  };
}
