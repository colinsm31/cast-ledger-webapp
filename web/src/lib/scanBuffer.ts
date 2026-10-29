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
  /** AltGr held (KeyboardEvent.getModifierState('AltGraph')): types characters like @ on many keyboards. */
  altGraph?: boolean;
}

export interface ScanBuffer {
  /**
   * Feed one keystroke pressed at time `now` (ms; pass the event's timeStamp,
   * so a slow screen update doesn't stretch the gaps). Returns the scanned
   * code when this key is the Enter that completes a scan, otherwise null.
   */
  feed: (key: ScanKey, now: number) => string | null;
}

// MARK: - Buffer

export function createScanBuffer(): ScanBuffer {
  let text = '';
  let last = Number.NEGATIVE_INFINITY;

  return {
    feed(key, now) {
      // Shortcuts like Cmd/Ctrl+C aren't scanned characters (#40), and are
      // skipped without losing the scan so far (#12). AltGr (which browsers
      // can report as Ctrl+Alt) types real characters, so it isn't a shortcut.
      if (!key.altGraph && (key.ctrlKey || key.metaKey || key.altKey)) return null;
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
