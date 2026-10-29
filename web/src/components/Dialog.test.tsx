// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DialogProvider, useDialog } from './Dialog';

// MARK: - Helpers

let dialogs: ReturnType<typeof useDialog>;

function Page() {
  dialogs = useDialog();
  return <button>Behind</button>;
}

function renderPage() {
  render(
    <DialogProvider>
      <Page />
    </DialogProvider>,
  );
}

/** Open a confirm dialog; returns its answer as a promise. */
function openConfirm(tone?: 'danger') {
  let answer!: Promise<boolean>;
  act(() => {
    answer = dialogs.confirm({ title: 'Cancel sale?', message: 'Discard the ticket.', cancelLabel: 'Keep', tone });
  });
  return answer;
}

/** Dispatch a keydown at `timeStamp` ms; returns whether it was cancelled (its default stopped). */
function pressKey(target: Element, key: string, timeStamp: number, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  act(() => {
    target.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

const focusedText = () => document.activeElement?.textContent;

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

// MARK: - Tests

describe('Dialog', () => {
  it('Escape cancels', async () => {
    renderPage();
    const answer = openConfirm();
    pressKey(screen.getByRole('dialog'), 'Escape', 0);
    await expect(answer).resolves.toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('focuses Cancel on a danger dialog, and Confirm otherwise', () => {
    renderPage();
    void openConfirm('danger');
    expect(focusedText()).toBe('Keep');
    pressKey(screen.getByRole('dialog'), 'Escape', 0);

    void openConfirm();
    expect(focusedText()).toBe('Confirm');
  });

  it('keeps Tab and Shift+Tab on its buttons', () => {
    renderPage();
    void openConfirm('danger');
    pressKey(document.activeElement!, 'Tab', 0);
    expect(focusedText()).toBe('Confirm');
    pressKey(document.activeElement!, 'Tab', 0);
    expect(focusedText()).toBe('Keep');
    pressKey(document.activeElement!, 'Tab', 0, { shiftKey: true });
    expect(focusedText()).toBe('Confirm');
  });

  it('still handles Escape and Tab after a click on its text', async () => {
    renderPage();
    const answer = openConfirm('danger');
    const dialog = screen.getByRole('dialog');
    // A click on the text focuses the dialog itself (it's focusable).
    expect(dialog.getAttribute('tabindex')).toBe('-1');
    act(() => dialog.focus());
    pressKey(dialog, 'Tab', 0, { shiftKey: true });
    expect(focusedText()).toBe('Confirm');
    act(() => dialog.focus());
    pressKey(dialog, 'Tab', 0);
    expect(focusedText()).toBe('Keep');
    act(() => dialog.focus());
    pressKey(dialog, 'Escape', 0);
    await expect(answer).resolves.toBe(false);
  });

  it("ignores a scanner's Enter but not a person's", () => {
    renderPage();
    void openConfirm();
    const button = document.activeElement!;
    for (const [i, key] of [...'123456789'].entries()) pressKey(button, key, 1000 + i * 5);
    expect(pressKey(button, 'Enter', 1050)).toBe(true);
    // A deliberate Enter, well after any typing, is left alone (it presses the button).
    expect(pressKey(button, 'Enter', 2000)).toBe(false);
  });

  it('cancels the first dialog when a second one opens', async () => {
    renderPage();
    const first = openConfirm();
    void openConfirm('danger');
    await expect(first).resolves.toBe(false);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it("stops the page behind from scrolling while it's open", async () => {
    renderPage();
    const answer = openConfirm();
    expect(document.body.style.overflow).toBe('hidden');
    pressKey(screen.getByRole('dialog'), 'Escape', 0);
    await answer;
    expect(document.body.style.overflow).toBe('');
  });

  it('gives focus back to where it was', async () => {
    renderPage();
    const behind = screen.getByText('Behind');
    act(() => behind.focus());
    const answer = openConfirm();
    pressKey(screen.getByRole('dialog'), 'Escape', 0);
    await answer;
    expect(document.activeElement).toBe(behind);
  });
});
