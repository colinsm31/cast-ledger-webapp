// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScannerCapture } from './useScannerCapture';

// MARK: - Helpers

/** Type `text` then Enter on `target`, 5 ms apart from `start`, like a scanner. */
function scan(target: EventTarget, text: string, start = 1000, init: KeyboardEventInit = {}) {
  [...text, 'Enter'].forEach((key, i) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    Object.defineProperty(event, 'timeStamp', { value: start + i * 5 });
    act(() => {
      target.dispatchEvent(event);
    });
  });
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

// MARK: - Tests

describe('useScannerCapture', () => {
  it('hands a scan outside any field to onScan', () => {
    const onScan = vi.fn();
    renderHook(() => useScannerCapture(onScan));
    scan(document.body, '012345678905');
    expect(onScan).toHaveBeenCalledWith('012345678905');
  });

  it('ignores typing in a field', () => {
    const onScan = vi.fn();
    renderHook(() => useScannerCapture(onScan));
    const input = document.body.appendChild(document.createElement('input'));
    scan(input, '012345678905');
    expect(onScan).not.toHaveBeenCalled();
  });

  it('ignores a scan while a dialog is open', () => {
    const onScan = vi.fn();
    renderHook(() => useScannerCapture(onScan));
    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const button = dialog.appendChild(document.createElement('button'));
    scan(button, '012345678905');
    expect(onScan).not.toHaveBeenCalled();

    dialog.remove();
    scan(document.body, '012345678905', 2000);
    expect(onScan).toHaveBeenCalledWith('012345678905');
  });

  it("uses when each key was pressed, so a slow page doesn't cut a code short", () => {
    const onScan = vi.fn();
    renderHook(() => useScannerCapture(onScan));
    // The page is busy for half a second mid-scan; the keys were still pressed 5 ms apart.
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(0).mockReturnValue(500);
    scan(document.body, 'GC-12345');
    now.mockRestore();
    expect(onScan).toHaveBeenCalledWith('GC-12345');
  });

  it('keeps characters typed with AltGr', () => {
    const onScan = vi.fn();
    renderHook(() => useScannerCapture(onScan));
    scan(document.body, 'A@B1', 1000, { ctrlKey: true, altKey: true, modifierAltGraph: true } as KeyboardEventInit);
    expect(onScan).toHaveBeenCalledWith('A@B1');
  });
});
