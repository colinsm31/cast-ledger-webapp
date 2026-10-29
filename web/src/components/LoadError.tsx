// A failed load, with a button to try again.
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
      <p className="text-sm text-red-700">{message}</p>
      <button
        onClick={onRetry}
        className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-100"
      >
        Retry
      </button>
    </div>
  );
}
