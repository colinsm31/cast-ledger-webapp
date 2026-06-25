import type { ReactNode } from 'react';

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
      <h2 className="text-lg font-semibold text-slate-700">{title}</h2>
      {message && <p className="text-sm text-slate-500 max-w-sm">{message}</p>}
      {action}
    </div>
  );
}
