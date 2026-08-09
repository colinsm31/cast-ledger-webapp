import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Tone = 'default' | 'danger';

interface DialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
}

interface DialogState extends DialogOptions {
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

  const confirm = useCallback(
    (options: DialogOptions) =>
      new Promise<boolean>((resolve) => setState({ ...options, mode: 'confirm', resolve })),
    [],
  );
  const alert = useCallback(
    (options: DialogOptions) =>
      new Promise<void>((resolve) =>
        setState({ ...options, mode: 'alert', resolve: () => resolve() }),
      ).then(() => undefined),
    [],
  );

  const close = useCallback(
    (value: boolean) => {
      setState((s) => {
        s?.resolve(value);
        return null;
      });
    },
    [],
  );

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => close(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {state.title && <h2 className="text-lg font-bold text-slate-900">{state.title}</h2>}
            <p className="mt-1 text-sm text-slate-600">{state.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              {state.mode === 'confirm' && (
                <button
                  onClick={() => close(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {state.cancelLabel ?? 'Cancel'}
                </button>
              )}
              <button
                autoFocus
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
