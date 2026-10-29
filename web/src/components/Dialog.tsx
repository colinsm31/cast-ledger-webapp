import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

type Tone = 'default' | 'danger';

interface DialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
}

interface DialogState extends DialogOptions {
  /** Changes with each dialog, so a replacement remounts and takes focus. */
  id: number;
  mode: 'confirm' | 'alert';
  resolve: (value: boolean) => void;
}

interface DialogApi {
  // Yes/No — resolves true if confirmed.
  confirm: (options: DialogOptions) => Promise<boolean>;
  // Single-button warning/notice — resolves when dismissed.
  alert: (options: DialogOptions) => Promise<void>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within a DialogProvider');
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  // The open dialog, readable synchronously so a second dialog can answer the
  // first one, and the element that had focus before, to return it on close.
  const openRef = useRef<DialogState | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(0);

  const show = useCallback((options: Omit<DialogState, 'id'>) => {
    const next = { ...options, id: ++nextIdRef.current };
    if (openRef.current) {
      // Only one dialog at a time: the one already showing is cancelled so
      // whoever is waiting on it doesn't hang (#39).
      openRef.current.resolve(false);
    } else {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
    }
    openRef.current = next;
    setState(next);
  }, []);

  const confirm = useCallback(
    (options: DialogOptions) =>
      new Promise<boolean>((resolve) => show({ ...options, mode: 'confirm', resolve })),
    [show],
  );
  const alert = useCallback(
    (options: DialogOptions) =>
      new Promise<void>((resolve) => show({ ...options, mode: 'alert', resolve: () => resolve() })),
    [show],
  );

  const close = useCallback((value: boolean) => {
    const current = openRef.current;
    if (!current) return;
    openRef.current = null;
    setState(null);
    current.resolve(value);
  }, []);

  // Give focus back to where it was once the dialog is gone, unless the code
  // that opened it has already moved focus somewhere else.
  useEffect(() => {
    if (state) return;
    const active = document.activeElement;
    if (!active || active === document.body) returnFocusRef.current?.focus();
    returnFocusRef.current = null;
  }, [state]);

  // Escape cancels; Tab and Shift+Tab stay on the dialog's buttons (#39).
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const buttons = Array.from(panelRef.current?.querySelectorAll('button') ?? []);
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.shiftKey ? -1 : 1;
    const next = buttons[(index + step + buttons.length) % buttons.length];
    e.preventDefault();
    next.focus();
  }

  // On a danger dialog Cancel has focus, so a stray Enter (or a scanner's
  // Enter) doesn't delete anything (#39).
  const focusCancel = state?.mode === 'confirm' && state.tone === 'danger';

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => close(false)}
        >
          <div
            key={state.id}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={state.title ?? state.message}
            onKeyDown={onKeyDown}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {state.title && <h2 className="text-lg font-bold text-slate-900">{state.title}</h2>}
            <p className="mt-1 text-sm text-slate-600">{state.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              {state.mode === 'confirm' && (
                <button
                  autoFocus={focusCancel}
                  onClick={() => close(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {state.cancelLabel ?? 'Cancel'}
                </button>
              )}
              <button
                autoFocus={!focusCancel}
                onClick={() => close(true)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                  state.tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {state.confirmLabel ?? (state.mode === 'alert' ? 'OK' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
